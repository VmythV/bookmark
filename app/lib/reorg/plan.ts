/**
 * Build a reorganization plan (preview) and apply it.
 * See docs/detailed-design.md §6.
 *
 * Build:  collect+embed scope → HDBSCAN cluster → LLM-name each cluster.
 * Apply:  auto HTML backup (rollback) → create folders → batch-move bookmarks →
 *         noise → "Unsorted". Nothing moves until the user confirms the plan.
 */
import {
  defaultParentId,
  ensureFolderPath,
  moveNode,
} from '../services/bookmarks';
import { exportHtml } from '../controllers/backupController';
import { collectEmbeddedBookmarks } from './collect';
import { clusterVectors } from './cluster';
import { suggestFolderName } from './naming';
import type { ReorgCluster, ReorgPlan, ReorgScope } from '../shared/types';

const REORG_ROOT = 'Reorganized';
const UNSORTED = `${REORG_ROOT}/Unsorted`;

/** The HTML snapshot taken right before the last apply, for manual rollback. */
let lastRollback: string | null = null;

export interface ReorgProgress {
  phase: 'embedding' | 'clustering' | 'naming';
  done: number;
  total: number;
}

/** Build a reorg plan for the given scope. Does not modify any bookmarks. */
export async function buildPlan(
  scope: ReorgScope,
  onProgress?: (p: ReorgProgress) => void,
): Promise<ReorgPlan> {
  const items = await collectEmbeddedBookmarks(scope, (done, total) =>
    onProgress?.({ phase: 'embedding', done, total }),
  );

  onProgress?.({ phase: 'clustering', done: 0, total: 1 });
  const { clusters, noise } = clusterVectors(items.map((i) => i.vector));
  onProgress?.({ phase: 'clustering', done: 1, total: 1 });

  const planClusters: ReorgCluster[] = [];
  for (let c = 0; c < clusters.length; c++) {
    const idxs = clusters[c]!;
    const members = idxs.map((i) => items[i]!);
    const titles = members.map((m) => m.title);
    onProgress?.({ phase: 'naming', done: c, total: clusters.length });
    const name = await suggestFolderName(titles);
    planClusters.push({
      suggestedFolderName: name,
      suggestedPath: `${REORG_ROOT}/${name}`,
      bookmarkIds: members.map((m) => m.id),
      sampleTitles: titles.slice(0, 5),
    });
  }

  return {
    clusters: planClusters,
    noise: noise.map((i) => items[i]!.id),
    total: items.length,
    generatedAt: Date.now(),
  };
}

export interface ApplyResult {
  moved: number;
  created: number;
  unsorted: number;
}

/**
 * Apply a (possibly user-edited) plan. Takes an automatic HTML backup first.
 * Creates each cluster's folder, moves its bookmarks in, and moves noise to
 * "Unsorted".
 */
export async function applyPlan(plan: ReorgPlan): Promise<ApplyResult> {
  // Safety backup for rollback.
  lastRollback = await exportHtml();

  const root = await defaultParentId();
  let moved = 0;
  let created = 0;

  for (const cluster of plan.clusters) {
    const folderId = await ensureFolderPath(cluster.suggestedPath, root);
    created++;
    for (const id of cluster.bookmarkIds) {
      try {
        await moveNode(id, folderId);
        moved++;
      } catch (err) {
        console.error('[smart-bookmark] move failed', id, err);
      }
    }
  }

  let unsorted = 0;
  if (plan.noise.length > 0) {
    const unsortedId = await ensureFolderPath(UNSORTED, root);
    for (const id of plan.noise) {
      try {
        await moveNode(id, unsortedId);
        unsorted++;
      } catch (err) {
        console.error('[smart-bookmark] move (noise) failed', id, err);
      }
    }
  }

  return { moved, created, unsorted };
}

/** The HTML snapshot from the last apply, for manual restore. */
export function getLastRollback(): string | null {
  return lastRollback;
}
