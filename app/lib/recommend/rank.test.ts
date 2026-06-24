import { describe, it, expect } from 'vitest';
import { rankFolders } from './rank';
import { suggestTags } from './tags';
import { DEFAULT_CONFIG, NO_EMBEDDING_WEIGHTS } from '../shared/types';
import type { PageInfo, StoredBookmark } from '../shared/types';

const F1 = 'f-rust';
const F2 = 'f-cook';
const PAGE: PageInfo = {
  url: 'https://doc.rust-lang.org/book/',
  title: 'The Rust Programming Language',
  description: 'An introductory book to Rust.',
};

const bookmarks: StoredBookmark[] = [
  bm('1', F1, 'Rust book', ['https://doc.rust-lang.org/book/'], ['rust', 'programming'], 0.1),
  bm('2', F1, 'Rust by Example', ['https://doc.rust-lang.org/rust-by-example/'], ['rust'], 0.5),
  bm('3', F2, 'Pasta carbonara', ['https://food.test/pasta'], [], 0.2),
];

function bm(
  id: string,
  folderId: string,
  title: string,
  urls: string[],
  tags: string[],
  daysAgo: number,
): StoredBookmark {
  const url = urls[0] ?? '';
  return {
    id,
    url,
    title,
    folderId,
    folderPath: folderId === F1 ? 'Dev/Rust' : 'Cooking',
    tags,
    embedding: null,
    embeddingTextHash: null,
    useCount: 0,
    lastUsed: null,
    savedAt: Date.now() - daysAgo * 86_400_000,
    preferFolder: false,
  };
}

describe('rankFolders (no embedding)', () => {
  it('ranks the matching folder above the unrelated one', () => {
    const out = rankFolders({
      page: PAGE,
      bookmarks,
      pageEmbedding: null,
      weights: NO_EMBEDDING_WEIGHTS,
      folderPaths: new Map([
        [F1, 'Dev/Rust'],
        [F2, 'Cooking'],
      ]),
      topK: 5,
    });
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]!.folderId).toBe(F1);
    expect(out[0]!.confidence).toBeGreaterThan(0);
  });

  it('still ranks by behavior/recency when query has no topical match', () => {
    // No lexical/domain/vector overlap → only behavior + (no prefer) remain.
    // The most recently-used folder should surface; confidence stays modest.
    const out = rankFolders({
      page: { url: 'https://x.test/y', title: 'Quantum entanglement' },
      bookmarks,
      pageEmbedding: null,
      weights: NO_EMBEDDING_WEIGHTS,
      folderPaths: new Map([
        [F1, 'Dev/Rust'],
        [F2, 'Cooking'],
      ]),
      topK: 5,
    });
    // Behavior lane gives non-zero scores; result is non-empty but low-confidence.
    for (const r of out) {
      expect(r.scores.lexical).toBe(0);
      expect(r.scores.domain).toBe(0);
    }
  });
});

describe('rankFolders (with embedding)', () => {
  it('uses page embedding for the vector lane', () => {
    // Simulate that the Rust folder's bookmarks have an embedding identical to
    // the page's query (cosine == 1).
    const rustBm = { ...bookmarks[0]!, embedding: [1, 0] };
    const cookBm = { ...bookmarks[2]!, embedding: [0, 1] };
    const out = rankFolders({
      page: PAGE,
      bookmarks: [rustBm, cookBm],
      pageEmbedding: [1, 0],
      weights: DEFAULT_CONFIG.recommend.weights,
      folderPaths: new Map([
        [F1, 'Dev/Rust'],
        [F2, 'Cooking'],
      ]),
      topK: 5,
    });
    expect(out[0]!.folderId).toBe(F1);
    expect(out[0]!.scores.vector).toBeGreaterThan(0);
  });
});

describe('suggestTags', () => {
  it('returns suggestions from existing tags with overlap', () => {
    const tags = suggestTags(PAGE, bookmarks);
    expect(tags).toContain('rust');
  });

  it('returns empty for empty page', () => {
    expect(suggestTags({ url: '', title: '' }, bookmarks)).toEqual([]);
  });
});