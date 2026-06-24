/**
 * Hybrid search: lexical (always on) + vector (optional). Combines ranks using
 * Reciprocal Rank Fusion (RRF), which gracefully degrades when one lane has no
 * signal (e.g. embedding provider not configured, or only some bookmarks are
 * embedded).
 */
import type { StoredBookmark } from '../shared/types';
import { lexicalScores } from './lexical';
import { vectorScores } from './vector';

const RRF_K = 60;

/** Score and rank bookmarks for a query. */
export function searchBookmarks(
  query: string,
  queryEmbedding: number[] | null,
  bookmarks: StoredBookmark[],
  topK: number,
): StoredBookmark[] {
  const lexMap = lexicalScores(query, bookmarks);
  const vecMap = vectorScores(queryEmbedding, bookmarks);

  // Build per-lane rank arrays (descending).
  const lexRank = rankTopN(lexMap);
  const vecRank = vecMap.size > 0 ? rankTopN(vecMap) : [];

  // RRF fusion.
  const score = new Map<string, number>();
  for (let i = 0; i < lexRank.length; i++) {
    score.set(lexRank[i]!, (score.get(lexRank[i]!) ?? 0) + 1 / (RRF_K + i + 1));
  }
  for (let i = 0; i < vecRank.length; i++) {
    score.set(vecRank[i]!, (score.get(vecRank[i]!) ?? 0) + 1 / (RRF_K + i + 1));
  }

  const byId = new Map(bookmarks.map((b) => [b.id, b]));
  const merged = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => byId.get(id))
    .filter((x): x is StoredBookmark => !!x);
  return merged;
}

function rankTopN(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}