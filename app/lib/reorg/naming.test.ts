import { describe, it, expect } from 'vitest';
import { keywordName, sharedTokensOf, suggestFolderName } from './naming';
import type { ChatConfig } from '../shared/types';

const NO_CHAT: ChatConfig = { enabled: false, endpoint: '', apiKey: '', model: '' };

describe('keywordName', () => {
  it('surfaces the dominant shared token, capitalized', () => {
    const { name, sharedTokens } = keywordName([
      'Rust ownership',
      'Rust lifetimes',
      'Rust async',
    ]);
    expect(sharedTokens[0]).toBe('rust');
    expect(name).toMatch(/^Rust/);
  });

  it('returns a sensible fallback when titles share nothing meaningful', () => {
    const { name } = keywordName(['a', 'to', 'the']);
    expect(name).toBe('New group');
  });

  it('never returns an empty name', () => {
    expect(keywordName(['']).name).toBeTruthy();
    expect(keywordName([]).name).toBeTruthy();
  });
});

describe('sharedTokensOf', () => {
  it('ranks tokens by document frequency (ties broken by length)', () => {
    const toks = sharedTokensOf(['machine learning', 'machine vision', 'deep learning']);
    // machine & learning both appear in 2 titles; both outrank the df-1 tokens.
    expect(toks.slice(0, 2).sort()).toEqual(['learning', 'machine']);
    expect(toks.indexOf('machine')).toBeLessThan(toks.indexOf('vision'));
  });
});

describe('suggestFolderName (no chat)', () => {
  it('falls back to the keyword name', async () => {
    const out = await suggestFolderName(['Rust ownership', 'Rust async'], NO_CHAT);
    expect(out.name).toMatch(/^Rust/);
    expect(out.sharedTokens[0]).toBe('rust');
  });
});
