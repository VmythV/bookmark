import './style.css';
import { getConfig, setConfig } from '@/lib/services/storage';
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
