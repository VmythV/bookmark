import { describe, it, expect } from 'vitest';
import { mergeTree, type LiveLeaf } from './sync';
import type { StoredBookmark } from '../shared/types';

function stored(partial: Partial<StoredBookmark> & { id: string }): StoredBookmark {
  return {
    id: partial.id,
    url: partial.url ?? 'https://x.test/a',
    title: partial.title ?? 'A',
    folderId: partial.folderId ?? 'f1',
    folderPath: partial.folderPath ?? 'F1',
    tags: partial.tags ?? [],
    embedding: partial.embedding ?? null,
    embeddingTextHash: partial.embeddingTextHash ?? null,
    useCount: partial.useCount ?? 0,
    lastUsed: partial.lastUsed ?? null,
    savedAt: partial.savedAt ?? 1000,
    preferFolder: partial.preferFolder ?? false,
  };
}

function leaf(partial: Partial<LiveLeaf> & { id: string }): LiveLeaf {
  return {
    id: partial.id,
    url: partial.url ?? 'https://x.test/a',
    title: partial.title ?? 'A',
    folderId: partial.folderId ?? 'f1',
    folderPath: partial.folderPath ?? 'F1',
    dateAdded: partial.dateAdded,
  };
}

describe('mergeTree', () => {
  it('inserts a new native leaf with neutral defaults and savedAt=dateAdded', () => {
    const { merged, upserts, pruneIds } = mergeTree(
      [],
      [leaf({ id: 'new', dateAdded: 555, folderId: 'f2', folderPath: 'Dev' })],
      9999,
    );
    expect(pruneIds).toEqual([]);
    expect(upserts).toHaveLength(1);
    const b = merged[0]!;
    expect(b.id).toBe('new');
    expect(b.savedAt).toBe(555);
    expect(b.preferFolder).toBe(false);
    expect(b.tags).toEqual([]);
    expect(b.embedding).toBeNull();
  });

  it('falls back to now when the leaf has no dateAdded', () => {
    const { merged } = mergeTree([], [leaf({ id: 'n' })], 4242);
    expect(merged[0]!.savedAt).toBe(4242);
  });

  it('refreshes folder placement but preserves tags/embedding/usage', () => {
    const prev = stored({
      id: 'b1',
      folderId: 'old',
      folderPath: 'Old',
      tags: ['keep'],
      embedding: [1, 0],
      embeddingTextHash: 'h',
      useCount: 3,
      preferFolder: true,
    });
    const { merged, upserts } = mergeTree(
      [prev],
      [leaf({ id: 'b1', folderId: 'new', folderPath: 'New/Place' })],
      1,
    );
    const b = merged[0]!;
    expect(b.folderId).toBe('new');
    expect(b.folderPath).toBe('New/Place');
    expect(b.tags).toEqual(['keep']);
    expect(b.embedding).toEqual([1, 0]);
    expect(b.useCount).toBe(3);
    expect(b.preferFolder).toBe(true);
    expect(upserts).toHaveLength(1); // changed => written back
  });

  it('does not re-write an unchanged row', () => {
    const prev = stored({ id: 'b1', folderId: 'f1', folderPath: 'F1' });
    const { upserts } = mergeTree(
      [prev],
      [leaf({ id: 'b1', folderId: 'f1', folderPath: 'F1' })],
      1,
    );
    expect(upserts).toHaveLength(0);
  });

  it('prunes stored rows whose native node is gone', () => {
    const { pruneIds, merged } = mergeTree(
      [stored({ id: 'gone' }), stored({ id: 'live' })],
      [leaf({ id: 'live' })],
      1,
    );
    expect(pruneIds).toEqual(['gone']);
    expect(merged.map((b) => b.id)).toEqual(['live']);
  });
});
