/**
 * Wrapper over chrome.bookmarks. The native bookmark tree is the single source
 * of truth. See docs/detailed-design.md §3 (services/bookmarks.ts).
 */
import type { BookmarkNode } from '../shared/types';

/** Read the full bookmark tree. */
export async function getTree(): Promise<BookmarkNode[]> {
  return chrome.bookmarks.getTree() as Promise<BookmarkNode[]>;
}

/** True if a node is a folder (no URL). */
export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

/** Walk the tree, invoking `fn` for every node. */
export function walk(
  nodes: BookmarkNode[],
  fn: (node: BookmarkNode, path: string[]) => void,
  path: string[] = [],
): void {
  for (const node of nodes) {
    fn(node, path);
    if (node.children) {
      // Root nodes often have empty titles; skip them in the displayed path.
      const next = node.title ? [...path, node.title] : path;
      walk(node.children, fn, next);
    }
  }
}

/** Collect all folders with their full display path (e.g. "Dev/Rust"). */
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

/** Up to `limit` child bookmark titles directly under `folderId`. */
export async function sampleChildTitles(
  folderId: string,
  limit = 5,
): Promise<string[]> {
  const children = (await chrome.bookmarks.getChildren(
    folderId,
  )) as BookmarkNode[];
  return children
    .filter((c) => c.url !== undefined)
    .slice(0, limit)
    .map((c) => c.title);
}

/** Collect all bookmarks (leaf nodes with a URL) under a subtree, or the whole tree. */
export async function listBookmarks(
  rootId?: string,
): Promise<Array<{ id: string; title: string; url: string }>> {
  const nodes = rootId
    ? ((await chrome.bookmarks.getSubTree(rootId)) as BookmarkNode[])
    : await getTree();
  const out: Array<{ id: string; title: string; url: string }> = [];
  walk(nodes, (node) => {
    if (node.url !== undefined) {
      out.push({ id: node.id, title: node.title, url: node.url });
    }
  });
  return out;
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

/** Move a node to a new parent (and optional index). */
export async function moveNode(
  id: string,
  parentId: string,
  index?: number,
): Promise<BookmarkNode> {
  return chrome.bookmarks.move(id, { parentId, index }) as Promise<BookmarkNode>;
}

/**
 * Default parent for new bookmarks when no folder is chosen: the "Bookmarks Bar"
 * (id "1" in Chrome) if present, else the first writable root child.
 */
export async function defaultParentId(): Promise<string> {
  const tree = await getTree();
  const root = tree[0];
  const barId = root?.children?.find((c) => c.id === '1')?.id;
  return barId ?? root?.children?.[0]?.id ?? '1';
}

/**
 * Resolve a "/"-separated path to a folder id, creating missing segments.
 * `rootId` defaults to the bookmarks bar.
 */
export async function ensureFolderPath(
  path: string,
  rootId?: string,
): Promise<string> {
  const root = rootId ?? (await defaultParentId());
  const segments = path.split('/').map((s) => s.trim()).filter(Boolean);
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
