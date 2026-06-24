/**
 * Side-panel "Organize" controller. Drives the reorg flow over a long-lived
 * Port to the background: Analyze (progress + cancel) → reviewable preview
 * (relocations + proposed new folders, each toggleable; folder names editable)
 * → Apply. All heavy work runs in the background; this file is pure UI + wiring.
 */
import { icon } from '@/lib/shared/icons';
import { getConfig } from '@/lib/services/storage';
import { REORG_PORT, type ReorgClientMsg, type ReorgServerMsg } from '@/lib/shared/messages';
import type { AppConfig } from '@/lib/shared/types';
import type { ReorgPlan, ReorgProgress } from '@/lib/reorg/types';

type State = 'idle' | 'running' | 'preview' | 'applying' | 'done' | 'error';

let root: HTMLElement;
let cfg: AppConfig | null = null;
let port: chrome.runtime.Port | null = null;

let state: State = 'idle';
let progress: ReorgProgress | null = null;
let plan: ReorgPlan | null = null;
let errorMsg = '';
let applied: { foldersCreated: number; bookmarksMoved: number; skipped: number } | null = null;

// Selection state for the preview.
const moveSel = new Set<string>(); // selected relocate ids
const folderSel = new Map<string, { selected: boolean; name: string }>();

export async function initOrganize(): Promise<void> {
  root = document.getElementById('organizeRoot')!;
  // Delegated listeners attached ONCE; handlers no-op outside preview.
  root.addEventListener('change', onPreviewChange);
  root.addEventListener('input', onPreviewInput);
  cfg = await getConfig();
  render();
}

// ───── Port lifecycle ─────

function ensurePort(): chrome.runtime.Port {
  if (port) return port;
  const p = chrome.runtime.connect({ name: REORG_PORT });
  p.onMessage.addListener((m: ReorgServerMsg) => onServer(m));
  p.onDisconnect.addListener(() => {
    port = null;
    if (state === 'running' || state === 'applying') {
      state = 'idle';
      render();
    }
  });
  port = p;
  return p;
}

function send(msg: ReorgClientMsg): void {
  ensurePort().postMessage(msg);
}

function onServer(m: ReorgServerMsg): void {
  switch (m.kind) {
    case 'progress':
      progress = m.progress;
      if (state === 'running') render();
      break;
    case 'plan':
      plan = m.plan;
      seedSelection(m.plan);
      state = 'preview';
      render();
      break;
    case 'applied':
      applied = m.result;
      state = 'done';
      render();
      break;
    case 'cancelled':
      state = 'idle';
      progress = null;
      render();
      break;
    case 'error':
      errorMsg = m.error;
      state = 'error';
      render();
      break;
  }
}

function seedSelection(p: ReorgPlan): void {
  moveSel.clear();
  folderSel.clear();
  for (const mv of p.moves) moveSel.add(mv.id);
  for (const nf of p.newFolders) folderSel.set(nf.tempId, { selected: true, name: nf.name });
}

// ───── Actions ─────

function startAnalyze(): void {
  state = 'running';
  progress = { phase: 'sync', done: 0, total: 0, message: 'Starting…' };
  plan = null;
  render();
  send({ cmd: 'analyze' });
}

function cancel(): void {
  send({ cmd: 'cancel' });
}

function applySelected(): void {
  if (!plan) return;
  const moves = plan.moves
    .filter((m) => moveSel.has(m.id))
    .map((m) => ({ id: m.id, toFolderId: m.toFolderId }));
  const newFolders = plan.newFolders
    .filter((nf) => folderSel.get(nf.tempId)?.selected)
    .map((nf) => ({
      name: folderSel.get(nf.tempId)!.name,
      parentId: nf.parentId,
      memberIds: nf.memberIds,
    }));
  if (moves.length === 0 && newFolders.length === 0) return;
  state = 'applying';
  render();
  send({ cmd: 'apply', input: { moves, newFolders } });
}

function selectedCount(): number {
  let n = moveSel.size;
  for (const v of folderSel.values()) if (v.selected) n++;
  return n;
}

// ───── Rendering ─────

function render(): void {
  if (!root) return;
  switch (state) {
    case 'idle':
      renderIdle();
      break;
    case 'running':
      renderRunning();
      break;
    case 'preview':
      renderPreview();
      break;
    case 'applying':
      root.innerHTML = centeredSpinner('Applying changes…');
      break;
    case 'done':
      renderDone();
      break;
    case 'error':
      renderError();
      break;
  }
}

function header(): string {
  return `
    <div>
      <h1 class="text-lg font-semibold tracking-tight">Organize</h1>
      <p class="text-xs opacity-60 mt-1 leading-relaxed">
        Scan your bookmarks for misfiled items and unfiled clusters, then review
        before anything moves.
      </p>
    </div>`;
}

