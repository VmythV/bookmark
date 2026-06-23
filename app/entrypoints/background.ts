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
import {
  buildIndex,
  isIndexed,
  rebuildIndex,
  startIncrementalSync,
} from '@/lib/rag/indexer';
import { count as vectorCount } from '@/lib/services/vectorStore';
import {
  backupNow,
  exportHtml,
  importFromRemote,
  registerAlarmHandler,
  syncSchedule,
  testConnection,
} from '@/lib/controllers/backupController';
import { applyPlan, buildPlan } from '@/lib/reorg/plan';
import { requestCancel, resetCancel } from '@/lib/shared/cancel';

export default defineBackground(() => {
  // Keep the folder index in sync with bookmark changes.
  startIncrementalSync();
  // Scheduled backups.
  registerAlarmHandler();
  void syncSchedule();

  chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
    // Ignore internal embedder traffic; embedderClient handles those.
    if ((message as { target?: string }).target) return;

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

    case 'INDEX_BUILD':
      resetCancel();
      return buildIndex((p) => {
        // Broadcast progress to any open extension page (e.g. options).
        void chrome.runtime
          .sendMessage({ target: 'index-progress', ...p })
          .catch(() => {
            /* no receiver open; ignore */
          });
      });

    case 'INDEX_REBUILD':
      resetCancel();
      return rebuildIndex((p) => {
        void chrome.runtime
          .sendMessage({ target: 'index-progress', ...p })
          .catch(() => {
            /* no receiver */
          });
      });

    case 'INDEX_STATUS':
      return { indexed: await isIndexed(), folderCount: await vectorCount('folder') };

    case 'CANCEL_TASK':
      requestCancel();
      return { ok: true };

    case 'BACKUP_NOW':
      return backupNow();

    case 'EXPORT_HTML':
      return { html: await exportHtml() };

    case 'BACKUP_TEST':
      await testConnection();
      return { ok: true };

    case 'BACKUP_IMPORT':
      return importFromRemote(message.html, message.mode);

    case 'SCHEDULE_SYNC':
      await syncSchedule();
      return { ok: true };

    case 'REORG_BUILD_PLAN':
      resetCancel();
      return {
        plan: await buildPlan(message.scope, (p) => {
          void chrome.runtime
            .sendMessage({ target: 'reorg-progress', ...p })
            .catch(() => {
              /* no receiver */
            });
        }),
      };

    case 'REORG_APPLY':
      return applyPlan(message.plan);

    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown message: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
