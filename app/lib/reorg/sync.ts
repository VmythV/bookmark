/**
 * Mirror the native chrome.bookmarks tree into our IndexedDB store so the
 * reorganizer can reason over EVERY bookmark — not just the ones saved through
 * the extension. New leaves are inserted with neutral defaults; existing rows
 * have their folder (and title/url) refreshed; rows whose native node is gone
 * are pruned. The pure merge core (mergeTree) is unit-tested.
 */
import * as store from '../store/db';
import { getTree, walk, isFolder } from '../services/bookmarks';
import type { BookmarkNode, StoredBookmark } from '../shared/types';

/** A leaf bookmark as seen in the live native tree. */
export interface LiveLeaf {
  id: string;
  url: string;
  title: string;
  folderId: string;
  folderPath: string;
  dateAdded?: number;
}

export interface MergeResult {
  /** Full corpus after sync (one record per live leaf). */
  merged: StoredBookmark[];
  /** Records that are new or changed and must be written back. */
  upserts: StoredBookmark[];
  /** Stored ids whose native node no longer exists. */
  pruneIds: string[];
}

/**
 * Reconcile stored records against the live tree. Pure — no IDB / chrome.
 * @param now timestamp used as savedAt for new leaves lacking dateAdded.
 */
export function mergeTree(
  stored: StoredBookmark[],
  live: LiveLeaf[],
  now: number,
): MergeResult {
  const storedById = new Map(stored.map((b) => [b.id, b]));
  const liveIds = new Set(live.map((l) => l.id));

  const merged: StoredBookmark[] = [];
  const upserts: StoredBookmark[] = [];

  for (const leaf of live) {
    const prev = storedById.get(leaf.id);
    if (prev) {
      const changed =
        prev.folderId !== leaf.folderId ||
        prev.folderPath !== leaf.folderPath ||
        prev.title !== leaf.title ||
        prev.url !== leaf.url;
      // Refresh placement/identity, preserve tags/embedding/usage/prefer.
      const next: StoredBookmark = changed
        ? {
            ...prev,
            folderId: leaf.folderId,
            folderPath: leaf.folderPath,
            title: leaf.title,
            url: leaf.url,
          }
        : prev;
      merged.push(next);
      if (changed) upserts.push(next);
    } else {
      const fresh: StoredBookmark = {
        id: leaf.id,
        url: leaf.url,
        title: leaf.title || leaf.url,
        folderId: leaf.folderId,
        folderPath: leaf.folderPath,
        tags: [],
        embedding: null,
        embeddingTextHash: null,
        useCount: 0,
        lastUsed: null,
        savedAt: leaf.dateAdded ?? now,
        preferFolder: false, // not an explicit user choice
      };
      merged.push(fresh);
      upserts.push(fresh);
    }
  }

  const pruneIds = stored.filter((b) => !liveIds.has(b.id)).map((b) => b.id);
  return { merged, upserts, pruneIds };
}

/** Collect every leaf bookmark from the native tree with its folder path. */
export async function collectLiveLeaves(): Promise<LiveLeaf[]> {
  const tree = await getTree();
  const out: LiveLeaf[] = [];
  walk(tree, (node: BookmarkNode, path) => {
    if (!isFolder(node) && node.url) {
      out.push({
        id: node.id,
        url: node.url,
        title: node.title,
        folderId: node.parentId ?? '',
        folderPath: path.join('/'),
        dateAdded: node.dateAdded,
      });
    }
  });
  return out;
}

/**
 * Sync the store from the native tree and return the merged corpus.
 * Persists upserts and prunes deletions.
 */
export async function syncStoreFromTree(
  now: number = Date.now(),
): Promise<StoredBookmark[]> {
  const [stored, live] = await Promise.all([store.getAll(), collectLiveLeaves()]);
  const { merged, upserts, pruneIds } = mergeTree(stored, live, now);
  await store.putMany(upserts);
  await Promise.all(pruneIds.map((id) => store.remove(id)));
  return merged;
}
