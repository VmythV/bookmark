/**
 * Lexical score: token overlap between the page and the folder's child titles +
 * folder path itself. Multiplied by a recency factor (more recent bookmarks
 * carry more signal).
 */
import { overlap, tokenize } from '../shared/text';
import type { StoredBookmark } from '../shared/types';

/** Map folderId -> summed overlap score across child bookmarks. */
export function lexicalScores(
  pageText: string,
  bookmarks: StoredBookmark[],
): Map<string, number> {
  const pageTokens = tokenize(pageText);
  if (pageTokens.size === 0) return new Map();
  const out = new Map<string, number>();
  for (const b of bookmarks) {
    const t = tokenize(`${b.folderPath} ${b.title} ${b.tags.join(' ')}`);
    const score = overlap(pageTokens, t);
    if (score > 0) out.set(b.folderId, (out.get(b.folderId) ?? 0) + score);
  }
  return out;
}