/**
 * Backup / import / export controller. See docs/detailed-design.md §9.
 *
 * One-way, full-overwrite snapshots in Netscape bookmark HTML. Manual trigger
 * plus chrome.alarms scheduling (daily/weekly). Import fetches the remote
 * snapshot and writes it under a new dated folder (non-destructive merge), so a
 * restore never silently destroys the current tree.
 */
import type { BackupConfig, BookmarkNode } from '../shared/types';
import { getConfig } from '../services/storage';
import { getTree, createBookmark, createFolder, defaultParentId } from '../services/bookmarks';
import { serialize, parse, type ParsedNode } from '../backup/htmlBookmarks';
import type { BackupAdapter } from '../backup/adapter';
import { WebDavAdapter } from '../backup/webdav';
import { S3Adapter } from '../backup/s3';

const ALARM_NAME = 'scheduled-backup';

function makeAdapter(cfg: BackupConfig): BackupAdapter {
  if (cfg.target === 'webdav') {
    if (!cfg.webdav?.url) throw new Error('WebDAV not configured');
    return new WebDavAdapter(cfg.webdav);
  }
  if (cfg.target === 's3') {
    if (!cfg.s3?.bucket) throw new Error('S3 not configured');
    return new S3Adapter(cfg.s3);
  }
  throw new Error('No backup target configured');
}

/** Serialize the current bookmark tree to HTML. */
export async function exportHtml(): Promise<string> {
  const tree = (await getTree()) as BookmarkNode[];
  return serialize(tree);
}

/** Upload a full snapshot to the configured target. */
export async function backupNow(): Promise<{ bytes: number }> {
  const cfg = await getConfig();
  const adapter = makeAdapter(cfg.backup);
  const html = await exportHtml();
  await adapter.put(html);
  return { bytes: html.length };
}

/** Verify the configured target is reachable. */
export async function testConnection(): Promise<void> {
  const cfg = await getConfig();
  await makeAdapter(cfg.backup).test();
}

/**
 * Import from the configured target (or provided HTML).
 *
 * - 'merge' (default, non-destructive): write under a new "Imported bookmarks"
 *   folder, leaving the existing tree untouched.
 * - 'replace': take an automatic safety backup, remove existing children of the
 *   writable roots (bookmarks bar + other bookmarks), then write the imported
 *   tree there. Destructive but reversible via the safety backup.
 */
export async function importFromRemote(
  html?: string,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ created: number }> {
  let content = html;
  if (content == null) {
    const cfg = await getConfig();
    content = (await makeAdapter(cfg.backup).get()) ?? undefined;
    if (content == null) throw new Error('No remote snapshot found');
  }
  const parsed = parse(content);

  if (mode === 'replace') {
    lastImportBackup = await exportHtml();
    await clearWritableRoots();
    const parentId = await defaultParentId();
    const created = await writeParsed(parsed, parentId);
    return { created };
  }

  const parentId = await defaultParentId();
  const rootFolder = await createFolder(parentId, `Imported bookmarks`);
  const created = await writeParsed(parsed, rootFolder.id);
  return { created };
}

/** HTML snapshot taken before the last 'replace' import, for manual rollback. */
let lastImportBackup: string | null = null;
export function getLastImportBackup(): string | null {
  return lastImportBackup;
}

/** Remove all children of the writable root folders (bookmarks bar + others). */
async function clearWritableRoots(): Promise<void> {
  const tree = (await getTree()) as BookmarkNode[];
  const roots = tree[0]?.children ?? [];
  for (const root of roots) {
    const children = (await chrome.bookmarks.getChildren(root.id)) as BookmarkNode[];
    for (const child of children) {
      try {
        await chrome.bookmarks.removeTree(child.id);
      } catch (err) {
        console.error('[smart-bookmark] failed to clear node', child.id, err);
      }
    }
  }
}

/** Recursively write a parsed tree under `parentId`. Returns bookmark count. */
async function writeParsed(nodes: ParsedNode[], parentId: string): Promise<number> {
  let count = 0;
  for (const node of nodes) {
    if (node.url) {
      await createBookmark(parentId, node.title || node.url, node.url);
      count++;
    } else {
      const folder = await createFolder(parentId, node.title || 'Folder');
      if (node.children) count += await writeParsed(node.children, folder.id);
    }
  }
  return count;
}

/** (Re)configure the scheduled-backup alarm from current config. */
export async function syncSchedule(): Promise<void> {
  const cfg = await getConfig();
  await chrome.alarms.clear(ALARM_NAME);
  if (cfg.backup.schedule === 'off' || cfg.backup.target === 'none') return;
  const periodInMinutes = cfg.backup.schedule === 'daily' ? 60 * 24 : 60 * 24 * 7;
  chrome.alarms.create(ALARM_NAME, { periodInMinutes, delayInMinutes: periodInMinutes });
}

/** Handle the scheduled-backup alarm. Errors are logged, never thrown. */
export function registerAlarmHandler(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    backupNow().catch((err) =>
      console.error('[smart-bookmark] scheduled backup failed', err),
    );
  });
}
