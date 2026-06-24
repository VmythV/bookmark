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
  // Don't run on restricted pages where we cannot meaningfully save.
  excludeMatches: [
    'chrome://*/*',
    'edge://*/*',
    'about:*',
    'devtools://*/*',
  ],

  async main(ctx) {
    // Skip on pages that don't expose a useful URL.
    if (!location.href.startsWith('http')) return;
    if (ctx.isInvalid) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'smart-bookmark-fab',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const btn = document.createElement('button');
        btn.className = 'sb-fab';
        btn.title = 'Save to Smart Bookmark';
        btn.textContent = '🔖';
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