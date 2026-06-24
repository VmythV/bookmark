/**
 * Tokenization utilities used by both the recommender (lexical score) and the
 * search (lexical match). Pure, browser-free, covered by unit tests.
 */

const RE_CJK = /[㐀-鿿぀-ヿ가-힯]/;
const RE_CJK_RUN = /[㐀-鿿぀-ヿ가-힯]+/g;
const RE_WORD_SEPARATORS = /[^\p{L}\p{N}]+/u;

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'with',
  'is', 'are', 'this', 'that', 'it', 'be', 'as', 'at', 'by', 'from',
  'how', 'why', 'what', 'which', 'who', 'your', 'you', 'we',
  'com', 'www', 'net', 'org', 'io', 'html', 'http', 'https',
]);

/** Return a set of tokens from text. CJK runs become unigrams + bigrams. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const cjkRuns = text.match(RE_CJK_RUN) ?? [];
  for (const run of cjkRuns) {
    const chars = [...run];
    for (const ch of chars) out.add(ch);
    for (let i = 0; i < chars.length - 1; i++) {
      out.add(chars[i]! + chars[i + 1]!);
    }
  }
  const nonCjk = text.replace(RE_CJK_RUN, ' ');
  for (const word of nonCjk.split(RE_WORD_SEPARATORS)) {
    const w = word.trim().toLowerCase();
    if (w.length > 1 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** Extract the host from a URL, dropping 'www.'. Returns '' on failure. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Stable FNV-1a 32-bit hash (hex). */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Set intersection size. */
export function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) n++;
  return n;
}