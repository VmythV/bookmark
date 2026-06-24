/**
 * Batch-embed bookmarks for the reorganizer's vector lane + clustering.
 * Only re-embeds rows whose text hash changed (reuses cached vectors), batches
 * network calls, reports progress, and honors cancellation. Vectors are
 * L2-normalized before storage (embedding.embed does NOT normalize).
 */
import * as embedding from '../providers/embedding';
import { setEmbedding } from '../services/bookmarks';
import { hostOf, textHash } from '../shared/text';
import { throwIfCancelled, type CancelToken } from '../shared/cancel';
import type { EmbeddingConfig, StoredBookmark } from '../shared/types';
import type { ReorgProgress } from './types';

const BATCH = 64;

/** The text we embed for a bookmark: title + tags + host. */
export function embedText(b: StoredBookmark): string {
  return [b.title, b.tags.join(' '), hostOf(b.url)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' • ');
}

export interface EmbedFillOptions {
  onProgress?: (p: ReorgProgress) => void;
  token?: CancelToken;
}

/**
 * Fill missing/stale embeddings in place. Mutates and persists each affected
 * bookmark. Returns the count actually embedded.
 */
export async function embedMissing(
  bookmarks: StoredBookmark[],
  cfg: EmbeddingConfig,
  opts: EmbedFillOptions = {},
): Promise<number> {
  if (!embedding.isConfigured(cfg)) return 0;

  // Determine which rows need (re)embedding.
  const pending: Array<{ b: StoredBookmark; text: string; hash: string }> = [];
  for (const b of bookmarks) {
    const text = embedText(b);
    if (!text) continue;
    const hash = textHash(text);
    if (b.embedding && b.embeddingTextHash === hash) continue;
    pending.push({ b, text, hash });
  }

  const total = pending.length;
  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    throwIfCancelled(opts.token);
    const chunk = pending.slice(i, i + BATCH);
    // Emit a tick BEFORE the network await: doubles as an MV3 SW keepalive.
    opts.onProgress?.({
      phase: 'embedding',
      done,
      total,
      message: `Embedding ${done}/${total}`,
    });
    const vectors = await embedding.embed(
      chunk.map((c) => c.text),
      cfg,
    );
    for (let j = 0; j < chunk.length; j++) {
      const vec = vectors[j];
      const { b, hash } = chunk[j]!;
      if (!vec?.length) continue;
      const unit = embedding.normalize(vec);
      b.embedding = unit;
      b.embeddingTextHash = hash;
      await setEmbedding(b.id, unit, hash);
    }
    done += chunk.length;
  }

  opts.onProgress?.({
    phase: 'embedding',
    done,
    total,
    message: `Embedded ${done}/${total}`,
  });
  return done;
}
