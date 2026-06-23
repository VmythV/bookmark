/**
 * Save flow controller. See docs/detailed-design.md §5.
 *
 * M1: no RAG / LLM yet — produce a simple placeholder recommendation so the
 * end-to-end path (capture → recommend → confirm → write) works. M2/M3 replace
 * `recommend` with local recall + cloud LLM re-ranking.
 */
import type { PageInfo, SaveRecommendation } from '../shared/types';
import {
  createBookmark,
  defaultParentId,
  ensureFolderPath,
} from '../services/bookmarks';

/**
 * Produce a folder recommendation for a page.
 * M1 placeholder: always recommend the default folder (bookmarks bar).
 */
export async function recommend(_page: PageInfo): Promise<SaveRecommendation> {
  const folderId = await defaultParentId();
  return {
    action: 'use_existing',
    folderId,
    confidence: 0,
    reason: 'M1 placeholder: saved to the default folder. Smart recommendation arrives in M3.',
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
