/**
 * Suggest tags for a page. Pure, embedding-free version: pulls from the page's
 * own keywords plus tags already used by bookmarks in similar folders. With an
 * embedding provider configured, the caller can additionally pick tags whose
 * embeddings are close to the page; that's done in the embedding-aware wrapper
 * in `tagsWithEmbedding.ts` (added in a later iteration).
 */
import { overlap, tokenize } from '../shared/text';
import type { PageInfo, StoredBookmark } from '../shared/types';

const MAX_TAGS = 5;

export function suggestTags(
  page: PageInfo,
  bookmarks: StoredBookmark[],
): string[] {
  const pageTokens = tokenize(
    [page.title, page.description, page.selectionText].filter(Boolean).join(' • '),
  );
  if (pageTokens.size === 0) return [];

  // Build a frequency map of existing tags weighted by their token overlap
  // with the page (rough proxy for relevance without vectors).
  const tagScore = new Map<string, number>();
  for (const b of bookmarks) {
    const t = tokenize(`${b.folderPath} ${b.title}`);
    const w = overlap(pageTokens, t);
    if (w <= 0) continue;
    for (const tag of b.tags) {
      tagScore.set(tag, (tagScore.get(tag) ?? 0) + w);
    }
  }

  // Also extract fresh candidate keywords directly from the page that don't
  // collide with existing tags — these become new tags if they're
  // particularly distinctive (long, alphanumeric, etc.).
  const existing = new Set<string>(
    [...tagScore.keys()].map((t) => t.toLowerCase()),
  );
  const newCandidates: Array<{ word: string; score: number }> = [];
  for (const tok of pageTokens) {
    if (existing.has(tok)) continue;
    if (tok.length < 3) continue;
    // Lightweight "distinctiveness": cap by length and frequency in existing tags.
    const freq = countInBookmarks(tok, bookmarks);
    const score = (tok.length >= 5 ? 1 : 0.5) - freq * 0.2;
    if (score > 0) newCandidates.push({ word: tok, score });
  }
  newCandidates.sort((a, b) => b.score - a.score);

  // Pick top existing tags first, then pad with fresh candidates.
  const out: string[] = [];
  for (const [tag, _score] of [...tagScore.entries()].sort((a, b) => b[1] - a[1])) {
    if (out.length >= MAX_TAGS) break;
    if (out.some((x) => x.toLowerCase() === tag.toLowerCase())) continue;
    out.push(tag);
  }
  for (const c of newCandidates) {
    if (out.length >= MAX_TAGS) break;
    out.push(c.word);
  }
  return out;
}

function countInBookmarks(tok: string, bookmarks: StoredBookmark[]): number {
  let n = 0;
  for (const b of bookmarks) {
    for (const t of b.tags) if (t.toLowerCase() === tok) n++;
  }
  return n;
}