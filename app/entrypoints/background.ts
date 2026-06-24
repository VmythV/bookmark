/**
 * Background service worker: routes messages between UI surfaces (content,
 * popup, search) and the controllers.
 */
import type {
  Envelope,
  RequestMessage,
  ResponseMap,
  ReorgClientMsg,
  ReorgServerMsg,
} from '@/lib/shared/messages';
import { REORG_PORT } from '@/lib/shared/messages';
import { commitSave, recommendForPage } from '@/lib/controllers/saveController';
import { recordUse, search } from '@/lib/controllers/searchController';
import { ensureFolderPath, listFolders } from '@/lib/services/bookmarks';
import { getConfig, setConfig } from '@/lib/services/storage';
import * as embedding from '@/lib/providers/embedding';
import * as chat from '@/lib/providers/chat';
import { buildReorgPlan } from '@/lib/reorg/plan';
import { applyReorg } from '@/lib/reorg/apply';
import { CancelledError, newToken } from '@/lib/shared/cancel';

export default defineBackground(() => {
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

  // Long-lived Port for the reorganization flow (progress + cancel). Separate
  // from the request/response router above.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== REORG_PORT) return;
    const token = newToken();
    const post = (m: ReorgServerMsg) => {
      try {
        port.postMessage(m);
      } catch {
        /* port closed */
      }
    };
    port.onDisconnect.addListener(() => {
      token.cancelled = true;
    });
    port.onMessage.addListener((msg: ReorgClientMsg) => {
      if (msg.cmd === 'cancel') {
        token.cancelled = true;
        return;
      }
      if (msg.cmd === 'analyze') {
        buildReorgPlan({ token, onProgress: (progress) => post({ kind: 'progress', progress }) })
          .then((plan) => post({ kind: 'plan', plan }))
          .catch((err: unknown) =>
            post(
              err instanceof CancelledError
                ? { kind: 'cancelled' }
                : { kind: 'error', error: err instanceof Error ? err.message : String(err) },
            ),
          );
      } else if (msg.cmd === 'apply') {
        applyReorg(msg.input)
          .then((result) => post({ kind: 'applied', result }))
          .catch((err: unknown) =>
            post({ kind: 'error', error: err instanceof Error ? err.message : String(err) }),
          );
      }
    });
  });
});

async function handle(
  message: RequestMessage,
): Promise<ResponseMap[RequestMessage['type']]> {
  switch (message.type) {
    case 'PING':
      return { ok: true };

    case 'LIST_FOLDERS':
      return { folders: await listFolders() };

    case 'ENSURE_FOLDER':
      return { folderId: await ensureFolderPath(message.path) };

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