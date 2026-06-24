/**
 * Name a proposed new folder from a cluster of bookmark titles. Prefers the
 * chat LLM (concise, human) and falls back to a deterministic keyword name when
 * chat is unconfigured or fails. keywordName is pure — unit-tested.
 */
import * as chat from '../providers/chat';
import { tokenize } from '../shared/text';
import type { ChatConfig } from '../shared/types';

const MAX_NAME_LEN = 40;

function cap(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** Rank tokens by how many titles share them (then by length). */
export function sharedTokensOf(titles: string[]): string[] {
  const df = new Map<string, number>();
  for (const title of titles) {
    for (const tok of tokenize(title)) {
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }
  return [...df.entries()]
    .filter(([tok]) => tok.length > 1)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([tok]) => tok);
}

/** Deterministic fallback name + the shared tokens that produced it. */
export function keywordName(titles: string[]): {
  name: string;
  sharedTokens: string[];
} {
  const sharedTokens = sharedTokensOf(titles);
  const pick = sharedTokens.slice(0, 2).map(cap);
  const name = pick.length ? pick.join(' ') : 'New group';
  return { name, sharedTokens };
}

function sanitize(raw: string, fallback: string): string {
  const name = raw.replace(/["\n\r]/g, '').trim().slice(0, MAX_NAME_LEN);
  return name || fallback;
}

/**
 * Suggest a folder name for a cluster. Uses chat when available; otherwise the
 * keyword fallback. Always returns a non-empty name + the shared tokens.
 */
export async function suggestFolderName(
  titles: string[],
  cfg: ChatConfig,
): Promise<{ name: string; sharedTokens: string[] }> {
  const fallback = keywordName(titles);
  if (!chat.isConfigured(cfg)) return fallback;

  try {
    const sample = titles.slice(0, 12).map((t) => `- ${t}`).join('\n');
    const text = await chat.chat(
      [
        {
          role: 'system',
          content:
            'You name bookmark folders. Given a list of page titles that belong together, reply ONLY with JSON {"name": "..."} where name is a concise 1-3 word folder name (Title Case, no quotes).',
        },
        { role: 'user', content: sample },
      ],
      cfg,
      { jsonMode: true },
    );
    const parsed = chat.extractJson<{ name?: string }>(text);
    return {
      name: sanitize(String(parsed.name ?? ''), fallback.name),
      sharedTokens: fallback.sharedTokens,
    };
  } catch {
    return fallback;
  }
}
