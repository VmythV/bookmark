import './style.css';
import { getConfig, setConfig } from '@/lib/services/storage';
import { sendMessage } from '@/lib/shared/messages';
import type { BackupConfig } from '@/lib/shared/types';

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
  await initIndexSection();
}

function syncTargetFields(): void {
  const target = $<HTMLSelectElement>('backupTarget').value;
  $('webdavFields').hidden = target !== 'webdav';
  $('s3Fields').hidden = target !== 's3';
}

async function initIndexSection(): Promise<void> {
  await refreshIndexStatus();
  $('buildIndex').addEventListener('click', () => void buildIndex());
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

async function buildIndex(): Promise<void> {
  const btn = $<HTMLButtonElement>('buildIndex');
  btn.disabled = true;
  btn.textContent = 'Building…';
  $('indexProgress').hidden = false;
  try {
    const res = await sendMessage({ type: 'INDEX_BUILD' });
    showStatus(
      `Index built: ${res.embedded} embedded, ${res.skipped} skipped, ${res.removed} removed.`,
    );
    await refreshIndexStatus();
  } catch (err) {
    showStatus(errMsg(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Build / rebuild index';
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
  try {
    const res = await sendMessage({ type: 'BACKUP_IMPORT' });
    showStatus(`Imported ${res.created} bookmarks ✅`);
  } catch (err) {
    showStatus(errMsg(err));
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
