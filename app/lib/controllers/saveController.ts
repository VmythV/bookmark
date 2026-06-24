/**
 * Save flow: rank candidate folders for a page and (when embedding provider is
 * configured) suggest tags. See docs/detailed-design.md §5.
 */
import { listFolders, listStored, saveWithTags, setEmbedding } from '../services/bookmarks';
import { hostOf, textHash } from '../shared/text';
import { rankFolders } from '../recommend/rank';
import { suggestTags } from '../recommend/tags';
import * as embedding from '../providers/embedding';
import { getConfig } from '../services/storage';
import { normalize } from '../providers/embedding';
import type { FolderRecommendation, PageInfo } from '../shared/types';

export async function recommendForPage(
  page: PageInfo,
): Promise<{ recommendations: FolderRecommendation[]; suggestedTags: string[] }> {
  const cfg = await getConfig();
  const bookmarks = await listStored();
  const folders = await listFolders();
  const folderPaths = new Map(folders.map((f) => [f.id, f.path]));

  // Optional: page embedding for the vector lane. Failures are silent.
  let pageEmbedding: number[] | null = null;
  if (embedding.isConfigured(cfg.embedding)) {
    pageEmbedding = await embedding.embedOne(
      [page.title, page.description, hostOf(page.url)]
        .filter(Boolean)
        .join(' • '),
      cfg.embedding,
    );
  }

  const recommendations = rankFolders({
    page,
    bookmarks,
    pageEmbedding,
    weights: cfg.recommend.weights,
    folderPaths,
    topK: cfg.recommend.topK,
  });

  // Tag suggestions: pure (embedding-free) + optional chat refinement later.
  const suggestedTags = suggestTags(page, bookmarks);
  return { recommendations, suggestedTags };
}

/**
 * Persist the bookmark to native chrome.bookmarks and mirror into our store
 * with the chosen folder + tags. If the embedding provider is configured,
 * also embed and cache the page in the background (best-effort, non-blocking).
 */
export async function commitSave(
  page: PageInfo,
  folderId: string,
  tags: string[],
): Promise<{ id: string }> {
  const id = await saveWithTags(folderId, page.title || page.url, page.url, tags);
  const cfg = await getConfig();
  if (embedding.isConfigured(cfg.embedding)) {
    void (async () => {
      try {
        const text = [page.title, page.description, hostOf(page.url)]
          .filter(Boolean)
          .join(' • ');
        const hash = textHash(text);
        const [vec] = await embedding.embed([text], cfg.embedding);
        if (vec) await setEmbedding(id, normalize(vec), hash);
      } catch (err) {
        console.warn('[smart-bookmark] background embedding failed', err);
      }
    })();
  }
  return { id };
}