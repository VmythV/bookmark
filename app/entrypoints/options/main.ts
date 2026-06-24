import './style.css';
import { sendMessage } from '@/lib/shared/messages';
import { getConfig, setConfig } from '@/lib/services/storage';
import type { AppConfig } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};
const v = (id: string): string => $<HTMLInputElement>(id).value.trim();

async function init(): Promise<void> {
  const cfg = await getConfig();
  loadEmbedding(cfg);
  loadChat(cfg);
  $<HTMLSelectElement>('searchMode').value = cfg.search.mode;
  $<HTMLInputElement>('searchTopK').value = String(cfg.search.topK);

  $('save').addEventListener('click', () => void save());
  $('testEmbed').addEventListener('click', () => void test('embedding'));
  $('testChat').addEventListener('click', () => void test('chat'));
}

function loadEmbedding(cfg: AppConfig): void {
  $<HTMLInputElement>('embedEnabled').checked = cfg.embedding.enabled;
  $<HTMLInputElement>('embedEndpoint').value = cfg.embedding.endpoint;
  $<HTMLInputElement>('embedKey').value = cfg.embedding.apiKey;
  $<HTMLInputElement>('embedModel').value = cfg.embedding.model;
}

function loadChat(cfg: AppConfig): void {
  $<HTMLInputElement>('chatEnabled').checked = cfg.chat.enabled;
  $<HTMLInputElement>('chatEndpoint').value = cfg.chat.endpoint;
  $<HTMLInputElement>('chatKey').value = cfg.chat.apiKey;
  $<HTMLInputElement>('chatModel').value = cfg.chat.model;
}

async function save(): Promise<void> {
  await setConfig({
    embedding: {
      enabled: $<HTMLInputElement>('embedEnabled').checked,
      endpoint: v('embedEndpoint'),
      apiKey: $<HTMLInputElement>('embedKey').value,
      model: v('embedModel'),
    },
    chat: {
      enabled: $<HTMLInputElement>('chatEnabled').checked,
      endpoint: v('chatEndpoint'),
      apiKey: $<HTMLInputElement>('chatKey').value,
      model: v('chatModel'),
    },
    search: {
      mode: $<HTMLSelectElement>('searchMode').value as 'lexical' | 'hybrid',
      topK: Number($<HTMLInputElement>('searchTopK').value) || 50,
    },
  });
  flash('saved', 'Saved ✅');
}

async function test(which: 'embedding' | 'chat'): Promise<void> {
  // Persist first so the controller reads the fresh values.
  await save();
  const statusEl = $(which === 'embedding' ? 'embedStatus' : 'chatStatus');
  statusEl.textContent = 'Testing…';
  statusEl.hidden = false;
  statusEl.classList.remove('status--error', 'status--ok');
  try {
    const res = await sendMessage({ type: 'TEST_PROVIDER', which });
    if (res.ok) {
      statusEl.textContent = 'OK ✅';
      statusEl.classList.add('status--ok');
    } else {
      statusEl.textContent = `Failed: ${res.error ?? 'unknown'}`;
      statusEl.classList.add('status--error');
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.classList.add('status--error');
  }
}

function flash(id: string, msg: string): void {
  const el = $(id);
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('status--ok');
  setTimeout(() => {
    el.hidden = true;
  }, 1500);
}

void init();