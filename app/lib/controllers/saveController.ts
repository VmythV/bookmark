/**
 * Save flow controller. See docs/detailed-design.md §5.
 *
 * M3: full pipeline — local recall (Top-K) → LLM re-rank (structured output).
 * Falls back to a keyword rule when the LLM is unconfigured/offline/errors, and
 * to the default folder when the index isn't built yet.
 */
import type {
  FolderCandidate,
  PageInfo,
  SaveRecommendation,
} from '../shared/types';
import {
  createBookmark,
  defaultParentId,
  ensureFolderPath,
} from '../services/bookmarks';
import { getConfig } from '../services/storage';
import { recallFolders } from '../rag/recall';
import { isIndexed } from '../rag/indexer';
import { recommendFolder } from '../llm/provider';
import { recommendByKeywords } from '../llm/fallback';

/**
 * Produce a folder recommendation for a page:
 * recall Top-K → LLM re-rank → keyword fallback → default folder.
 */
export async function recommend(page: PageInfo): Promise<SaveRecommendation> {
  let candidates: FolderCandidate[] = [];

  try {
    if (await isIndexed()) {
      const cfg = await getConfig();
      candidates = await recallFolders(page, cfg.recall.topK);

      if (candidates.length > 0) {
        // Try the LLM re-rank first.
        try {
          return await recommendFolder(page, candidates, cfg.llm);
        } catch (err) {
          console.warn('[smart-bookmark] LLM re-rank failed, using keyword fallback', err);
          return recommendByKeywords(page, candidates);
        }
      }
    }
  } catch (err) {
    console.error('[smart-bookmark] recommend failed, falling back', err);
    if (candidates.length > 0) return recommendByKeywords(page, candidates);
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
