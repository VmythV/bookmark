/**
 * Domain score: how often does this page's host appear under the folder?
 */
import { hostOf } from '../shared/text';
import type { StoredBookmark } from '../shared/types';

/** Map folderId -> number of bookmarks under that folder whose host matches. */
export function domainScores(
  pageHost: string,
  bookmarks: StoredBookmark[],
): Map<string, number> {
  if (!pageHost) return new Map();
  const out = new Map<string, number>();
  for (const b of bookmarks) {
    if (hostOf(b.url) === pageHost) {
      out.set(b.folderId, (out.get(b.folderId) ?? 0) + 1);
    }
  }
  return out;
}