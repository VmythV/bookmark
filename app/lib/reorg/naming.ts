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

function keywordName(titles: string[]): string {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const tokens = title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2 && !STOP.has(t));
    for (const t of new Set(tokens)) counts.set(t, (counts.get(t) ?? 0) + 1);
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
