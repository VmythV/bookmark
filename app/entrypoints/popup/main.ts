import '@/assets/app.css';
import { sendMessage, type PageInfo } from '@/lib/shared/messages';
import type { FolderRecommendation } from '@/lib/shared/types';
import { icon } from '@/lib/shared/icons';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

// Captured during init so the settings click handler can open the side panel
// synchronously — chrome.sidePanel.open() must run inside the user gesture,
// so no `await` may precede it.
let currentWindowId: number | undefined;

async function init(): Promise<void> {
  // Static chrome icons.
  $('brandMark').innerHTML = icon('bookmark');
  $('openSettings').innerHTML = icon('settings');
  $('newFolder').innerHTML = `${icon('folderPlus')}<span>New folder</span>`;
  $('save').innerHTML = `${icon('bookmark')}<span>Save</span>`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Settings stays reachable on any page, so wire it before the early return.
  currentWindowId = tab?.windowId;
  $<HTMLButtonElement>('openSettings').addEventListener('click', openSettings);

  if (!tab?.url || !tab.url.startsWith('http')) {
    showStatus('This page cannot be saved.', true);
    $<HTMLButtonElement>('save').disabled = true;
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
  sel.addEventListener('change', syncRecsActive);

  const tagsInput = $<HTMLInputElement>('tags');
  tagsInput.value = suggestedTags.join(', ');
  renderTagSugg(suggestedTags, tagsInput);

  setupNewFolder(sel);
  $<HTMLButtonElement>('save').addEventListener('click', () => void onSave(page));

  updateSaveBtn();
}

/** Opens the settings UI in the browser side panel, then closes the popup. */
function openSettings(): void {
  if (currentWindowId === undefined) return;
  // No `await` before open() — must stay inside the click's user gesture.
  chrome.sidePanel
    .open({ windowId: currentWindowId })
    .then(() => window.close())
    .catch((err: unknown) =>
      showStatus(err instanceof Error ? err.message : String(err), true),
    );
}

function renderRecs(recs: FolderRecommendation[]): void {
  const box = $('recs');
  const label = $('recsLabel');
  box.replaceChildren();
  if (recs.length === 0) {
    label.hidden = true;
    return;
  }
  label.hidden = false;
  label.innerHTML = `${icon('sparkles')}<span>Suggested</span>`;

  recs.forEach((r, i) => {
    const pct = Math.round(r.confidence * 100);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.folderId = r.folderId;
    chip.className = [
      'group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1',
      'text-xs transition-colors cursor-pointer',
      i === 0
        ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
        : 'border-base-300 hover:border-primary/40 hover:bg-base-200',
    ].join(' ');
    chip.title = r.reason;
    chip.innerHTML = `
      <span class="font-medium truncate max-w-[150px]">${escapeHtml(folderPath(r.folderId))}</span>
      <span class="tabular-nums text-[10px] font-semibold text-primary">${pct}%</span>`;
    chip.addEventListener('click', () => {
      $<HTMLSelectElement>('folder').value = r.folderId;
      syncRecsActive();
    });
    box.append(chip);
  });
  syncRecsActive();
}

/** Highlights the recommendation chip matching the current select value. */
function syncRecsActive(): void {
  const current = $<HTMLSelectElement>('folder').value;
  for (const chip of $('recs').querySelectorAll<HTMLButtonElement>('button')) {
    const active = chip.dataset.folderId === current;
    chip.classList.toggle('ring-2', active);
    chip.classList.toggle('ring-primary', active);
    chip.classList.toggle('ring-offset-1', active);
    chip.classList.toggle('ring-offset-base-100', active);
  }
}

function renderTagSugg(sugg: string[], input: HTMLInputElement): void {
  const box = $('tagSugg');
  box.replaceChildren();
  for (const t of sugg) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className =
      'inline-flex items-center gap-1 rounded-full border border-base-300 px-2.5 py-1 text-xs text-base-content/70 transition-colors hover:border-success/50 hover:bg-success/10 hover:text-success cursor-pointer';
    chip.innerHTML = `${icon('plus', 'text-[13px]')}<span>${escapeHtml(t)}</span>`;
    chip.addEventListener('click', () => {
      const cur = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!cur.includes(t)) {
        cur.push(t);
        input.value = cur.join(', ');
      }
      chip.classList.add('opacity-40', 'pointer-events-none');
    });
    box.append(chip);
  }
}

/** Inline new-folder row — replaces the jarring native prompt(). */
function setupNewFolder(sel: HTMLSelectElement): void {
  const trigger = $<HTMLButtonElement>('newFolder');
  const row = $('newFolderRow');
  const input = $<HTMLInputElement>('newFolderInput');
  const add = $<HTMLButtonElement>('newFolderAdd');
  const cancel = $<HTMLButtonElement>('newFolderCancel');

  const open = () => {
    trigger.hidden = true;
    row.hidden = false;
    input.value = '';
    input.focus();
  };
  const close = () => {
    row.hidden = true;
    trigger.hidden = false;
  };
  const commit = () => {
    const path = input.value.trim();
    if (!path) return close();
    const opt = document.createElement('option');
    opt.value = `__new__:${path}`;
    opt.textContent = `${path} (new)`;
    sel.append(opt);
    sel.value = opt.value;
    syncRecsActive();
    close();
  };

  trigger.addEventListener('click', open);
  add.addEventListener('click', commit);
  cancel.addEventListener('click', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') close();
  });
}

async function onSave(page: PageInfo): Promise<void> {
  const raw = $<HTMLSelectElement>('folder').value;
  const tags = $<HTMLInputElement>('tags').value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const title = $<HTMLInputElement>('title').value.trim() || page.title;

  const saveBtn = $<HTMLButtonElement>('save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span class="loading loading-spinner loading-xs"></span><span>Saving…</span>`;

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
    showStatus('Saved', false);
    setTimeout(() => window.close(), 700);
  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `${icon('bookmark')}<span>Save</span>`;
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
  el.innerHTML = `${icon(isError ? 'info' : 'check')}<span>${escapeHtml(msg)}</span>`;
  el.className = `text-xs flex items-center gap-1.5 justify-center ${
    isError ? 'text-error' : 'text-success'
  }`;
  el.hidden = false;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

void init();
