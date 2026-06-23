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

## M4 — Backup / Import / Export

- [ ] `src/backup/htmlBookmarks.ts` — Netscape HTML serialize/parse
- [ ] `src/backup/webdav.ts` — PUT/GET adapter (basic auth)
- [ ] `src/backup/s3.ts` — SigV4-signed PUT/GET adapter
- [ ] `src/controllers/backupController.ts` — manual trigger + `chrome.alarms` schedule
- [ ] Settings: backup target, credentials, schedule, "backup now", "test connection"
- [ ] Import flow: fetch/parse → preview → write (replace by default)

## M5 — Reorganization

- [ ] `src/reorg/cluster.ts` — HDBSCAN over bookmark embeddings
- [ ] `src/reorg/naming.ts` — LLM folder naming per cluster
- [ ] `src/reorg/plan.ts` — build ReorgPlan (preview) + apply with auto-backup
- [ ] `src/controllers/reorgController.ts` — build plan / apply messages
- [ ] Reorg workbench UI: scope picker, preview, drag-reassign, confirm

## M6 — Polish

- [ ] Progress + cancel for long tasks; checkpoint/resume across worker eviction
- [ ] Privacy notice in settings
- [ ] Error states per the error-handling table
- [ ] Rebuild-index action
- [ ] README screenshots / usage docs

## Open Questions (decide during implementation)

- [ ] Reorg granularity (scope vs. whole library)
- [ ] HDBSCAN noise placement (Unsorted vs. keep in place)
- [ ] Default scheduled-backup interval
- [ ] Embedding model quantization variant
- [ ] Reorg: keep old structure until confirmed
- [ ] Import merge vs. replace
- [ ] host_permissions breadth (broad vs. optional/runtime)
