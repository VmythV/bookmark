/**
 * Build the "representative text" for a folder, which is what gets embedded for
 * recall. See docs/detailed-design.md §7.
 *
 * Representative text = folder name + full path + a few sample child titles.
 */
import { sampleChildTitles } from '../services/bookmarks';

/** Simple stable string hash (FNV-1a, 32-bit) for change detection. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Build representative text for a folder given its display path. */
export async function folderRepresentativeText(
  folderId: string,
  path: string,
  sampleLimit = 5,
): Promise<string> {
  const titles = await sampleChildTitles(folderId, sampleLimit);
  const name = path.split('/').pop() ?? path;
  const parts = [name, path, ...titles].filter(Boolean);
  return parts.join(' • '); // bullet-separated
}
