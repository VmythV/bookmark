import { describe, it, expect } from 'vitest';
import { tokenize, hostOf, textHash, overlap } from './text';

describe('tokenize', () => {
  it('keeps English words', () => {
    expect([...tokenize('Rust Programming Language')].sort()).toEqual(
      ['language', 'programming', 'rust'],
    );
  });

  it('splits CJK into unigrams + bigrams', () => {
    const toks = tokenize('机器学习');
    expect(toks).toEqual(
      new Set(['机', '器', '习', '机器', '器学', '学习', '学']),
    );
  });

  it('drops stopwords', () => {
    expect([...tokenize('how to use the tool')].sort()).toEqual(['tool', 'use']);
  });

  it('handles mixed CJK + English', () => {
    const toks = [...tokenize('Rust 编程入门')];
    expect(toks).toContain('rust');
    expect(toks).toContain('编');
    expect(toks).toContain('编程');
    expect(toks).toContain('程入');
  });
});

describe('hostOf', () => {
  it('drops leading www', () => {
    expect(hostOf('https://www.baidu.com/x')).toBe('baidu.com');
  });
  it('returns empty for bad url', () => {
    expect(hostOf('not a url')).toBe('');
  });
});

describe('textHash', () => {
  it('is stable', () => {
    expect(textHash('hello')).toBe(textHash('hello'));
  });
  it('differs for different input', () => {
    expect(textHash('hello')).not.toBe(textHash('world'));
  });
});

describe('overlap', () => {
  it('counts shared elements', () => {
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'w']);
    expect(overlap(a, b)).toBe(2);
  });
  it('returns 0 when disjoint', () => {
    expect(overlap(new Set(['a']), new Set(['b']))).toBe(0);
  });
});