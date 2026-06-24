/**
 * Search controller. Optional embedding uses the user's configured provider;
 * if missing or failing, falls back to lexical-only.
 */
import { listStored, bumpUsage } from '../services/bookmarks';
import { getConfig } from '../services/storage';
import { embedOne } from '../providers/embedding';
import { searchBookmarks } from '../search/hybrid';
import type { StoredBookmark } from '../shared/types';

export async function search(
  query: string,
  topK?: number,
): Promise<StoredBookmark[]> {
  const q = query.trim();
  if (!q) return [];
  const cfg = await getConfig();
  const k = topK ?? cfg.search.topK;

  const bookmarks = await listStored();
  let queryEmbedding: number[] | null = null;
  if (cfg.search.mode === 'hybrid') {
    queryEmbedding = await embedOne(q, cfg.embedding);
  }
  return searchBookmarks(q, queryEmbedding, bookmarks, k);
}

/** Mark a search hit as used (bumps useCount). Fire-and-forget. */
export function recordUse(id: string): void {
  void bumpUsage(id).catch(() => {});
}