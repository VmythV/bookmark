/**
 * Name a cluster of bookmarks. Uses the LLM when configured, otherwise falls
 * back to the most frequent meaningful keyword among the titles.
 * See docs/detailed-design.md §6, §8.
 */
import { getConfig } from '../services/storage';
import { nameFolder } from '../llm/provider';

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'with',
  'how', 'why', 'what', 'your', 'you', 'is', 'are', 'this', 'that',
]);

const CJK = /[㐀-鿿぀-ヿ가-힯]/;

function tokensOf(title: string): string[] {
  const out: string[] = [];
  for (const seg of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!seg) continue;
    if (CJK.test(seg)) {
      // CJK: prefer bigrams (more name-like than single chars).
      const chars = [...seg];
      if (chars.length === 1) {
        out.push(chars[0]!);
      } else {
        for (let i = 0; i < chars.length - 1; i++) out.push(chars[i]! + chars[i + 1]!);
      }
    } else if (seg.length > 2 && !STOP.has(seg)) {
      out.push(seg);
    }
  }
  return out;
}

function keywordName(titles: string[]): string {
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const t of new Set(tokensOf(title))) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  let best = '';
  let bestN = 0;
  for (const [t, n] of counts) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  if (!best) return 'Group';
  return best[0]!.toUpperCase() + best.slice(1);
}

/**
 * Suggest a folder name for a cluster given member titles.
 * Tries the LLM; on any failure or missing config, uses the keyword heuristic.
 */
export async function suggestFolderName(titles: string[]): Promise<string> {
  try {
    const cfg = await getConfig();
    if (cfg.llm.endpoint && cfg.llm.apiKey && cfg.llm.model) {
      const name = await nameFolder(titles, cfg.llm);
      if (name?.trim()) return name.trim();
    }
  } catch (err) {
    console.warn('[smart-bookmark] LLM naming failed, using keyword fallback', err);
  }
  return keywordName(titles);
}
