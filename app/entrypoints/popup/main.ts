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
  // Current tab → page info (popup can't run capturePageInfo in the page context).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showStatus('No active page to save.', true);
    return;
  }
  page = { url: tab.url, title: tab.title ?? tab.url };
  $('pageTitle').textContent = page.title;
  $('pageUrl').textContent = page.url;

  // Populate the folder list and ask for a recommendation in parallel.
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
  if (rec.folderId) folderSelect.value = rec.folderId;
  $('reason').textContent = rec.reason;

  $('save').addEventListener('click', () => void onSave());
  $('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function onSave(): Promise<void> {
  if (!page || !rec) return;
  const btn = $<HTMLButtonElement>('save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const overrideFolderId = $<HTMLSelectElement>('folder').value;
    await sendMessage({
      type: 'SAVE_CONFIRM',
      page,
      recommendation: rec,
      overrideFolderId,
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
