/**
 * Greedy online single-pass centroid clustering over L2-normalized vectors.
 * Zero deps (no HDBSCAN/wasm — the reason V1 reorg was removed). O(N·K) where K
 * is the (small) number of clusters. Membership is tested against the running
 * mean, which resists the chain-merging that a similarity-graph union-find
 * suffers from. Input is sorted by id first so results are reproducible.
 * Pure — unit-tested.
 */
import { cosine, normalize } from '../providers/embedding';

export interface ClusterItem {
  id: string;
  vector: number[];
}

export interface ClusterResult {
  /** Member id lists, one per accepted cluster (size >= minSize). */
  clusters: string[][];
  /** Ids that didn't land in a large-enough cluster. */
  noise: string[];
}

interface Bucket {
  sum: number[];
  centroid: number[];
  members: string[];
}

export interface ClusterOptions {
  /** Minimum cosine to the centroid to join a cluster. */
  threshold: number;
  /** Minimum members for a cluster to be kept (smaller => noise). */
  minSize: number;
}

export function clusterByCosine(
  items: ClusterItem[],
  opts: ClusterOptions,
): ClusterResult {
  const sorted = [...items]
    .filter((it) => it.vector.length > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const buckets: Bucket[] = [];
  for (const it of sorted) {
    let best: Bucket | null = null;
    let bestSim = -Infinity;
    for (const bucket of buckets) {
      const sim = cosine(it.vector, bucket.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        best = bucket;
      }
    }
    if (best && bestSim >= opts.threshold) {
      for (let i = 0; i < it.vector.length; i++) {
        best.sum[i] = (best.sum[i] ?? 0) + it.vector[i]!;
      }
      best.centroid = normalize(best.sum);
      best.members.push(it.id);
    } else {
      buckets.push({
        sum: [...it.vector],
        centroid: [...it.vector],
        members: [it.id],
      });
    }
  }

  const clusters: string[][] = [];
  const noise: string[] = [];
  for (const bucket of buckets) {
    if (bucket.members.length >= opts.minSize) clusters.push(bucket.members);
    else noise.push(...bucket.members);
  }
  return { clusters, noise };
}
