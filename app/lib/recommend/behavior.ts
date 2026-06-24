/**
 * Behavior score: how often has the user put recent bookmarks into this folder,
 * with exponential time decay. Pure; works without any network or embedding.
 */
import type { StoredBookmark } from '../shared/types';

const HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const DECAY = Math.LN2 / HALF_LIFE_MS;

/** Map folderId -> decayed save count (more recent = higher weight). */
export function behaviorScores(
  bookmarks: StoredBookmark[],
  now: number = Date.now(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookmarks) {
    const dt = Math.max(0, now - b.savedAt);
    const w = Math.exp(-DECAY * dt);
    out.set(b.folderId, (out.get(b.folderId) ?? 0) + w);
  }
  return out;
}

/** Normalize a map of folderId -> score to 0..1 (max -> 1). */
export function normalizeScores(
  map: Map<string, number>,
): Map<string, number> {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  if (max <= 0) return new Map();
  const out = new Map<string, number>();
  for (const [k, v] of map) out.set(k, v / max);
  return out;
}