function renderIdle(): void {
  const embedOn = isConfigured(cfg?.embedding);
  const chatOn = isConfigured(cfg?.chat);
  const hints: string[] = [];
  if (!embedOn) {
    hints.push(
      callout(
        'sparkles',
        'info',
        'Connect an embedding provider to also group unfiled bookmarks into new folders. Relocation still works without it.',
      ),
    );
  } else if (!chatOn) {
    hints.push(
      callout(
        'info',
        'info',
        'No chat provider configured — new-folder names will be generated from keywords.',
      ),
    );
  }
  root.innerHTML = `
    ${header()}
    <button id="orgAnalyze" class="btn btn-primary btn-sm gap-2 w-full">
      ${icon('wand')}<span>Analyze bookmarks</span>
    </button>
    ${hints.join('')}`;
  root.querySelector('#orgAnalyze')!.addEventListener('click', startAnalyze);
}

function renderRunning(): void {
  const p = progress;
  const indeterminate = !p || p.total === 0;
  const bar = indeterminate
    ? `<progress class="progress progress-primary w-full"></progress>`
    : `<progress class="progress progress-primary w-full" value="${p!.done}" max="${p!.total}"></progress>`;
  root.innerHTML = `
    ${header()}
    <div class="rounded-box bg-base-200 border border-base-300 p-4 space-y-3">
      <div class="text-sm font-medium">${escapeHtml(p?.message ?? 'Working…')}</div>
      ${bar}
      <button id="orgCancel" class="btn btn-ghost btn-sm gap-2">
        ${icon('info')}<span>Cancel</span>
      </button>
    </div>`;
  root.querySelector('#orgCancel')!.addEventListener('click', cancel);
}

function renderPreview(): void {
  const p = plan!;
  if (p.moves.length === 0 && p.newFolders.length === 0) {
    root.innerHTML = `
      ${header()}
      <div class="rounded-box bg-base-200 border border-base-300 p-6 text-center space-y-2">
        <div class="text-success text-2xl">${icon('check')}</div>
        <div class="text-sm font-medium">Everything looks well organized</div>
        <div class="text-xs opacity-60">Scanned ${p.stats.total} bookmarks — no changes suggested.</div>
        <button id="orgRescan" class="btn btn-ghost btn-xs mt-1">Re-scan</button>
      </div>`;
    root.querySelector('#orgRescan')!.addEventListener('click', startAnalyze);
    return;
  }

  const movesHtml = p.moves
    .map(
      (m) => `
      <label class="flex items-start gap-2.5 rounded-box bg-base-200 border border-base-300 p-2.5 cursor-pointer">
        <input type="checkbox" data-move="${attr(m.id)}" class="checkbox checkbox-xs checkbox-primary mt-0.5" ${
          moveSel.has(m.id) ? 'checked' : ''
        } />
        <div class="min-w-0 grow">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium truncate grow">${escapeHtml(m.title || m.url)}</span>
            <span class="badge badge-xs ${confBadge(m.confidence)} tabular-nums shrink-0">${Math.round(
              m.confidence * 100,
            )}%</span>
          </div>
          <div class="text-[11px] opacity-50 truncate">${escapeHtml(m.host)}</div>
          <div class="text-[11px] mt-1 flex items-center gap-1 opacity-80" title="${attr(m.reason)}">
            <span class="truncate max-w-[110px]">${escapeHtml(m.fromPath || '—')}</span>
            ${icon('arrowRight', 'opacity-60')}
            <span class="truncate max-w-[110px] text-primary font-medium">${escapeHtml(m.toPath)}</span>
          </div>
        </div>
      </label>`,
    )
    .join('');

  const foldersHtml = p.newFolders
    .map((nf) => {
      const sel = folderSel.get(nf.tempId)!;
      return `
      <div class="rounded-box bg-base-200 border border-base-300 p-2.5 space-y-2">
        <div class="flex items-center gap-2.5">
          <input type="checkbox" data-folder="${attr(nf.tempId)}" class="checkbox checkbox-xs checkbox-primary" ${
            sel.selected ? 'checked' : ''
          } />
          <input type="text" data-folder-name="${attr(nf.tempId)}" value="${attr(sel.name)}"
            class="input input-bordered input-xs grow" />
          <span class="badge badge-ghost badge-xs shrink-0">${nf.memberIds.length}</span>
        </div>
        <div class="text-[11px] opacity-60 pl-7 leading-snug">
          in ${escapeHtml(nf.parentPath || 'Bookmarks bar')} ·
          ${escapeHtml(nf.sampleTitles.slice(0, 3).join(' · '))}
        </div>
      </div>`;
    })
    .join('');

  root.innerHTML = `
    ${header()}
    <div class="flex items-center justify-between">
      <div class="text-xs opacity-60">Scanned ${p.stats.total} · ${p.stats.relocated} to move · ${
        p.newFolders.length
      } new folders</div>
      <button id="orgRescan" class="btn btn-ghost btn-xs">Re-scan</button>
    </div>
    ${
      p.moves.length
        ? `<div class="space-y-2">
             <div class="flex items-center justify-between">
               <div class="text-[11px] font-medium uppercase tracking-wide opacity-50">Move to existing folders (${p.moves.length})</div>
               <button id="orgToggleMoves" class="link link-primary text-[11px]">Toggle all</button>
             </div>
             <div class="space-y-1.5">${movesHtml}</div>
           </div>`
        : ''
    }
    ${
      p.newFolders.length
        ? `<div class="space-y-2">
             <div class="text-[11px] font-medium uppercase tracking-wide opacity-50">Suggested new folders (${p.newFolders.length})</div>
             <div class="space-y-1.5">${foldersHtml}</div>
           </div>`
        : ''
    }
    <div class="sticky bottom-0 -mx-4 px-4 py-3 bg-base-100 border-t border-base-300 flex items-center gap-2">
      <button id="orgApply" class="btn btn-primary btn-sm grow gap-2">
        ${icon('check')}<span id="orgApplyLabel">Apply ${selectedCount()} changes</span>
      </button>
    </div>`;

  // Wire events.
  root.querySelector('#orgRescan')!.addEventListener('click', startAnalyze);
  root.querySelector('#orgApply')!.addEventListener('click', applySelected);
  root.querySelector('#orgToggleMoves')?.addEventListener('click', () => {
    const allOn = plan!.moves.every((m) => moveSel.has(m.id));
    moveSel.clear();
    if (!allOn) for (const m of plan!.moves) moveSel.add(m.id);
    renderPreview();
  });
}

