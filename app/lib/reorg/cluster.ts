/**
 * HDBSCAN clustering over bookmark embeddings. See docs/detailed-design.md §6.
 *
 * Returns clusters (arrays of indices into the input) plus the indices HDBSCAN
 * labeled as noise (-1).
 */
import { HDBSCAN } from 'hdbscan-ts';

export interface ClusterResult {
  /** Each entry is a list of input indices belonging to that cluster. */
  clusters: number[][];
  /** Input indices labeled as noise. */
  noise: number[];
}

/**
 * Cluster the given vectors. `minClusterSize` controls how small a group can be
 * before it's treated as noise; defaults scale gently with dataset size.
 */
export function clusterVectors(
  vectors: number[][],
  minClusterSize?: number,
): ClusterResult {
  if (vectors.length === 0) return { clusters: [], noise: [] };
  // Too few points to cluster meaningfully → everything is noise.
  if (vectors.length < 3) {
    return { clusters: [], noise: vectors.map((_, i) => i) };
  }

  const size = minClusterSize ?? Math.max(2, Math.round(Math.sqrt(vectors.length) / 2));
  const model = new HDBSCAN({ minClusterSize: size, minSamples: size });
  model.fit(vectors);
  const labels = model.labels_;

  const byLabel = new Map<number, number[]>();
  const noise: number[] = [];
  labels.forEach((label, i) => {
    if (label < 0) {
      noise.push(i);
    } else {
      const arr = byLabel.get(label) ?? [];
      arr.push(i);
      byLabel.set(label, arr);
    }
  });

  return { clusters: [...byLabel.values()], noise };
}
