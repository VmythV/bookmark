/**
 * Save flow controller. See docs/detailed-design.md §5.
 *
 * M2: local RAG recall is wired in — recommend the Top-1 recalled folder. The
 * LLM re-ranking step (M3) will replace the "pick Top-1" heuristic with a
 * structured LLM choice over the Top-K candidates.
 */
import type { PageInfo, SaveRecommendation } from '../shared/types';
import {
  createBookmark,
  defaultParentId,
  ensureFolderPath,
} from '../services/bookmarks';
import { getConfig } from '../services/storage';
import { recallFolders } from '../rag/recall';
import { isIndexed } from '../rag/indexer';

/**
 * Produce a folder recommendation for a page.
 * M2: Top-1 of the local recall. Falls back to the default folder when the
 * index is empty or recall fails.
 */
export async function recommend(page: PageInfo): Promise<SaveRecommendation> {
  try {
    if (await isIndexed()) {
      const cfg = await getConfig();
      const candidates = await recallFolders(page, cfg.recall.topK);
      const best = candidates[0];
      if (best) {
        return {
          action: 'use_existing',
          folderId: best.id,
          confidence: best.score,
          reason: `Most similar folder: "${best.path}" (score ${best.score.toFixed(2)}). LLM re-ranking arrives in M3.`,
        };
      }
    }
  } catch (err) {
    console.error('[smart-bookmark] recall failed, falling back', err);
  }

  const folderId = await defaultParentId();
  return {
    action: 'use_existing',
    folderId,
    confidence: 0,
    reason: 'Index not ready — saved to the default folder. Build the index in Settings.',
  };
}

/**
 * Apply a (possibly user-overridden) recommendation: resolve the target folder,
 * create it if needed, and write the bookmark.
 */
export async function applySave(
  page: PageInfo,
  rec: SaveRecommendation,
  override?: { folderId?: string; newFolderPath?: string },
): Promise<{ createdId: string }> {
  let parentId: string;

  if (override?.folderId) {
    parentId = override.folderId;
  } else if (override?.newFolderPath) {
    parentId = await ensureFolderPath(override.newFolderPath);
  } else if (rec.action === 'create_new' && rec.newFolderPath) {
    parentId = await ensureFolderPath(rec.newFolderPath);
  } else if (rec.folderId) {
    parentId = rec.folderId;
  } else {
    parentId = await defaultParentId();
  }

  const node = await createBookmark(parentId, page.title || page.url, page.url);
  return { createdId: node.id };
}
