/**
 * Apply a (user-edited) reorganization plan to the native tree + store.
 * New folders are created first so their members can target them. Each op is
 * guarded against vanished nodes (the tree may have changed since analyze) and
 * is independent — a single failure is counted as skipped, not fatal.
 * Apply is NOT transactional; partial application is safe (every op is valid).
 */
import { createFolder, moveNode, setFolder, folderPath } from '../services/bookmarks';
import type { ApplyReorgInput, ApplyReorgResult } from './types';

async function exists(id: string): Promise<boolean> {
  try {
    const r = await chrome.bookmarks.get(id);
    return Array.isArray(r) && r.length > 0;
  } catch {
    return false;
  }
}

export async function applyReorg(
  input: ApplyReorgInput,
): Promise<ApplyReorgResult> {
  let foldersCreated = 0;
  let bookmarksMoved = 0;
  let skipped = 0;

  const pathCache = new Map<string, string>();
  const pathOf = async (id: string): Promise<string> => {
    const hit = pathCache.get(id);
    if (hit !== undefined) return hit;
    const p = await folderPath(id);
    pathCache.set(id, p);
    return p;
  };

  // New folders first.
  for (const nf of input.newFolders) {
    if (!nf.name.trim() || !(await exists(nf.parentId))) {
      skipped += nf.memberIds.length;
      continue;
    }
    let folderId: string;
    try {
      folderId = (await createFolder(nf.parentId, nf.name.trim())).id;
      foldersCreated++;
    } catch {
      skipped += nf.memberIds.length;
      continue;
    }
    const newPath = await pathOf(folderId);
    for (const mid of nf.memberIds) {
      if (!(await exists(mid))) {
        skipped++;
        continue;
      }
      try {
        await moveNode(mid, folderId);
        await setFolder(mid, folderId, newPath);
        bookmarksMoved++;
      } catch {
        skipped++;
      }
    }
  }

  // Relocations into existing folders.
  for (const m of input.moves) {
    if (!(await exists(m.id)) || !(await exists(m.toFolderId))) {
      skipped++;
      continue;
    }
    try {
      await moveNode(m.id, m.toFolderId);
      await setFolder(m.id, m.toFolderId, await pathOf(m.toFolderId));
      bookmarksMoved++;
    } catch {
      skipped++;
    }
  }

  return { foldersCreated, bookmarksMoved, skipped };
}
