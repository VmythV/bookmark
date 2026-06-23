import './style.css';
import { getConfig, setConfig } from '@/lib/services/storage';
import { sendMessage } from '@/lib/shared/messages';
import type { BackupConfig } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

async function load(): Promise<void> {
  const cfg = await getConfig();
  $<HTMLInputElement>('llmEndpoint').value = cfg.llm.endpoint;
  $<HTMLInputElement>('llmApiKey').value = cfg.llm.apiKey;
  $<HTMLInputElement>('llmModel').value = cfg.llm.model;
  $<HTMLInputElement>('embedModel').value = cfg.embedding.model;
  $<HTMLInputElement>('topK').value = String(cfg.recall.topK);
  $<HTMLSelectElement>('backupTarget').value = cfg.backup.target;
  $<HTMLSelectElement>('backupSchedule').value = cfg.backup.schedule;

  $('save').addEventListener('click', () => void save());
  await initIndexSection();
}

async function initIndexSection(): Promise<void> {
  await refreshIndexStatus();
  $('buildIndex').addEventListener('click', () => void buildIndex());

  // Listen for build progress broadcast from the background.
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
    showStatus(err instanceof Error ? err.message : String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Build / rebuild index';
  }
}

async function save(): Promise<void> {
  const topK = Number($<HTMLInputElement>('topK').value) || 10;
  await setConfig({
    llm: {
      endpoint: $<HTMLInputElement>('llmEndpoint').value.trim(),
      apiKey: $<HTMLInputElement>('llmApiKey').value,
      model: $<HTMLInputElement>('llmModel').value.trim(),
    },
    embedding: {
      model:
        $<HTMLInputElement>('embedModel').value.trim() ||
        'Xenova/multilingual-e5-small',
    },
    recall: { topK },
    backup: {
      target: $<HTMLSelectElement>('backupTarget').value as BackupConfig['target'],
      schedule: $<HTMLSelectElement>('backupSchedule')
        .value as BackupConfig['schedule'],
    },
  });
  showStatus('Saved ✅');
}

function showStatus(msg: string): void {
  const el = $('status');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 1500);
}

void load();
