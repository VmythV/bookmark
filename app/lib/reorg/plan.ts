/**
 * Orchestrates a reorganization analysis:
 *   sync store ← native tree → batch-embed → relocate lane → cluster homeless
 *   → name clusters → assemble ReorgPlan.
 * Reports progress and honors cancellation throughout (read-only: a cancel
 * leaves no side effects beyond cached embeddings).
 */
import { syncStoreFromTree } from './sync';
import { embedMissing } from './embedFill';
import { planRelocate } from './relocate';
import { clusterByCosine } from './cluster';
import { suggestFolderName } from './naming';
import { listFolders, defaultParentId, folderPath } from '../services/bookmarks';
import { getConfig } from '../services/storage';
import * as embedding from '../providers/embedding';
import { REORG_WEIGHTS } from '../shared/types';
import { throwIfCancelled, type CancelToken } from '../shared/cancel';
import type { ReorgPlan, ReorgProgress, NewFolderProposal } from './types';

export interface BuildPlanOptions {
  onProgress?: (p: ReorgProgress) => void;
  token?: CancelToken;
}

export async function buildReorgPlan(
  opts: BuildPlanOptions = {},
): Promise<ReorgPlan> {
  const { onProgress, token } = opts;
  const tick = (p: ReorgProgress) => onProgress?.(p);

  // 1. Sync the native tree into the store.
  tick({ phase: 'sync', done: 0, total: 0, message: 'Syncing bookmarks…' });
  const corpus = await syncStoreFromTree();
  throwIfCancelled(token);

  const cfg = await getConfig();
  const folders = await listFolders();
  const folderPaths = new Map(folders.map((f) => [f.id, f.path]));
  const embeddingUsed = embedding.isConfigured(cfg.embedding);

  // 2. Batch-embed (cached + cancellable). No-op when not configured.
  const embedded = await embedMissing(corpus, cfg.embedding, { onProgress, token });
  throwIfCancelled(token);

  // 3. Relocate lane.
  tick({ phase: 'relocate', done: 0, total: corpus.length, message: 'Finding better folders…' });
  const { moves, homelessIds } = planRelocate(corpus, folderPaths, {
    weights: REORG_WEIGHTS,
    minConfidence: cfg.reorg.minConfidence,
    minMargin: cfg.reorg.minMargin,
    homelessBelow: cfg.reorg.homelessBelow,
  });
  throwIfCancelled(token);

  // 4. Cluster homeless bookmarks (needs embeddings).
  const byId = new Map(corpus.map((b) => [b.id, b]));
  const newFolders: NewFolderProposal[] = [];
  let clustered = 0;

  if (embeddingUsed) {
    tick({ phase: 'cluster', done: 0, total: homelessIds.length, message: 'Grouping unfiled bookmarks…' });
    const items = homelessIds
      .map((id) => byId.get(id)!)
      .filter((b) => b.embedding)
      .map((b) => ({ id: b.id, vector: b.embedding! }));
    const { clusters } = clusterByCosine(items, {
      threshold: cfg.reorg.clusterThreshold,
      minSize: cfg.reorg.minClusterSize,
    });

    const parentId = await defaultParentId();
    const parentPath = folderPaths.get(parentId) ?? (await folderPath(parentId));

    // 5. Name each cluster (LLM or keyword fallback).
    for (let i = 0; i < clusters.length; i++) {
      throwIfCancelled(token);
      const members = clusters[i]!;
      const titles = members.map((id) => byId.get(id)!.title);
      tick({ phase: 'naming', done: i, total: clusters.length, message: `Naming folders ${i}/${clusters.length}` });
      const { name, sharedTokens } = await suggestFolderName(titles, cfg.chat);
      newFolders.push({
        tempId: `new-${i}`,
        name,
        parentId,
        parentPath,
        memberIds: members,
        sampleTitles: titles.slice(0, 5),
        sharedTokens,
      });
      clustered += members.length;
    }
  }

  tick({ phase: 'done', done: 1, total: 1, message: 'Done' });
  return {
    moves,
    newFolders,
    stats: {
      total: corpus.length,
      embedded,
      relocated: moves.length,
      homeless: homelessIds.length,
      clustered,
    },
    generatedAt: Date.now(),
    embeddingUsed,
  };
}
