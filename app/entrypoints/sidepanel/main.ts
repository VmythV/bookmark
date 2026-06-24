import '@/assets/app.css';
import { sendMessage } from '@/lib/shared/messages';
import { getConfig, setConfig } from '@/lib/services/storage';
import { listStored } from '@/lib/services/bookmarks';
import type { AppConfig } from '@/lib/shared/types';
import { icon, type IconName } from '@/lib/shared/icons';
import { initOrganize } from './organize';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};
const v = (id: string): string => $<HTMLInputElement>(id).value.trim();

/** Replaces every [data-icon] placeholder with its inline SVG. */
function hydrateIcons(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-icon]')) {
    const name = el.dataset.icon as IconName;
    el.insertAdjacentHTML('afterbegin', icon(name));
  }
  $('save').innerHTML = `${icon('check')}<span>Save settings</span>`;
}

async function init(): Promise<void> {
  hydrateIcons();
  setupNav();
  const cfg = await getConfig();
  loadEmbedding(cfg);
  loadChat(cfg);
  $<HTMLSelectElement>('searchMode').value = cfg.search.mode;
  $<HTMLInputElement>('searchTopK').value = String(cfg.search.topK);
  await loadOverview(cfg);

  $('save').addEventListener('click', () => void save());
  $('testEmbed').addEventListener('click', () => void test('embedding'));
  $('testChat').addEventListener('click', () => void test('chat'));

  void initOrganize();
}

function setupNav(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.nav-item'));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('section.section'));
  const show = (name: string) => {
    for (const s of sections) s.classList.toggle('hidden', s.dataset.section !== name);
    for (const it of items) it.classList.toggle('active', it.dataset.section === name);
    // Show the save bar only on config sections.
    const configSections = ['embedding', 'chat', 'search'];
    $('saveBar').hidden = !configSections.includes(name);
  };
  for (const it of items) {
    it.addEventListener('click', () => show(it.dataset.section!));
  }
  show('overview');
}

async function loadOverview(cfg: AppConfig): Promise<void> {
  try {
    const bookmarks = await listStored();
    $('statBookmarks').textContent = String(bookmarks.length);
  } catch {
    $('statBookmarks').textContent = '0';
  }
  $('statEmbedding').textContent = cfg.embedding.enabled ? 'On' : 'Off';
  $('statSearch').textContent = cfg.search.mode === 'hybrid' ? 'Hybrid' : 'Lexical';
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
  const cfg = await setConfig({
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
  await loadOverview(cfg);
  flash('Saved');
}

async function test(which: 'embedding' | 'chat'): Promise<void> {
  await save();
  const el = $(which === 'embedding' ? 'embedStatus' : 'chatStatus');
  el.textContent = 'Testing…';
  el.className = 'text-sm opacity-60';
  try {
    const res = await sendMessage({ type: 'TEST_PROVIDER', which });
    if (res.ok) {
      el.innerHTML = `${icon('check')}<span>Connected</span>`;
      el.className = 'text-sm text-success inline-flex items-center gap-1.5';
    } else {
      el.textContent = `Failed: ${res.error ?? 'unknown'}`;
      el.className = 'text-sm text-error';
    }
  } catch (err) {
    el.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    el.className = 'text-sm text-error';
  }
}

function flash(msg: string): void {
  const el = $('saved');
  el.innerHTML = `${icon('check')}<span>${msg}</span>`;
  setTimeout(() => {
    el.innerHTML = '';
  }, 1500);
}

void init();
