import { describe, it, expect } from 'vitest';
import { clusterByCosine, type ClusterItem } from './cluster';

// Two tight groups around [1,0] and [0,1].
const groupA: ClusterItem[] = [
  { id: 'a1', vector: [1, 0] },
  { id: 'a2', vector: [0.99, 0.14] },
  { id: 'a3', vector: [0.98, 0.2] },
];
const groupB: ClusterItem[] = [
  { id: 'b1', vector: [0, 1] },
  { id: 'b2', vector: [0.14, 0.99] },
  { id: 'b3', vector: [0.2, 0.98] },
];

describe('clusterByCosine', () => {
  it('separates two tight groups into two clusters', () => {
    const { clusters, noise } = clusterByCosine([...groupA, ...groupB], {
      threshold: 0.78,
      minSize: 2,
    });
    expect(clusters).toHaveLength(2);
    expect(noise).toHaveLength(0);
    const sizes = clusters.map((c) => c.length).sort();
    expect(sizes).toEqual([3, 3]);
  });

  it('drops clusters below minSize into noise', () => {
    const { clusters, noise } = clusterByCosine(
      [groupA[0]!, groupA[1]!, groupB[0]!],
      { threshold: 0.78, minSize: 3 },
    );
    expect(clusters).toHaveLength(0);
    expect(noise.sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('does not merge near-orthogonal vectors at the threshold', () => {
    const { clusters } = clusterByCosine(
      [
        { id: 'x', vector: [1, 0] },
        { id: 'y', vector: [0, 1] },
      ],
      { threshold: 0.78, minSize: 1 },
    );
    expect(clusters).toHaveLength(2);
  });

  it('is deterministic regardless of input order', () => {
    const a = clusterByCosine([...groupA, ...groupB], { threshold: 0.78, minSize: 2 });
    const b = clusterByCosine([...groupB].reverse().concat([...groupA]), {
      threshold: 0.78,
      minSize: 2,
    });
    const norm = (r: { clusters: string[][] }) =>
      r.clusters.map((c) => [...c].sort()).sort((x, y) => (x[0]! < y[0]! ? -1 : 1));
    expect(norm(a)).toEqual(norm(b));
  });
});