function onPreviewChange(e: Event): void {
  const el = e.target as HTMLInputElement;
  const moveId = el.dataset.move;
  const folderId = el.dataset.folder;
  if (moveId !== undefined) {
    if (el.checked) moveSel.add(moveId);
    else moveSel.delete(moveId);
    updateApplyLabel();
  } else if (folderId !== undefined) {
    const s = folderSel.get(folderId);
    if (s) s.selected = el.checked;
    updateApplyLabel();
  }
}

function onPreviewInput(e: Event): void {
  const el = e.target as HTMLInputElement;
  const tempId = el.dataset.folderName;
  if (tempId !== undefined) {
    const s = folderSel.get(tempId);
    if (s) s.name = el.value;
  }
}

function updateApplyLabel(): void {
  const label = root.querySelector('#orgApplyLabel');
  if (label) label.textContent = `Apply ${selectedCount()} changes`;
}

function renderDone(): void {
  const r = applied!;
  root.innerHTML = `
    ${header()}
    <div class="rounded-box bg-success/10 border border-success/20 p-5 text-center space-y-2">
      <div class="text-success text-2xl">${icon('check')}</div>
      <div class="text-sm font-medium">Reorganized your bookmarks</div>
      <div class="text-xs opacity-70">
        Moved ${r.bookmarksMoved} · created ${r.foldersCreated} folders${
          r.skipped ? ` · skipped ${r.skipped}` : ''
        }
      </div>
      <button id="orgAgain" class="btn btn-ghost btn-xs mt-1">Scan again</button>
    </div>`;
  root.querySelector('#orgAgain')!.addEventListener('click', startAnalyze);
}

function renderError(): void {
  root.innerHTML = `
    ${header()}
    <div class="rounded-box bg-error/10 border border-error/20 p-4 space-y-2">
      <div class="text-sm font-medium text-error">Analysis failed</div>
      <div class="text-xs opacity-70 break-words">${escapeHtml(errorMsg)}</div>
      <button id="orgRetry" class="btn btn-sm btn-outline mt-1">Retry</button>
    </div>`;
  root.querySelector('#orgRetry')!.addEventListener('click', startAnalyze);
}

// ───── Small helpers ─────

function isConfigured(c?: { enabled: boolean; endpoint: string; apiKey: string; model: string }): boolean {
  return !!c && c.enabled && !!c.endpoint && !!c.apiKey && !!c.model;
}

function confBadge(c: number): string {
  if (c >= 0.6) return 'badge-success';
  if (c >= 0.45) return 'badge-warning';
  return 'badge-ghost';
}

function centeredSpinner(label: string): string {
  return `
    ${header()}
    <div class="flex items-center gap-3 justify-center py-8">
      <span class="loading loading-spinner loading-sm"></span>
      <span class="text-sm">${escapeHtml(label)}</span>
    </div>`;
}

function callout(iconName: Parameters<typeof icon>[0], tone: 'info', text: string): string {
  return `
    <div class="rounded-box bg-${tone}/10 border border-${tone}/20 text-xs leading-relaxed px-3 py-3 flex gap-2">
      <span class="text-${tone} shrink-0 mt-0.5">${icon(iconName)}</span>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function attr(s: string): string {
  return escapeHtml(s);
}
