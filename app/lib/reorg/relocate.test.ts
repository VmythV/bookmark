import { describe, it, expect } from 'vitest';
import { planRelocate } from './relocate';
import { REORG_WEIGHTS } from '../shared/types';
import type { StoredBookmark } from '../shared/types';

const F_RUST = 'f-rust';
const F_COOK = 'f-cook';
const folderPaths = new Map([
  [F_RUST, 'Dev/Rust'],
  [F_COOK, 'Cooking'],
]);
const OPTS = {
  weights: REORG_WEIGHTS,
  minConfidence: 0.45,
  minMargin: 0.12,
  homelessBelow: 0.35,
};

function bm(
  id: string,
  folderId: string,
  title: string,
  url: string,
  embedding: number[] | null,
): StoredBookmark {
  return {
    id,
    url,
    title,
    folderId,
    folderPath: folderId === F_RUST ? 'Dev/Rust' : 'Cooking',
    tags: [],
    embedding,
    embeddingTextHash: embedding ? 'h' : null,
    useCount: 0,
    lastUsed: null,
    savedAt: 1000,
    preferFolder: false,
  };
}

// Two coherent folders (domain + lexical + vector all aligned per folder).
const base: StoredBookmark[] = [
  bm('r1', F_RUST, 'Rust ownership', 'https://rust.org/own', [1, 0, 0]),
  bm('r2', F_RUST, 'Rust lifetimes', 'https://rust.org/life', [1, 0, 0]),
  bm('c1', F_COOK, 'Pasta carbonara', 'https://food.test/pasta', [0, 1, 0]),
  bm('c2', F_COOK, 'Roast chicken', 'https://food.test/chicken', [0, 1, 0]),
];

describe('planRelocate', () => {
  it('proposes moving a misfiled bookmark to the matching folder', () => {
    // A Rust page sitting in Cooking, all signals point to Rust.
    const misfiled = bm('x', F_COOK, 'Rust async', 'https://rust.org/async', [1, 0, 0]);
    const { moves } = planRelocate([...base, misfiled], folderPaths, OPTS);
    const move = moves.find((m) => m.id === 'x');
    expect(move).toBeDefined();
    expect(move!.toFolderId).toBe(F_RUST);
    expect(move!.fromFolderId).toBe(F_COOK);
    expect(move!.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it('excludes the bookmark itself so its own signal cannot pin it', () => {
    // The misfiled item is the ONLY rust-flavored row in Cooking; if self were
    // in the corpus it would prop up Cooking. It must still be moved.
    const misfiled = bm('x', F_COOK, 'Rust async', 'https://rust.org/async', [1, 0, 0]);
    const { moves } = planRelocate([...base, misfiled], folderPaths, OPTS);
    expect(moves.some((m) => m.id === 'x' && m.toFolderId === F_RUST)).toBe(true);
  });

  it('respects the margin gate (unreachable margin blocks the move)', () => {
    // Max possible margin is 1.0 (top capped at 1, current at 0); require more.
    const misfiled = bm('x', F_COOK, 'Rust async', 'https://rust.org/async', [1, 0, 0]);
    const strict = { ...OPTS, minMargin: 1.01 };
    const { moves } = planRelocate([...base, misfiled], folderPaths, strict);
    expect(moves.some((m) => m.id === 'x')).toBe(false);
  });

  it('leaves a correctly-placed bookmark alone', () => {
    const placed = bm('y', F_RUST, 'Rust macros', 'https://rust.org/macros', [1, 0, 0]);
    const { moves } = planRelocate([...base, placed], folderPaths, OPTS);
    expect(moves.some((m) => m.id === 'y')).toBe(false);
  });

  it('flags an item that fits nowhere as homeless, not a move', () => {
    const orphan = bm('z', F_COOK, 'Quantum chromodynamics', 'https://phys.test/qcd', [0, 0, 1]);
    const { moves, homelessIds } = planRelocate([...base, orphan], folderPaths, OPTS);
    expect(moves.some((m) => m.id === 'z')).toBe(false);
    expect(homelessIds).toContain('z');
  });
});
