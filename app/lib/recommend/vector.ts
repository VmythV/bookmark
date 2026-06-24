/**
 * Vector score: max cosine similarity between the page embedding and any
 * embedded bookmark within each folder. Skips folders with no embedding.
 */
import { cosine } from '../providers/embedding';
import type { StoredBookmark } from '../shared/types';

/** Map folderId -> vector score in [0,1]. */
export function vectorScores(
  queryVec: number[] | null,
  bookmarks: StoredBookmark[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (!queryVec) return out;
  for (const b of bookmarks) {
    if (!b.embedding) continue;
    const s = cosine(queryVec, b.embedding);
    if (s <= 0) continue;
    const cur = out.get(b.folderId) ?? 0;
    if (s > cur) out.set(b.folderId, s);
  }
  return out;
}