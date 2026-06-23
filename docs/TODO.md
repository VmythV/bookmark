# TODO List — Smart Bookmark

Tracking the build against the milestones in [detailed-design.md](./detailed-design.md).
Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## M1 — Scaffold & Bookmark CRUD (no AI) ✅

- [x] Initialize WXT + TypeScript project (`wxt.config.ts`, `package.json`)
- [x] Configure manifest: name, permissions `[bookmarks, storage, activeTab, alarms]`, host_permissions, action popup, options page
- [x] `app/entrypoints/background.ts` — service worker shell + message router skeleton
- [x] `app/entrypoints/content/` — floating button via `createShadowRootUi`
- [x] `app/entrypoints/popup/` — save panel UI
- [x] `app/entrypoints/options/` — settings page shell
- [x] `app/lib/services/bookmarks.ts` — getTree, path resolution, create, move
- [x] `app/lib/services/storage.ts` — typed `storage.local` accessor
- [x] `app/lib/shared/types.ts` + `app/lib/shared/messages.ts` — data models & message contracts
- [x] End-to-end: click button / popup → create a bookmark in the native tree (placeholder recommendation; smart recommendation in M3)

> Note: code lives under `app/` (`srcDir: 'app'` in `wxt.config.ts`); modules under `app/lib/`. Build verified with `tsc --noEmit` + `wxt build`.

## M2 — Local RAG ✅

- [x] `app/lib/services/vectorStore.ts` — IndexedDB vector persistence + cosine KNN (brute-force at this scale; HNSW-swappable query interface)
- [x] `app/lib/rag/embedderWorker.ts` + `app/entrypoints/offscreen/` — Transformers.js `multilingual-e5-small` in a Web Worker hosted by an **offscreen document** (MV3-safe), model downloaded from HF CDN at runtime
- [x] `app/lib/rag/embedderClient.ts` — background-side offscreen lifecycle + request correlation + progress
- [x] `app/lib/rag/folderText.ts` — representative text per folder + FNV-1a textHash
- [x] `app/lib/rag/indexer.ts` — full build + incremental update on bookmark events (`textHash` skip)
- [x] `app/lib/rag/recall.ts` — Top-K cosine recall; wired into saveController (M2 picks Top-1)
- [x] Options page: index status + build/rebuild button + progress bar
- [x] CSP `wasm-unsafe-eval` for ONNX runtime; `offscreen` permission

> Decisions: embedding runs in an **offscreen document** (service worker can't host it); model weights load from the **HuggingFace CDN** at runtime. Vector store uses exact cosine KNN for now. Build verified with `tsc --noEmit` + `wxt build`.

## M3 — LLM Save Recommendation ✅

- [x] `app/lib/llm/schemas.ts` — JSON schemas for structured output (save recommendation + folder naming)
- [x] `app/lib/llm/provider.ts` — OpenAI-compatible `/chat/completions` + `response_format` json_schema, prompt builder, defensive validation
- [x] `app/lib/llm/fallback.ts` — keyword-overlap recommendation (no key / offline), CJK-aware tokenizer
- [x] `app/lib/controllers/saveController.ts` — recall Top-K → LLM re-rank → keyword fallback → default folder
- [x] recall now fills `sampleTitles` for each candidate
- [x] Popup: existing-folder vs new-folder modes, pre-selected by the recommendation, confidence/reason shown

> Pipeline: recall (M2) → LLM structured re-rank → keyword fallback. Build verified with `tsc --noEmit` + `wxt build`. Runtime verification (live Chrome load + real LLM endpoint) still pending.

## M4 — Backup / Import / Export ✅

- [x] `app/lib/backup/htmlBookmarks.ts` — Netscape HTML serialize + DOM-free tolerant parse
- [x] `app/lib/backup/adapter.ts` — common `BackupAdapter` interface (put/get/test)
- [x] `app/lib/backup/webdav.ts` — PUT/GET/HEAD adapter (basic auth)
- [x] `app/lib/backup/s3.ts` — SigV4 adapter via `aws4fetch` (S3-compatible)
- [x] `app/lib/controllers/backupController.ts` — backupNow / testConnection / importFromRemote (non-destructive) / `chrome.alarms` schedule (daily/weekly)
- [x] background: alarm handler + schedule sync on startup; BACKUP_NOW/TEST/IMPORT/SCHEDULE_SYNC messages
- [x] options: WebDAV/S3 credential fields (toggle by target), backup now / test / import buttons

> One-way overwrite snapshot in standard HTML. S3 via aws4fetch (browser SigV4). Import is non-destructive (writes under an "Imported bookmarks" folder). Build verified with `tsc --noEmit` + `wxt build`. Runtime verification (live CORS-configured WebDAV/S3) still pending.

## M5 — Reorganization ✅

- [x] `app/lib/reorg/collect.ts` — collect bookmarks in scope + embed (reusing cached bookmark vectors by textHash)
- [x] `app/lib/reorg/cluster.ts` — HDBSCAN (`hdbscan-ts`) over embeddings; noise = label -1; adaptive minClusterSize
- [x] `app/lib/reorg/naming.ts` — LLM folder naming per cluster, keyword fallback (CJK-aware)
- [x] `app/lib/reorg/plan.ts` — buildPlan (embed → cluster → name) + applyPlan (auto HTML backup → create folders → batch move → noise to "Unsorted")
- [x] background: REORG_BUILD_PLAN / REORG_APPLY messages + progress broadcast
- [x] options: reorg workbench — scope picker, build plan, cluster preview, apply (with confirm)

> Reorg is preview-then-apply with an automatic HTML safety backup before moving anything. Clusters land under a "Reorganized/" root, noise under "Reorganized/Unsorted". Build verified with `tsc --noEmit` + `wxt build`. Runtime verification still pending.

## M6 — Polish ✅

- [x] Privacy notice in settings (local embeddings, what leaves the device, plaintext credentials)
- [x] Rebuild-index action (clear + rebuild) + cancel for long tasks (index & reorg) via cooperative `CANCEL_TASK`
- [x] Import merge vs. replace mode (replace auto-backs-up + clears writable roots first)
- [x] Local file export / import (download HTML / read a local file)
- [x] Error states surfaced in the options UI for every action

> Long tasks run while the options page is open (service worker stays alive), with cooperative cancellation. Full checkpoint/resume across worker eviction was deemed unnecessary given the page-driven model — noted as a future enhancement.

## Open Questions — resolved

- [x] Reorg granularity → scope picker (All / a top-level folder)
- [x] HDBSCAN noise placement → "Reorganized/Unsorted"
- [x] Default scheduled-backup interval → daily/weekly, off by default
- [x] Embedding model → `Xenova/multilingual-e5-small` (configurable)
- [x] Reorg keeps old structure → moves into a new "Reorganized/" root; safety backup before apply
- [x] Import merge vs. replace → both offered; merge is the default
- [x] host_permissions breadth → broad `https://*/*` + `http://*/*` for now (covers any user endpoint)

## Future enhancements (not in scope)

- [ ] Checkpoint/resume long tasks across service-worker eviction
- [ ] Approximate HNSW index for very large bookmark collections
- [ ] Credential encryption (master-password derived)
- [ ] Firefox/Safari support
- [ ] Two-way sync
- [ ] README screenshots
