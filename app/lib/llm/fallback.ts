/**
 * Keyword-rule fallback recommendation, used when the LLM is unconfigured,
 * offline, or errors out. Returns the same SaveRecommendation shape so callers
 * are agnostic to whether the LLM ran. See docs/detailed-design.md §8, §13.
 *
 * Strategy: score each candidate by token overlap between the page
 * (title + host + description) and the folder path. Pick the best if it clears
 * a small threshold; otherwise propose a new folder named from the page.
 */
import type {
  FolderCandidate,
  PageInfo,
  SaveRecommendation,
} from '../shared/types';

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'with',
  'com', 'www', 'net', 'org', 'io', 'html', 'http', 'https',
]);

const CJK = /[㐀-鿿぀-ヿ가-힯]/;

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  const segments = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  for (const seg of segments) {
    if (!seg) continue;
    if (CJK.test(seg)) {
      // CJK has no word spacing: index unigrams + bigrams so that e.g.
      // "机器学习入门" overlaps with a "机器学习" folder.
      const chars = [...seg];
      for (const ch of chars) out.add(ch);
      for (let i = 0; i < chars.length - 1; i++) out.add(chars[i]! + chars[i + 1]!);
    } else if (seg.length > 1 && !STOP.has(seg)) {
      out.add(seg);
    }
  }
  return out;
}

function pageTokens(page: PageInfo): Set<string> {
  let host = '';
  try {
    host = new URL(page.url).hostname;
  } catch {
    /* ignore */
  }
  return tokenize(
    [page.title, host, page.description].filter(Boolean).join(' '),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/** Best-effort recommendation without an LLM. */
export function recommendByKeywords(
  page: PageInfo,
  candidates: FolderCandidate[],
): SaveRecommendation {
  const pt = pageTokens(page);

  let best: { c: FolderCandidate; score: number } | null = null;
  for (const c of candidates) {
    const ct = tokenize(`${c.path} ${c.sampleTitles.join(' ')}`);
    const score = overlap(pt, ct);
    if (!best || score > best.score) best = { c, score };
  }

  if (best && best.score > 0) {
    return {
      action: 'use_existing',
      folderId: best.c.id,
      confidence: Math.min(1, best.score / 4),
      reason: `Keyword match with "${best.c.path}" (no LLM configured).`,
    };
  }

  // No overlap → propose a folder named after the page's main token or host.
  const firstToken = [...pt][0];
  const name = firstToken
    ? firstToken[0]!.toUpperCase() + firstToken.slice(1)
    : 'Unsorted';
  return {
    action: 'create_new',
    newFolderPath: name,
    confidence: 0.2,
    reason: `No matching folder; suggested a new "${name}" (no LLM configured).`,
  };
}
