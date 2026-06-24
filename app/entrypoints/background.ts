/**
 * Background service worker: routes messages between UI surfaces (content,
 * popup, search) and the controllers.
 */
import type {
  Envelope,
  RequestMessage,
  ResponseMap,
} from '@/lib/shared/messages';
import { commitSave, recommendForPage } from '@/lib/controllers/saveController';
import { recordUse, search } from '@/lib/controllers/searchController';
import { listFolders } from '@/lib/services/bookmarks';
import { getConfig, setConfig } from '@/lib/services/storage';
import * as embedding from '@/lib/providers/embedding';
import * as chat from '@/lib/providers/chat';

export default defineBackground(() => {
  // Wire the omnibox keyword 'sb' to dispatch a query event the search UI can
  // listen for. Currently the omnibox just opens the popup; a future sidebar
  // can use this event.
  chrome.runtime.onMessage.addListener(
    (message: RequestMessage, _sender, sendResponse) => {
      handle(message)
        .then((data) =>
          sendResponse({ ok: true, data } satisfies Envelope<unknown>),
        )
        .catch((err: unknown) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies Envelope<unknown>),
        );
      return true;
    },
  );
});

async function handle(
  message: RequestMessage,
): Promise<ResponseMap[RequestMessage['type']]> {
  switch (message.type) {
    case 'PING':
      return { ok: true };

    case 'LIST_FOLDERS':
      return { folders: await listFolders() };

    case 'GET_CONFIG':
      return { config: await getConfig() };

    case 'SET_CONFIG':
      return { config: await setConfig(message.patch) };

    case 'TEST_PROVIDER': {
      try {
        if (message.which === 'embedding') await embedding.test((await getConfig()).embedding);
        else await chat.test((await getConfig()).chat);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'SAVE_REQUEST':
      return await recommendForPage(message.page);

    case 'SAVE_CONFIRM':
      return commitSave(message.page, message.folderId, message.tags);

    case 'SEARCH': {
      const results = await search(message.query, message.topK);
      results.slice(0, 3).forEach((r) => recordUse(r.id));
      return { results };
    }

    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown message: ${JSON.stringify(_exhaustive)}`);
    }
  }
}