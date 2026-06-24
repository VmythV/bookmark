import './style.css';
import { capturePageInfo } from '@/lib/services/page';

/**
 * Floating in-page button. When clicked, opens the action popup so the user
 * can review + tag + save the current page. Kept lightweight so it doesn't
 * inject heavy UI or interfere with the page (shadow DOM isolation).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Skip on pages that don't expose a useful URL (chrome://, about:, etc.
    // are already excluded by <all_urls>, but guard anyway).
    if (!location.href.startsWith('http')) return;
    if (ctx.isInvalid) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'smart-bookmark-fab',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const btn = document.createElement('button');
        btn.className = 'sb-fab';
        btn.setAttribute('aria-label', 'Save to Smart Bookmark');
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
        btn.addEventListener('click', () => void onClick());
        container.append(btn);
      },
    });
    ui.mount();

    // Also handle the Ctrl+B / Cmd+B quick-save command: open the popup.
    // (Commands registered in wxt.config.webExt.commands are delivered here.)
    chrome.commands?.onCommand?.addListener((cmd) => {
      if (cmd === 'quick-save' || cmd === '_execute_action') {
        void chrome.runtime.sendMessage({
          target: 'capture-page',
          page: capturePageInfo(),
        });
        chrome.action.openPopup?.();
      }
    });
  },
});

async function onClick(): Promise<void> {
  // Store the page info transiently so the popup can pick it up without
  // re-querying tabs (avoids a round-trip).
  await chrome.runtime.sendMessage({
    target: 'capture-page',
    page: capturePageInfo(),
  });
  await chrome.action.openPopup();
}