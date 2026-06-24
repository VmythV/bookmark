import '@/assets/app.css';
import { sendMessage, type PageInfo } from '@/lib/shared/messages';
import type { FolderRecommendation } from '@/lib/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.startsWith('http')) {
    showStatus('This page cannot be saved.', true);
    return;
  }
  const page: PageInfo = { url: tab.url, title: tab.title ?? tab.url };

  const titleInput = $<HTMLInputElement>('title');
  titleInput.value = page.title;
  titleInput.addEventListener('input', updateSaveBtn);

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

  const tagsInput = $<HTMLInputElement>('tags');
  tagsInput.value = suggestedTags.join(', ');
  renderTagSugg(suggestedTags, tagsInput);

  $<HTMLButtonElement>('newFolder').addEventListener('click', () => void onNewFolder(sel));
  $<HTMLButtonElement>('save').addEventListener('click', () => void onSave(page));
  $<HTMLButtonElement>('openSettings').addEventListener('click', () =>
    chrome.runtime.openOptionsPage(),
  );

  updateSaveBtn();
}

function renderRecs(recs: FolderRecommendation[]): void {
  const box = $('recs');
  box.replaceChildren();
  for (const r of recs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'badge badge-outline badge-primary gap-1 cursor-pointer hover:badge-primary';
    chip.textContent = `${Math.round(r.confidence * 100)}% ${folderPath(r.folderId)}`;
    chip.title = r.reason;
    chip.addEventListener('click', () => {
      $<HTMLSelectElement>('folder').value = r.folderId;
    });
    box.append(chip);
  }
}

function renderTagSugg(sugg: string[], input: HTMLInputElement): void {
  const box = $('tagSugg');
  box.replaceChildren();
  for (const t of sugg) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'badge badge-soft badge-success gap-1 cursor-pointer';
    chip.textContent = `+ ${t}`;
    chip.addEventListener('click', () => {
      const cur = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!cur.includes(t)) {
        cur.push(t);
        input.value = cur.join(', ');
      }
    });
    box.append(chip);
  }
}

async function onNewFolder(sel: HTMLSelectElement): Promise<void> {
  const path = prompt('New folder path (e.g. Dev/Rust):');
  if (!path) return;
  // Add a transient option; commitSave creates the path on the backend.
  const opt = document.createElement('option');
  opt.value = `__new__:${path}`;
  opt.textContent = `${path} (new)`;
  sel.append(opt);
  sel.value = opt.value;
}

async function onSave(page: PageInfo): Promise<void> {
  const raw = $<HTMLSelectElement>('folder').value;
  const tags = $<HTMLInputElement>('tags').value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const title = $<HTMLInputElement>('title').value.trim() || page.title;

  try {
    let folderId = raw;
    if (raw.startsWith('__new__:')) {
      const path = raw.slice('__new__:'.length);
      const { folderId: created } = await sendMessage({
        type: 'ENSURE_FOLDER',
        path,
      });
      folderId = created;
    }
    await sendMessage({
      type: 'SAVE_CONFIRM',
      page: { ...page, title },
      folderId,
      tags,
    });
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
  el.className = isError ? 'text-xs text-error' : 'text-xs text-success';
  el.hidden = false;
}

void init();