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

## M2 — Local RAG

- [ ] `src/services/vectorStore.ts` — IndexedDB vector persistence + HNSW lifecycle (Domicile skeleton)
- [ ] `src/rag/embedder.ts` — Transformers.js `multilingual-e5-small`, WebGPU + WASM fallback, runs in Web Worker
- [ ] `src/rag/folderText.ts` — representative text per folder
- [ ] `src/rag/indexer.ts` — full build + incremental update on bookmark events (`textHash` skip)
- [ ] `src/rag/recall.ts` — HNSW Top-K cosine recall
- [ ] First-run progress UI for model download / index build

## M3 — LLM Save Recommendation

- [ ] `src/llm/schemas.ts` — JSON schemas for structured output
- [ ] `src/llm/provider.ts` — OpenAI-compatible `/v1/chat/completions` + `response_format`
- [ ] `src/llm/fallback.ts` — keyword-rule recommendation (no key / offline)
- [ ] `src/controllers/saveController.ts` — wire recall → re-rank → confirm → write
- [ ] Save panel: show recommendation, allow override / edit new-folder name

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
