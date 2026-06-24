import { cosine } from '../providers/embedding';
import type { StoredBookmark } from '../shared/types';

/** Cosine score (assumes unit vectors). Empty map when queryVec is null. */
export function vectorScores(
  queryVec: number[] | null,
  bookmarks: StoredBookmark[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (!queryVec) return out;
  for (const b of bookmarks) {
    if (!b.embedding) continue;
    const s = cosine(queryVec, b.embedding);
    if (s > 0) out.set(b.id, s);
  }
  return out;
}