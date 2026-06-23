import { describe, it, expect } from 'vitest';
import { clusterVectors } from './cluster';

/** Make a unit-ish vector near a 2D point (rest zero-padded). */
function vec(x: number, y: number): number[] {
  return [x, y, 0, 0];
}

describe('clusterVectors', () => {
  it('returns empty for no input', () => {
    expect(clusterVectors([])).toEqual({ clusters: [], noise: [] });
  });

  it('treats fewer than 3 points as noise', () => {
    const res = clusterVectors([vec(0, 0), vec(1, 1)]);
    expect(res.clusters).toEqual([]);
    expect(res.noise).toEqual([0, 1]);
  });

  it('separates two dense groups', () => {
    // Two tight clusters far apart.
    const groupA = [vec(0, 0), vec(0.1, 0.1), vec(0, 0.1), vec(0.1, 0)];
    const groupB = [vec(10, 10), vec(10.1, 10.1), vec(10, 10.1), vec(10.1, 10)];
    const res = clusterVectors([...groupA, ...groupB], 2);

    expect(res.clusters.length).toBeGreaterThanOrEqual(2);
    // Every index appears exactly once across clusters + noise.
    const seen = new Set<number>();
    for (const c of res.clusters) for (const i of c) seen.add(i);
    for (const i of res.noise) seen.add(i);
    expect(seen.size).toBe(8);

    // The two groups should not be merged: find clusters containing index 0 and 4.
    const clusterOf = (idx: number) =>
      res.clusters.findIndex((c) => c.includes(idx));
    const a0 = clusterOf(0);
    const b0 = clusterOf(4);
    if (a0 !== -1 && b0 !== -1) {
      expect(a0).not.toBe(b0);
    }
  });

  it('partitions indices disjointly between clusters and noise', () => {
    const pts = Array.from({ length: 12 }, (_, i) => vec(i % 3, Math.floor(i / 3)));
    const res = clusterVectors(pts, 2);
    const all = [...res.clusters.flat(), ...res.noise].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});
