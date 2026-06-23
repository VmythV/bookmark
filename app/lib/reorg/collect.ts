/**
 * Collect bookmarks in a scope and embed them for reorganization.
 * See docs/detailed-design.md §6, §7.
 *
 * Reuses cached bookmark vectors when the bookmark's text is unchanged (by
 * textHash), and persists newly computed vectors as 'bookmark' entries so
 * repeated reorg runs are cheap.
 */
import { listBookmarks } from '../services/bookmarks';
import * as store from '../services/vectorStore';
import { embed } from '../rag/embedderClient';
import { textHash } from '../rag/folderText';
import { throwIfCancelled } from '../shared/cancel';
import type { ReorgScope, VectorEntry } from '../shared/types';

export interface EmbeddedBookmark {
  id: string;
  title: string;
  url: string;
  vector: number[];
}

function bookmarkText(title: string, url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return [title, host].filter(Boolean).join(' • ');
}

const BATCH = 16;

/**
 * Collect and embed all bookmarks in the scope. Returns each bookmark with its
 * vector (cached or freshly computed). Reports progress as embedding proceeds.
 */
export async function collectEmbeddedBookmarks(
  scope: ReorgScope,
  onProgress?: (done: number, total: number) => void,
): Promise<EmbeddedBookmark[]> {
  const rootId = scope.kind === 'folder' ? scope.folderId : undefined;
  const bookmarks = await listBookmarks(rootId);

  // Reuse cached bookmark vectors when text is unchanged.
  const cached = new Map(
    (await store.getAll('bookmark')).map((e) => [e.key, e]),
  );

  const result: EmbeddedBookmark[] = [];
  const toEmbed: Array<{ b: (typeof bookmarks)[number]; text: string; hash: string }> = [];

  for (const b of bookmarks) {
    const text = bookmarkText(b.title, b.url);
    const hash = textHash(text);
    const hit = cached.get(b.id);
    if (hit && hit.textHash === hash) {
      result.push({ id: b.id, title: b.title, url: b.url, vector: hit.vector });
    } else {
      toEmbed.push({ b, text, hash });
    }
  }

  let done = 0;
  const total = toEmbed.length;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    throwIfCancelled();
    const chunk = toEmbed.slice(i, i + BATCH);
    const vectors = await embed(chunk.map((c) => c.text));
    const entries: VectorEntry[] = [];
    chunk.forEach((c, j) => {
      const vector = vectors[j] ?? [];
      result.push({ id: c.b.id, title: c.b.title, url: c.b.url, vector });
      entries.push({
        key: c.b.id,
        kind: 'bookmark',
        vector,
        textHash: c.hash,
        updatedAt: Date.now(),
      });
    });
    await store.upsertMany(entries);
    done += chunk.length;
    onProgress?.(done, total);
  }

  return result;
}
