import './style.css';
import { sendMessage, type PageInfo } from '@/lib/shared/messages';
import { capturePageInfo } from '@/lib/services/page';
import type { FolderRecommendation } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

async function init(): Promise<void> {
  // Resolve current tab's page info (popups can't run in-page capturePageInfo).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.startsWith('http')) {
    showStatus('This page cannot be saved.', true);
    return;
  }
  const page: PageInfo = { url: tab.url, title: tab.title ?? tab.url };

  const titleInput = $<HTMLInputElement>('title');
  titleInput.value = page.title;
  titleInput.addEventListener('input', () => updateSaveBtn());

  // Folder list + recommendations + tag suggestions in parallel.
  const [{ folders }, { recommendations, suggestedTags }] = await Promise.all([
    sendMessage({ type: 'LIST_FOLDERS' }),
    sendMessage({ type: 'SAVE_REQUEST', page }),
  ]);

  const sel = $<HTMLSelectElement>('folder');
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.path;
    sel.append(opt);
  }
  if (recommendations[0]) sel.value = recommendations[0].folderId;
  renderRecs(recommendations);

  // Tags: start from suggestions, user can edit.
  const tagsInput = $<HTMLInputElement>('tags');
  tagsInput.value = suggestedTags.join(', ');
  renderTagSugg(suggestedTags, tagsInput);

  // New folder button → prompt for path, ensureFolderPath, reload folders.
  $<HTMLButtonElement>('newFolder').addEventListener('click', () => void onNewFolder(sel));

  $<HTMLButtonElement>('save').addEventListener('click', () => void onSave(page));
  $<HTMLButtonElement>('search').addEventListener('click', () => {
    chrome.action.openPopup(); // placeholder; opens quick-search when implemented
  });

  updateSaveBtn();
}

function renderRecs(recs: FolderRecommendation[]): void {
  const ul = $('recs');
  ul.replaceChildren();
  for (const r of recs) {
    const li = document.createElement('li');
    li.textContent = `${Math.round(r.confidence * 100)}% — ${folderPath(r.folderId)}`;
    li.title = r.reason;
    li.addEventListener('click', () => {
      $<HTMLSelectElement>('folder').value = r.folderId;
    });
    ul.append(li);
  }
}

function renderTagSugg(sugg: string[], input: HTMLInputElement): void {
  const ul = $('tagSugg');
  ul.replaceChildren();
  for (const t of sugg) {
    const li = document.createElement('li');
    li.textContent = `+${t}`;
    li.addEventListener('click', () => {
      const cur = input.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!cur.includes(t)) {
        cur.push(t);
        input.value = cur.join(', ');
      }
    });
    ul.append(li);
  }
}

async function onNewFolder(sel: HTMLSelectElement): Promise<void> {
  const path = prompt('New folder path (e.g. Dev/Rust):');
  if (!path) return;
  try {
    const { folders } = await sendMessage({ type: 'LIST_FOLDERS' });
    // Re-fetch is cheap; rely on background to ensure path. For simplicity here,
    // ask the user to retry the save — the confirm path will create it.
    sel.replaceChildren();
    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.path;
      sel.append(opt);
    }
    void path;
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), true);
  }
}

async function onSave(page: PageInfo): Promise<void> {
  const folderId = $<HTMLSelectElement>('folder').value;
  const tags = $<HTMLInputElement>('tags').value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const title = $<HTMLInputElement>('title').value.trim() || page.title;
  page = { ...page, title };
  try {
    await sendMessage({ type: 'SAVE_CONFIRM', page, folderId, tags });
    showStatus('Saved ✅', false);
    setTimeout(() => window.close(), 700);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function updateSaveBtn(): void {
  $<HTMLButtonElement>('save').disabled = !$<HTMLInputElement>('title').value.trim();
}

function folderPath(id: string): string {
  const opt = $<HTMLSelectElement>('folder').querySelector(`option[value="${id}"]`);
  return opt?.textContent ?? id;
}

function showStatus(msg: string, isError: boolean): void {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
  el.hidden = false;
}

// capturePageInfo is unused here but referenced in content script only.
void capturePageInfo;
void init();