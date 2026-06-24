/**
 * Recommend folders for a page using the weighted multi-lane ranker:
 *   behavior + domain + lexical + (optional) vector + prefer.
 * If no embedding is provided, vector weight is dropped and the remaining
 * weights are normalized so the result is still on a 0..1 scale.
 */
import { hostOf, tokenize } from '../shared/text';
import { behaviorScores, normalizeScores } from './behavior';
import { domainScores } from './domain';
import { lexicalScores } from './lexical';
import { vectorScores } from './vector';
import type {
  FolderRecommendation,
  PageInfo,
  RankerWeights,
  StoredBookmark,
} from '../shared/types';

export interface RankInput {
  page: PageInfo;
  /** All known stored bookmarks; ignored rows whose embedding is null. */
  bookmarks: StoredBookmark[];
  /** Page embedding for the vector lane; null disables it. */
  pageEmbedding?: number[] | null;
  weights: RankerWeights;
  /** Map of folderId -> folder path for display. */
  folderPaths: Map<string, string>;
  /** How many results to return. */
  topK: number;
}

export function rankFolders(input: RankInput): FolderRecommendation[] {
  const {
    page,
    bookmarks,
    pageEmbedding,
    weights,
    folderPaths,
    topK,
  } = input;

  const behavior = normalizeScores(behaviorScores(bookmarks));
  const domain = normalizeScores(domainScores(hostOf(page.url), bookmarks));
  const lexical = normalizeScores(
    lexicalScores(
      [page.title, page.description, page.selectionText].filter(Boolean).join(' • '),
      bookmarks,
    ),
  );
  const vector = normalizeScores(vectorScores(pageEmbedding ?? null, bookmarks));

  // Prefer lane: just a constant 1 for folders where the user has at least one
  // explicitly-chosen bookmark (preferFolder === true).
  const prefer = new Map<string, number>();
  for (const b of bookmarks) {
    if (b.preferFolder) {
      const cur = prefer.get(b.folderId) ?? 0;
      prefer.set(b.folderId, Math.max(cur, 1));
    }
  }

  // Adjust weights: drop vector entirely when no embeddings are available,
  // and scale the rest to sum to 1 so the final confidence remains comparable.
  const useVector = (pageEmbedding != null) && weights.vector > 0;
  const w = { ...weights, vector: useVector ? weights.vector : 0 };
  const sum = w.behavior + w.domain + w.lexical + w.vector + w.prefer || 1;
  const scale = 1 / sum;

  // Collect every folder seen in any lane, plus every folder in the tree path map.
  const folderIds = new Set<string>();
  for (const m of [behavior, domain, lexical, vector, prefer]) {
    for (const k of m.keys()) folderIds.add(k);
  }
  for (const k of folderPaths.keys()) folderIds.add(k);

  const out: FolderRecommendation[] = [];
  for (const id of folderIds) {
    const sb = (behavior.get(id) ?? 0) * scale;
    const sd = (domain.get(id) ?? 0) * scale;
    const sl = (lexical.get(id) ?? 0) * scale;
    const sv = (vector.get(id) ?? 0) * scale;
    const sp = (prefer.get(id) ?? 0) * scale;
    const total = sb + sd + sl + sv + sp;
    if (total <= 0) continue;
    out.push({
      folderId: id,
      confidence: Math.min(1, total),
      scores: { behavior: sb, domain: sd, lexical: sl, vector: sv, prefer: sp },
      reason: explain({ behavior: sb, domain: sd, lexical: sl, vector: sv, prefer: sp }, folderPaths.get(id) ?? ''),
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, topK);
}

function explain(
  s: FolderRecommendation['scores'],
  path: string,
): string {
  const parts: string[] = [];
  if (s.prefer > 0) parts.push('you previously chose this folder');
  if (s.domain > 0) parts.push('same domain as your other bookmarks here');
  if (s.vector > 0.1) parts.push('semantically close to items here');
  if (s.lexical > 0.1) parts.push('keyword match');
  if (s.behavior > 0.1) parts.push('recently active');
  if (parts.length === 0) parts.push('weak signal');
  return `${path}: ${parts.slice(0, 2).join('; ')}.`;
}

/** Convenience for tests: render the page's tokens (used by lex tests). */
export function pageTokensForTest(page: PageInfo): Set<string> {
  return tokenize(
    [page.title, page.description, page.selectionText].filter(Boolean).join(' • '),
  );
}