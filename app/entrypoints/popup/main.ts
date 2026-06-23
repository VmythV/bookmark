import './style.css';
import { sendMessage } from '@/lib/shared/messages';
import { listFolders } from '@/lib/services/bookmarks';
import type { PageInfo, SaveRecommendation } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

let page: PageInfo | null = null;
let rec: SaveRecommendation | null = null;

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showStatus('No active page to save.', true);
    return;
  }
  page = { url: tab.url, title: tab.title ?? tab.url };
  $('pageTitle').textContent = page.title;
  $('pageUrl').textContent = page.url;

  const folderSelect = $<HTMLSelectElement>('folder');
  const [folders, res] = await Promise.all([
    listFolders(),
    sendMessage({ type: 'SAVE_REQUEST', page }),
  ]);
  rec = res.recommendation;

  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.path;
    folderSelect.append(opt);
  }

  applyRecommendation(rec);
  $('reason').textContent = rec.reason;

  // Mode toggle.
  $('modeExisting').addEventListener('change', () => setMode('use_existing'));
  $('modeNew').addEventListener('change', () => setMode('create_new'));

  $('save').addEventListener('click', () => void onSave());
  $('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function applyRecommendation(r: SaveRecommendation): void {
  if (r.action === 'create_new' && r.newFolderPath) {
    ($('modeNew') as HTMLInputElement).checked = true;
    $<HTMLInputElement>('newPath').value = r.newFolderPath;
    setMode('create_new');
  } else {
    ($('modeExisting') as HTMLInputElement).checked = true;
    if (r.folderId) $<HTMLSelectElement>('folder').value = r.folderId;
    setMode('use_existing');
  }
}

function setMode(mode: 'use_existing' | 'create_new'): void {
  $('folder').hidden = mode !== 'use_existing';
  $('newPath').hidden = mode !== 'create_new';
}

function currentMode(): 'use_existing' | 'create_new' {
  return ($('modeNew') as HTMLInputElement).checked
    ? 'create_new'
    : 'use_existing';
}

async function onSave(): Promise<void> {
  if (!page || !rec) return;
  const btn = $<HTMLButtonElement>('save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const mode = currentMode();
    const override =
      mode === 'create_new'
        ? { overrideNewFolderPath: $<HTMLInputElement>('newPath').value.trim() }
        : { overrideFolderId: $<HTMLSelectElement>('folder').value };
    await sendMessage({
      type: 'SAVE_CONFIRM',
      page,
      recommendation: rec,
      ...override,
    });
    showStatus('Saved ✅', false);
    setTimeout(() => window.close(), 700);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), true);
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

function showStatus(msg: string, isError: boolean): void {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
  el.hidden = false;
}

void init();
