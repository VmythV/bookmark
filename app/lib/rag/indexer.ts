/**
 * Folder vector index lifecycle: full build + incremental updates.
 * See docs/detailed-design.md §7.
 *
 * The index is a derived cache of the bookmark tree; it can be rebuilt from
 * scratch at any time. Incremental updates keep it in sync with bookmark events.
 */
import { listFolders } from '../services/bookmarks';
import * as store from '../services/vectorStore';
import { embed } from './embedderClient';
import { folderRepresentativeText, textHash } from './folderText';
import type { VectorEntry } from '../shared/types';

const BATCH = 16;

export interface BuildProgress {
  done: number;
  total: number;
  phase: 'embedding';
}

/**
 * Full (re)build of the folder index. Only re-embeds folders whose
 * representative text changed (via textHash); unchanged folders are skipped.
 * Removes index entries for folders that no longer exist.
 */
export async function buildIndex(
  onProgress?: (p: BuildProgress) => void,
): Promise<{ embedded: number; skipped: number; removed: number }> {
  const folders = await listFolders();
  const liveIds = new Set(folders.map((f) => f.id));

  // Drop entries for deleted folders.
  const existing = await store.getAll('folder');
  let removed = 0;
  for (const e of existing) {
    if (!liveIds.has(e.key)) {
      await store.remove(e.key);
      removed++;
    }
  }
  const byKey = new Map(existing.map((e) => [e.key, e]));

  // Compute representative text + hash for each folder; collect those needing embedding.
  const toEmbed: Array<{ id: string; text: string; hash: string }> = [];
  let skipped = 0;
  for (const f of folders) {
    const text = await folderRepresentativeText(f.id, f.path);
    const hash = textHash(text);
    if (byKey.get(f.id)?.textHash === hash) {
      skipped++;
      continue;
    }
    toEmbed.push({ id: f.id, text, hash });
  }

  const total = toEmbed.length;
  let done = 0;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const chunk = toEmbed.slice(i, i + BATCH);
    const vectors = await embed(chunk.map((c) => c.text));
    const entries: VectorEntry[] = chunk.map((c, j) => ({
      key: c.id,
      kind: 'folder',
      vector: vectors[j] ?? [],
      textHash: c.hash,
      updatedAt: Date.now(),
    }));
    await store.upsertMany(entries);
    done += chunk.length;
    onProgress?.({ done, total, phase: 'embedding' });
  }

  return { embedded: total, skipped, removed };
}

/** True if the index has at least one folder entry. */
export async function isIndexed(): Promise<boolean> {
  return (await store.count('folder')) > 0;
}

/** Re-embed a single folder (used by incremental updates). */
export async function reindexFolder(
  folderId: string,
  path: string,
): Promise<void> {
  const text = await folderRepresentativeText(folderId, path);
  const hash = textHash(text);
  const existing = await store.get(folderId);
  if (existing?.textHash === hash) return;
  const [vector] = await embed([text]);
  await store.upsert({
    key: folderId,
    kind: 'folder',
    vector: vector ?? [],
    textHash: hash,
    updatedAt: Date.now(),
  });
}

/**
 * Subscribe to bookmark events and keep the folder index in sync.
 * Returns an unsubscribe function. Errors are logged, never thrown, so a single
 * failed update can't break the listener.
 */
export function startIncrementalSync(): () => void {
  const refreshFolderOf = async (folderId: string | undefined) => {
    if (!folderId) return;
    try {
      const folders = await listFolders();
      const f = folders.find((x) => x.id === folderId);
      if (f) await reindexFolder(f.id, f.path);
    } catch (err) {
      console.error('[smart-bookmark] incremental sync failed', err);
    }
  };

  const onCreated = (
    _id: string,
    node: chrome.bookmarks.BookmarkTreeNode,
  ) => void refreshFolderOf(node.url === undefined ? node.id : node.parentId);
  const onRemoved = (
    id: string,
    info: { parentId: string },
  ) => {
    void store.remove(id); // in case it was a folder
    void refreshFolderOf(info.parentId);
  };
  const onChanged = (id: string) => void refreshFolderOf(id);
  const onMoved = (
    _id: string,
    info: { parentId: string; oldParentId: string },
  ) => {
    void refreshFolderOf(info.parentId);
    void refreshFolderOf(info.oldParentId);
  };

  chrome.bookmarks.onCreated.addListener(onCreated);
  chrome.bookmarks.onRemoved.addListener(onRemoved);
  chrome.bookmarks.onChanged.addListener(onChanged);
  chrome.bookmarks.onMoved.addListener(onMoved);

  return () => {
    chrome.bookmarks.onCreated.removeListener(onCreated);
    chrome.bookmarks.onRemoved.removeListener(onRemoved);
    chrome.bookmarks.onChanged.removeListener(onChanged);
    chrome.bookmarks.onMoved.removeListener(onMoved);
  };
}
