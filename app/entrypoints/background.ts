/**
 * Background service worker: message router + orchestration entry.
 * See docs/detailed-design.md §2, §11.
 */
import type {
  Envelope,
  RequestMessage,
  ResponseMap,
} from '@/lib/shared/messages';
import { applySave, recommend } from '@/lib/controllers/saveController';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
    // Route asynchronously; return true to keep the channel open.
    handle(message)
      .then((data) => sendResponse({ ok: true, data } satisfies Envelope<unknown>))
      .catch((err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies Envelope<unknown>),
      );
    return true;
  });
});

async function handle(
  message: RequestMessage,
): Promise<ResponseMap[RequestMessage['type']]> {
  switch (message.type) {
    case 'PING':
      return { ok: true };

    case 'SAVE_REQUEST':
      return { recommendation: await recommend(message.page) };

    case 'SAVE_CONFIRM':
      return applySave(message.page, message.recommendation, {
        folderId: message.overrideFolderId,
        newFolderPath: message.overrideNewFolderPath,
      });

    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown message: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
