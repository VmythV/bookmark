/**
 * Relocate lane: for each bookmark, rank existing folders over the corpus with
 * the bookmark itself EXCLUDED (so a folder isn't credited for containing the
 * very item we're judging), and propose a move when another folder clearly wins.
 * Bookmarks that fit nowhere well are returned as "homeless" for clustering.
 * Pure — unit-tested.
 */
import { rankFolders } from '../recommend/rank';
import { hostOf } from '../shared/text';
import type { RankerWeights, StoredBookmark } from '../shared/types';
import type { RelocateMove } from './types';

export interface RelocateOptions {
  weights: RankerWeights;
  /** Target must reach at least this confidence to be proposed. */
  minConfidence: number;
  /** ...and beat the current folder by at least this much. */
  minMargin: number;
  /** Best-folder confidence below this => homeless (no good fit anywhere). */
  homelessBelow: number;
}

export interface RelocateResult {
  moves: RelocateMove[];
  homelessIds: string[];
}

export function planRelocate(
  bookmarks: StoredBookmark[],
  folderPaths: Map<string, string>,
  opts: RelocateOptions,
): RelocateResult {
  const moves: RelocateMove[] = [];
  const homelessIds: string[] = [];

  for (let i = 0; i < bookmarks.length; i++) {
    const b = bookmarks[i]!;
    const corpus = bookmarks.filter((_, j) => j !== i);
    const recs = rankFolders({
      page: { url: b.url, title: b.title, description: b.tags.join(' ') },
      bookmarks: corpus,
      pageEmbedding: b.embedding,
      weights: opts.weights,
      folderPaths,
      topK: 5,
    });

    const top = recs[0];
    if (!top || top.confidence < opts.homelessBelow) {
      homelessIds.push(b.id);
      continue;
    }

    const currentScore =
      recs.find((r) => r.folderId === b.folderId)?.confidence ?? 0;

    const isBetterFolder = top.folderId !== b.folderId;
    const clearsBar = top.confidence >= opts.minConfidence;
    const beatsCurrent = top.confidence - currentScore >= opts.minMargin;

    if (isBetterFolder && clearsBar && beatsCurrent) {
      moves.push({
        id: b.id,
        title: b.title,
        url: b.url,
        host: hostOf(b.url),
        fromFolderId: b.folderId,
        fromPath: b.folderPath,
        toFolderId: top.folderId,
        toPath: folderPaths.get(top.folderId) ?? '',
        confidence: top.confidence,
        currentScore,
        reason: top.reason,
      });
    }
  }

  return { moves, homelessIds };
}
