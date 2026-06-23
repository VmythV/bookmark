import './style.css';
import { getConfig, setConfig } from '@/lib/services/storage';
import { sendMessage } from '@/lib/shared/messages';
import { listFolders } from '@/lib/services/bookmarks';
import type { BackupConfig, ReorgPlan, ReorgScope } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};
const val = (id: string): string => $<HTMLInputElement>(id).value.trim();

async function load(): Promise<void> {
  const cfg = await getConfig();
  $<HTMLInputElement>('llmEndpoint').value = cfg.llm.endpoint;
  $<HTMLInputElement>('llmApiKey').value = cfg.llm.apiKey;
  $<HTMLInputElement>('llmModel').value = cfg.llm.model;
  $<HTMLInputElement>('embedModel').value = cfg.embedding.model;
  $<HTMLInputElement>('topK').value = String(cfg.recall.topK);
  $<HTMLSelectElement>('backupTarget').value = cfg.backup.target;
  $<HTMLSelectElement>('backupSchedule').value = cfg.backup.schedule;

  // Backup credential fields.
  if (cfg.backup.webdav) {
    $<HTMLInputElement>('webdavUrl').value = cfg.backup.webdav.url;
    $<HTMLInputElement>('webdavUser').value = cfg.backup.webdav.username;
    $<HTMLInputElement>('webdavPass').value = cfg.backup.webdav.password;
  }
  if (cfg.backup.s3) {
    $<HTMLInputElement>('s3Endpoint').value = cfg.backup.s3.endpoint;
    $<HTMLInputElement>('s3Region').value = cfg.backup.s3.region;
    $<HTMLInputElement>('s3Bucket').value = cfg.backup.s3.bucket;
    $<HTMLInputElement>('s3Key').value = cfg.backup.s3.key;
    $<HTMLInputElement>('s3AccessKey').value = cfg.backup.s3.accessKeyId;
    $<HTMLInputElement>('s3Secret').value = cfg.backup.s3.secretAccessKey;
  }
  syncTargetFields();

  $('save').addEventListener('click', () => void save());
  $('backupTarget').addEventListener('change', syncTargetFields);
  $('backupNow').addEventListener('click', () => void runBackup('BACKUP_NOW'));
  $('backupTest').addEventListener('click', () => void runBackup('BACKUP_TEST'));
  $('backupImport').addEventListener('click', () => void runImport());
  $('exportFile').addEventListener('click', () => void exportToFile());
  $('importFile').addEventListener('click', () =>
    $<HTMLInputElement>('importFileInput').click(),
  );
  $('importFileInput').addEventListener('change', (e) => void onFilePicked(e));
  await initIndexSection();
  await initReorgSection();
}

function syncTargetFields(): void {
  const target = $<HTMLSelectElement>('backupTarget').value;
  $('webdavFields').hidden = target !== 'webdav';
  $('s3Fields').hidden = target !== 's3';
}

async function initIndexSection(): Promise<void> {
  await refreshIndexStatus();
  $('buildIndex').addEventListener('click', () => void buildIndex(false));
  $('rebuildIndex').addEventListener('click', () => void buildIndex(true));
  $('cancelTask').addEventListener('click', () => {
    void sendMessage({ type: 'CANCEL_TASK' });
  });
  chrome.runtime.onMessage.addListener(
    (msg: { target?: string; done?: number; total?: number }) => {
      if (msg?.target !== 'index-progress') return;
      const { done = 0, total = 0 } = msg;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      $('indexProgress').hidden = false;
      ($('indexProgressBar') as HTMLElement).style.width = `${pct}%`;
      $('indexProgressLabel').textContent = `${done}/${total}`;
    },
  );
}

async function refreshIndexStatus(): Promise<void> {
  const status = await sendMessage({ type: 'INDEX_STATUS' });
  $('indexStatus').textContent = status.indexed
    ? `Indexed: ${status.folderCount} folders.`
    : 'Not indexed yet. Build the index to enable smart recommendations.';
}

