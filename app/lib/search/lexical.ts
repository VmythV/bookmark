import { overlap, tokenize } from '../shared/text';
import type { StoredBookmark } from '../shared/types';

/** Score each bookmark by token overlap with the query. 0..N. */
export function lexicalScores(
  query: string,
  bookmarks: StoredBookmark[],
): Map<string, number> {
  const q = tokenize(query);
  if (q.size === 0) return new Map();
  const out = new Map<string, number>();
  for (const b of bookmarks) {
    const text = `${b.title} ${b.tags.join(' ')} ${b.folderPath} ${b.url}`;
    const s = overlap(q, tokenize(text));
    if (s > 0) out.set(b.id, s);
  }
  return out;
}