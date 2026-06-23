import './style.css';
import { sendMessage } from '@/lib/shared/messages';
import { capturePageInfo } from '@/lib/services/page';

/**
 * Floating in-page save button, injected in an isolated Shadow DOM so it never
 * inherits or pollutes host page styles. See docs/detailed-design.md §2, §5.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'smart-bookmark-button',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const btn = document.createElement('button');
        btn.className = 'sb-fab';
        btn.title = 'Save to Smart Bookmark';
        btn.textContent = '🔖';
        btn.addEventListener('click', () => void onClick(btn));
        container.append(btn);
        return btn;
      },
    });
    ui.mount();
  },
});

async function onClick(btn: HTMLButtonElement): Promise<void> {
  const reset = setBusy(btn, '⏳');
  try {
    const page = capturePageInfo();
    // M1: capture → recommend → confirm in one shot (save to default folder).
    // M3 will surface the recommendation in a panel before confirming.
    const { recommendation } = await sendMessage({ type: 'SAVE_REQUEST', page });
    await sendMessage({ type: 'SAVE_CONFIRM', page, recommendation });
    flash(btn, '✅');
  } catch (err) {
    console.error('[smart-bookmark]', err);
    flash(btn, '⚠️');
  } finally {
    reset();
  }
}

function setBusy(btn: HTMLButtonElement, label: string): () => void {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  return () => {
    btn.disabled = false;
    btn.textContent = prev;
  };
}

function flash(btn: HTMLButtonElement, label: string): void {
  const prev = btn.textContent;
  btn.textContent = label;
  setTimeout(() => {
    btn.textContent = prev;
  }, 1200);
}
