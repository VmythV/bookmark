import { describe, it, expect } from 'vitest';
import { recommendByKeywords } from './fallback';
import type { FolderCandidate, PageInfo } from '../shared/types';

const page = (over: Partial<PageInfo> = {}): PageInfo => ({
  url: 'https://example.com/page',
  title: 'Untitled',
  ...over,
});

const folder = (id: string, path: string, samples: string[] = []): FolderCandidate => ({
  id,
  path,
  sampleTitles: samples,
});

describe('recommendByKeywords', () => {
  it('matches an existing folder by keyword overlap', () => {
    const rec = recommendByKeywords(
      page({ title: 'The Rust Programming Language', url: 'https://doc.rust-lang.org/book/' }),
      [folder('1', 'Dev/Rust', ['Rust by Example']), folder('2', 'Cooking')],
    );
    expect(rec.action).toBe('use_existing');
    expect(rec.folderId).toBe('1');
  });

  it('proposes a new folder when nothing overlaps', () => {
    const rec = recommendByKeywords(
      page({ title: 'Quantum entanglement explained', url: 'https://physics.test/q' }),
      [folder('1', 'Cooking'), folder('2', 'Travel')],
    );
    expect(rec.action).toBe('create_new');
    expect(rec.newFolderPath).toBeTruthy();
  });

  it('falls back to a create_new even with no candidates', () => {
    const rec = recommendByKeywords(page({ title: 'Something New' }), []);
    expect(rec.action).toBe('create_new');
    expect(rec.newFolderPath).toBeTruthy();
  });

  it('handles Chinese titles (CJK tokenization keeps characters)', () => {
    const rec = recommendByKeywords(
      page({ title: '机器学习入门教程', url: 'https://ml.test/' }),
      [folder('1', '机器学习', ['深度学习基础']), folder('2', 'Cooking')],
    );
    // Should not throw, and should prefer the matching Chinese folder.
    expect(rec.action).toBe('use_existing');
    expect(rec.folderId).toBe('1');
  });

  it('produces a confidence within [0,1]', () => {
    const rec = recommendByKeywords(
      page({ title: 'Rust Rust Rust Rust Rust', url: 'https://rust.test/' }),
      [folder('1', 'Rust', ['Rust', 'Rust', 'Rust'])],
    );
    expect(rec.confidence).toBeGreaterThanOrEqual(0);
    expect(rec.confidence).toBeLessThanOrEqual(1);
  });
});
