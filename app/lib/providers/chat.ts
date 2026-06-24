/**
 * Cloud OpenAI-compatible chat provider.
 * Used for:
 *   - generating tag suggestions for a bookmark (uses embeddings for clustering
 *     of existing tags; the chat itself is only used in M8 for natural-language
 *     search. This iteration keeps it minimal.)
 *
 * Compatibility: most gateways support `response_format: { type: "json_object" }`
 * (not `json_schema`). The caller is responsible for asking in a JSON-friendly way.
 */
import type { ChatConfig } from '../shared/types';

export class ChatUnavailableError extends Error {
  constructor(reason: string) {
    super(`chat unavailable: ${reason}`);
    this.name = 'ChatUnavailableError';
  }
}

export function isConfigured(cfg: ChatConfig): boolean {
  return cfg.enabled && !!cfg.endpoint && !!cfg.apiKey && !!cfg.model;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Single chat completion returning the assistant text. Throws if not configured.
 */
export async function chat(
  messages: ChatMessage[],
  cfg: ChatConfig,
  opts: { jsonMode?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  if (!isConfigured(cfg)) throw new ChatUnavailableError('not configured');
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(joinUrl(cfg.endpoint, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`chat HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('chat: empty content');
  return content;
}

/** Extract the first JSON object from a possibly-prosey LLM response. */
export function extractJson<T = unknown>(text: string): T {
  const stripped = text
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const start = stripped.indexOf('{');
    if (start < 0) {
      const arr = stripped.indexOf('[');
      if (arr < 0) throw new Error('no JSON in chat response');
      let depth = 0;
      for (let i = arr; i < stripped.length; i++) {
        const ch = stripped[i];
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) return JSON.parse(stripped.slice(arr, i + 1)) as T;
        }
      }
      throw new Error('unterminated JSON in chat response');
    }
    let depth = 0;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(stripped.slice(start, i + 1)) as T;
      }
    }
    throw new Error('unterminated JSON in chat response');
  }
}

/** Probe the provider with a tiny message. */
export async function test(cfg: ChatConfig): Promise<void> {
  if (!isConfigured(cfg)) throw new ChatUnavailableError('not configured');
  await chat(
    [
      { role: 'system', content: 'Reply with the single word: pong' },
      { role: 'user', content: 'ping' },
    ],
    cfg,
  );
}