async function buildIndex(rebuild: boolean): Promise<void> {
  const btn = $<HTMLButtonElement>(rebuild ? 'rebuildIndex' : 'buildIndex');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = rebuild ? 'Rebuilding…' : 'Building…';
  $('indexProgress').hidden = false;
  $('cancelTask').hidden = false;
  try {
    const res = await sendMessage({ type: rebuild ? 'INDEX_REBUILD' : 'INDEX_BUILD' });
    showStatus(
      `Index ${rebuild ? 'rebuilt' : 'updated'}: ${res.embedded} embedded, ${res.skipped} skipped, ${res.removed} removed.`,
    );
    await refreshIndexStatus();
  } catch (err) {
    showStatus(errMsg(err));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
    $('cancelTask').hidden = true;
  }
}

function collectBackup(): BackupConfig {
  return {
    target: $<HTMLSelectElement>('backupTarget').value as BackupConfig['target'],
    schedule: $<HTMLSelectElement>('backupSchedule').value as BackupConfig['schedule'],
    webdav: {
      url: val('webdavUrl'),
      username: val('webdavUser'),
      password: $<HTMLInputElement>('webdavPass').value,
    },
    s3: {
      endpoint: val('s3Endpoint'),
      region: val('s3Region'),
      bucket: val('s3Bucket'),
      key: val('s3Key') || 'bookmarks.html',
      accessKeyId: val('s3AccessKey'),
      secretAccessKey: $<HTMLInputElement>('s3Secret').value,
    },
  };
}

async function save(): Promise<void> {
  const topK = Number($<HTMLInputElement>('topK').value) || 10;
  await setConfig({
    llm: {
      endpoint: val('llmEndpoint'),
      apiKey: $<HTMLInputElement>('llmApiKey').value,
      model: val('llmModel'),
    },
    embedding: { model: val('embedModel') || 'Xenova/multilingual-e5-small' },
    recall: { topK },
    backup: collectBackup(),
  });
  // Re-arm the scheduled-backup alarm to match the saved schedule.
  await sendMessage({ type: 'SCHEDULE_SYNC' });
  showStatus('Saved ✅');
}

async function runBackup(type: 'BACKUP_NOW' | 'BACKUP_TEST'): Promise<void> {
  // Persist first so the controller reads fresh credentials.
  await setConfig({ backup: collectBackup() });
  try {
    if (type === 'BACKUP_NOW') {
      const res = await sendMessage({ type });
      showStatus(`Backed up ${res.bytes} bytes ✅`);
    } else {
      await sendMessage({ type });
      showStatus('Connection OK ✅');
    }
  } catch (err) {
    showStatus(errMsg(err));
  }
}

async function runImport(): Promise<void> {
  await setConfig({ backup: collectBackup() });
  const mode = $<HTMLSelectElement>('importMode').value as 'merge' | 'replace';
  if (mode === 'replace' && !confirm('Replace mode clears existing bookmarks (a backup is taken first). Continue?')) {
    return;
  }
  try {
    const res = await sendMessage({ type: 'BACKUP_IMPORT', mode });
    showStatus(`Imported ${res.created} bookmarks ✅`);
  } catch (err) {
    showStatus(errMsg(err));
  }
}

async function exportToFile(): Promise<void> {
  try {
    const { html } = await sendMessage({ type: 'EXPORT_HTML' });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Exported to file ✅');
  } catch (err) {
    showStatus(errMsg(err));
  }
}

