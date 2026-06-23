/**
 * Recall: embed a page and find the Top-K most similar folders.
 * See docs/detailed-design.md §7.
 */
import { listFolders, sampleChildTitles } from '../services/bookmarks';
import * as store from '../services/vectorStore';
import { embedOne } from './embedderClient';
import type { FolderCandidate, PageInfo } from '../shared/types';

/** Text used to represent a page for recall. */
function pageText(page: PageInfo): string {
  let host = '';
  try {
    host = new URL(page.url).hostname;
  } catch {
    /* ignore malformed urls */
  }
  return [page.title, host, page.description, page.selectionText]
    .filter(Boolean)
    .join(' • ');
}

/**
 * Return up to `k` candidate folders most similar to the page, ordered best-first.
 * Each candidate carries its path and a few sample child titles for the LLM.
 */
export async function recallFolders(
  page: PageInfo,
  k: number,
): Promise<Array<FolderCandidate & { score: number }>> {
  const queryVector = await embedOne(pageText(page));
  const hits = await store.query(queryVector, k, 'folder');
  if (hits.length === 0) return [];

  const folders = await listFolders();
  const pathById = new Map(folders.map((f) => [f.id, f.path]));

  const out: Array<FolderCandidate & { score: number }> = [];
  for (const hit of hits) {
    const path = pathById.get(hit.key);
    if (!path) continue; // folder removed since indexing
    const sampleTitles = await sampleChildTitles(hit.key, 4);
    out.push({ id: hit.key, path, sampleTitles, score: hit.score });
  }
  return out;
}
