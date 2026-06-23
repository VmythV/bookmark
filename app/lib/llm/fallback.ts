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

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    // split on non-alphanumeric (keeps CJK characters as-is)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
  return new Set(tokens);
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
