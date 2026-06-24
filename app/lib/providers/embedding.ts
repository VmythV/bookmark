/**
 * Cloud OpenAI-compatible embedding provider.
 * Configured independently of the chat provider — a user may use embedding
 * (DeepSeek/OpenAI/etc.) but disable chat, or vice versa.
 *
 * Endpoint: POST {endpoint}/embeddings
 * Body: { model, input }
 * Returns: { data: Array<{ embedding: number[] }> }
 */
import type { EmbeddingConfig } from '../shared/types';

export class EmbeddingUnavailableError extends Error {
  constructor(reason: string) {
    super(`embedding unavailable: ${reason}`);
    this.name = 'EmbeddingUnavailableError';
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function isConfigured(cfg: EmbeddingConfig): boolean {
  return cfg.enabled && !!cfg.endpoint && !!cfg.apiKey && !!cfg.model;
}

/**
 * Embed a list of texts. Throws EmbeddingUnavailableError if not configured,
 * rethrows HTTP errors with status code preserved.
 */
export async function embed(
  texts: string[],
  cfg: EmbeddingConfig,
): Promise<number[][]> {
  if (!isConfigured(cfg)) {
    throw new EmbeddingUnavailableError('not configured or disabled');
  }
  if (texts.length === 0) return [];
  const res = await fetch(joinUrl(cfg.endpoint, '/embeddings'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.model, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data) throw new Error('embeddings: malformed response');
  return data.data.map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  cfg: EmbeddingConfig,
): Promise<number[] | null> {
  try {
    const [vec] = await embed([text], cfg);
    return vec ?? null;
  } catch {
    return null;
  }
}

/** Probe the provider with a tiny input. */
export async function test(cfg: EmbeddingConfig): Promise<void> {
  if (!isConfigured(cfg)) {
    throw new EmbeddingUnavailableError('not configured or disabled');
  }
  const out = await embed(['hi'], cfg);
  if (!out[0]?.length) throw new Error('empty embedding returned');
}

/** L2-normalize a vector in place. */
export function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

/** Cosine similarity for two unit-length vectors. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}