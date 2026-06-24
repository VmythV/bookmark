/**
 * Wrapper over chrome.bookmarks + our own IndexedDB mirror.
 * The native tree remains source-of-truth for hierarchy; the mirror stores
 * augmented metadata (tags, embedding, usage stats, prefer flag).
 * See docs/detailed-design.md §3.
 */
import * as store from '../store/db';
import type { BookmarkNode, StoredBookmark } from '../shared/types';

/** Read the full bookmark tree. */
export async function getTree(): Promise<BookmarkNode[]> {
  return chrome.bookmarks.getTree() as Promise<BookmarkNode[]>;
}

/** True if a node is a folder. */
export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

/** Recursive walk over a tree. */
export function walk(
  nodes: BookmarkNode[],
  fn: (node: BookmarkNode, path: string[]) => void,
  path: string[] = [],
): void {
  for (const node of nodes) {
    fn(node, path);
    if (node.children) {
      const next = node.title ? [...path, node.title] : path;
      walk(node.children, fn, next);
    }
  }
}

/** All folders with their full display path, e.g. "Dev/Rust". */
export async function listFolders(): Promise<
  Array<{ id: string; path: string }>
> {
  const tree = await getTree();
  const out: Array<{ id: string; path: string }> = [];
  walk(tree, (node, path) => {
    if (isFolder(node) && node.title) {
      out.push({ id: node.id, path: [...path, node.title].join('/') });
    }
  });
  return out;
}

/** Default parent for new bookmarks: bookmarks bar (id '1') else first writable root. */
export async function defaultParentId(): Promise<string> {
  const tree = await getTree();
  const root = tree[0];
  const barId = root?.children?.find((c) => c.id === '1')?.id;
  return barId ?? root?.children?.[0]?.id ?? '1';
}

/** Get the path string for a given folder id. */
export async function folderPath(folderId: string): Promise<string> {
  const folders = await listFolders();
  return folders.find((f) => f.id === folderId)?.path ?? '';
}

/** Create a bookmark under `parentId`. */
export async function createBookmark(
  parentId: string,
  title: string,
  url: string,
): Promise<BookmarkNode> {
  return chrome.bookmarks.create({ parentId, title, url }) as Promise<BookmarkNode>;
}

/** Create a folder under `parentId`. */
export async function createFolder(
  parentId: string,
  title: string,
): Promise<BookmarkNode> {
  return chrome.bookmarks.create({ parentId, title }) as Promise<BookmarkNode>;
}

/** Move a node to a new parent. */
export async function moveNode(
  id: string,
  parentId: string,
): Promise<BookmarkNode> {
  return chrome.bookmarks.move(id, { parentId }) as Promise<BookmarkNode>;
}

/**
 * Ensure a folder path exists under `rootId`, creating missing segments.
 * Returns the final segment's folder id.
 */
export async function ensureFolderPath(
  path: string,
  rootId?: string,
): Promise<string> {
  const root = rootId ?? (await defaultParentId());
  const segments = path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  let parentId = root;
  for (const segment of segments) {
    const children = (await chrome.bookmarks.getChildren(
      parentId,
    )) as BookmarkNode[];
    const existing = children.find(
      (c) => c.url === undefined && c.title === segment,
    );
    parentId = existing
      ? existing.id
      : (await createFolder(parentId, segment)).id;
  }
  return parentId;
}

/**
 * Create a native bookmark and mirror it into our store with the chosen tags.
 * Returns the new bookmark id.
 */
export async function saveWithTags(
  parentId: string,
  title: string,
  url: string,
  tags: string[],
): Promise<string> {
  const node = await createBookmark(parentId, title || url, url);
  const path = await folderPath(parentId);
  const stored: StoredBookmark = {
    id: node.id,
    url,
    title: title || url,
    folderId: parentId,
    folderPath: path,
    tags: uniq(tags),
    embedding: null,
    embeddingTextHash: null,
    useCount: 0,
    lastUsed: null,
    savedAt: Date.now(),
    preferFolder: true, // user explicitly chose this folder
  };
  await store.put(stored);
  return node.id;
}

/** Get a single stored bookmark (mirror), or undefined. */
export async function getStored(id: string): Promise<StoredBookmark | undefined> {
  return store.get(id);
}

/** List all stored bookmarks (mirror). */
export async function listStored(): Promise<StoredBookmark[]> {
  return store.getAll();
}

/** Update only the tags of a stored bookmark. */
export async function setTags(id: string, tags: string[]): Promise<void> {
  const cur = await store.get(id);
  if (!cur) return;
  cur.tags = uniq(tags);
  await store.put(cur);
}

/** Update only the embedding of a stored bookmark. */
export async function setEmbedding(
  id: string,
  embedding: number[],
  textHash: string,
): Promise<void> {
  const cur = await store.get(id);
  if (!cur) return;
  cur.embedding = embedding;
  cur.embeddingTextHash = textHash;
  await store.put(cur);
}

/** Mark preferFolder (user picked this folder from recommendations). */
export async function setPrefer(id: string, prefer: boolean): Promise<void> {
  const cur = await store.get(id);
  if (!cur) return;
  if (cur.preferFolder === prefer) return;
  cur.preferFolder = prefer;
  await store.put(cur);
}

/** Increment useCount + lastUsed on a stored bookmark. */
export async function bumpUsage(id: string): Promise<void> {
  const cur = await store.get(id);
  if (!cur) return;
  cur.useCount += 1;
  cur.lastUsed = Date.now();
  await store.put(cur);
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}