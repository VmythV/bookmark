import { describe, it, expect } from 'vitest';
import { searchBookmarks } from './hybrid';
import type { StoredBookmark } from '../shared/types';

const B = (id: string, title: string, tags: string[] = [], embedding: number[] | null = null): StoredBookmark => ({
  id,
  url: `https://x.test/${id}`,
  title,
  folderId: 'f',
  folderPath: 'X',
  tags,
  embedding,
  embeddingTextHash: null,
  useCount: 0,
  lastUsed: null,
  savedAt: 0,
  preferFolder: false,
});

describe('searchBookmarks (lexical only)', () => {
  it('ranks by lexical overlap', () => {
    const bookmarks = [
      B('a', 'Rust programming'),
      B('b', 'Cooking pasta'),
      B('c', 'Rust by example', ['rust', 'example']),
    ];
    const out = searchBookmarks('rust example', null, bookmarks, 5);
    expect(out.map((r) => r.id)).toContain('c');
    expect(out.map((r) => r.id)).not.toContain('b');
  });

  it('returns empty on empty query', () => {
    const out = searchBookmarks('', null, [B('a', 't')], 5);
    expect(out).toEqual([]);
  });
});

describe('searchBookmarks (hybrid)', () => {
  it('combines lexical and vector via RRF', () => {
    const bookmarks = [
      B('lex', 'Rust by example', ['rust', 'example'], null),
      B('vec', 'Cooking pasta', [], [1, 0]), // unrelated lex, but vec matches
      B('both', 'Rust programming', ['rust'], [1, 0]),
    ];
    const out = searchBookmarks('rust', [1, 0], bookmarks, 5);
    expect(out[0]!.id).toBe('both'); // both lanes = best
    expect(out.length).toBeGreaterThan(0);
  });
});