async function onFilePicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const mode = $<HTMLSelectElement>('importMode').value as 'merge' | 'replace';
  if (mode === 'replace' && !confirm('Replace mode clears existing bookmarks (a backup is taken first). Continue?')) {
    input.value = '';
    return;
  }
  try {
    const html = await file.text();
    const res = await sendMessage({ type: 'BACKUP_IMPORT', html, mode });
    showStatus(`Imported ${res.created} bookmarks from file ✅`);
  } catch (err) {
    showStatus(errMsg(err));
  } finally {
    input.value = '';
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Reorganization ----

let currentPlan: ReorgPlan | null = null;

async function initReorgSection(): Promise<void> {
  const scopeSel = $<HTMLSelectElement>('reorgScope');
  const folders = await listFolders();
  for (const f of folders.filter((x) => !x.path.includes('/'))) {
    const opt = document.createElement('option');
    opt.value = `folder:${f.id}`;
    opt.textContent = `Folder: ${f.path}`;
    scopeSel.append(opt);
  }

  $('reorgBuild').addEventListener('click', () => void buildReorgPlan());
  $('reorgApply').addEventListener('click', () => void applyReorgPlan());
  $('reorgCancel').addEventListener('click', () => {
    void sendMessage({ type: 'CANCEL_TASK' });
  });

  chrome.runtime.onMessage.addListener(
    (msg: { target?: string; phase?: string; done?: number; total?: number }) => {
      if (msg?.target !== 'reorg-progress') return;
      const { phase = '', done = 0, total = 0 } = msg;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      $('reorgProgress').hidden = false;
      ($('reorgProgressBar') as HTMLElement).style.width = `${pct}%`;
      $('reorgProgressLabel').textContent = `${phase} ${done}/${total}`;
    },
  );
}

function currentScope(): ReorgScope {
  const v = $<HTMLSelectElement>('reorgScope').value;
  if (v.startsWith('folder:')) return { kind: 'folder', folderId: v.slice(7) };
  return { kind: 'all' };
}

async function buildReorgPlan(): Promise<void> {
  const btn = $<HTMLButtonElement>('reorgBuild');
  btn.disabled = true;
  btn.textContent = 'Building…';
  $('reorgProgress').hidden = false;
  $('reorgApply').hidden = true;
  $('reorgCancel').hidden = false;
  try {
    const res = await sendMessage({ type: 'REORG_BUILD_PLAN', scope: currentScope() });
    currentPlan = res.plan;
    renderPreview(res.plan);
    $('reorgApply').hidden = res.plan.clusters.length === 0;
  } catch (err) {
    showStatus(errMsg(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Build plan';
    $('reorgCancel').hidden = true;
  }
}

function renderPreview(plan: ReorgPlan): void {
  const el = $('reorgPreview');
  el.hidden = false;
  el.replaceChildren();

  const summary = document.createElement('p');
  summary.className = 'hint';
  summary.textContent = `${plan.clusters.length} clusters from ${plan.total} bookmarks, ${plan.noise.length} unsorted.`;
  el.append(summary);

  for (const c of plan.clusters) {
    const box = document.createElement('div');
    box.className = 'cluster';
    const h = document.createElement('div');
    h.className = 'cluster__name';
    h.textContent = `📁 ${c.suggestedPath} (${c.bookmarkIds.length})`;
    const samples = document.createElement('div');
    samples.className = 'cluster__samples';
    samples.textContent = c.sampleTitles.join(' · ');
    box.append(h, samples);
    el.append(box);
  }
}

async function applyReorgPlan(): Promise<void> {
  if (!currentPlan) return;
  if (
    !confirm(
      'Apply this reorganization? A safety backup is taken first, but bookmarks will be moved.',
    )
  ) {
    return;
  }
  const btn = $<HTMLButtonElement>('reorgApply');
  btn.disabled = true;
  btn.textContent = 'Applying…';
  try {
    const res = await sendMessage({ type: 'REORG_APPLY', plan: currentPlan });
    showStatus(
      `Reorganized: ${res.moved} moved, ${res.created} folders, ${res.unsorted} unsorted ✅`,
    );
    $('reorgApply').hidden = true;
    $('reorgPreview').hidden = true;
  } catch (err) {
    showStatus(errMsg(err));
  }
}

function showStatus(msg: string): void {
  const el = $('status');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

void load();
