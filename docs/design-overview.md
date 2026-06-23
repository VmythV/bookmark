# Design Overview: Smart Bookmark Extension

## Goal & Scope

One-click bookmarking of the current web page → local RAG recall + cloud LLM re-ranking to recommend which folder to use (or suggest creating a new one) → write directly into the browser's native bookmarks. Supports one-way backup / import / export to WebDAV/S3, and provides **one-click reorganization of existing bookmarks** (automatic clustering into a fresh folder structure).

**In scope:** Chrome/Edge (MV3) · WXT + TypeScript · floating in-page button **and** toolbar popup (dual entry) · multilingual local embeddings (`multilingual-e5-small`) for RAG · cloud `/v1/chat/completions` re-ranking · one-way backup (manual + scheduled, overwrite) · HTML import/export · **bookmark reorganization (embedding + HDBSCAN clustering)**.

**Out of scope:** Firefox/Safari · two-way sync · WebLLM / local LLM · Responses API · self-hosted backend · credential encryption (plaintext this iteration).

## Key Decisions (with rationale)

1. **Browser bookmarks = source of truth.** Writing via `chrome.bookmarks` *is* writing to the native bookmarks, so "staying in sync with the browser" is a natural consequence, not extra work. The extension's `storage.local` holds only config / API key / vector index / backup metadata (**plaintext, local-only, never uploaded**).
2. **Local RAG built on the Domicile skeleton, with the embedding model swapped to `multilingual-e5-small`.** Domicile already integrates Transformers.js embeddings + HNSW + IndexedDB, making integration fastest; the multilingual model guarantees **good quality for both Chinese and English**. Folder names and titles are vectorized locally and never leave the machine.
3. **LLM uses only `/v1/chat/completions` + `response_format: json_schema (strict)`.** Since the target endpoint may not support the Responses API, the chat endpoint offers the widest compatibility and structured output requires zero parsing. **WebLLM is not included**; with no API key / offline, the extension falls back to pure local keyword-rule recommendations.
4. **Two-stage save recommendation:** local HNSW recalls Top-K candidate folders → LLM re-ranks and returns `{action: "use_existing" | "create_new", folderId?, newFolderPath?, confidence, reason}`.
5. **One-way backup = full overwrite snapshot.** WebDAV (PUT/GET) + S3 (SigV4 PUT/GET) adapters store a standard HTML bookmark file on the remote. Triggers: **manual button + scheduled** (`chrome.alarms`).
6. **Bookmark reorganization = embedding + HDBSCAN clustering + LLM naming.** All bookmarks are embedded → HDBSCAN clusters them automatically (no preset number of categories) → each cluster is handed to the LLM for a folder name → a "reorg preview" is generated for user confirmation before anything is applied. Borrows Vectoria's `umap-js` / `hdbscan-ts` technology combination (dependencies only, not the whole package).

## Architecture

```
WXT Extension (MV3, Chrome/Edge)
├─ content script ──── floating button (createShadowRootUi)
├─ toolbar popup ───── save panel (shares UI with the floating button)
├─ reorg page (options / standalone) ── cluster preview + apply
├─ background (service worker) ── orchestration
│   Save flow:  getTree → local embed (e5) → HNSW recall Top-K → cloud LLM re-rank → confirm → bookmarks.create
│   Reorg flow: full embed → HDBSCAN cluster → LLM naming → preview → user confirm → batch move/create
│   Backup flow: serialize HTML → WebDAV/S3 PUT (manual / chrome.alarms scheduled)
├─ settings page: LLM endpoint/key/model · embedding model · Top-K · backup target/credentials/schedule
└─ storage.local + IndexedDB (vector index)
        │ fetch                         │ fetch
   Cloud OpenAI-compatible endpoint  WebDAV / S3 (HTML overwrite snapshot)
   (/v1/chat/completions)
```

**Index maintenance:** the first run embeds all bookmarks into HNSW; afterwards `bookmarks.onCreated/onChanged/onRemoved/onMoved` drive incremental updates.

## Implementation Steps

1. WXT + TS scaffold, permissions `["bookmarks","storage","activeTab","alarms"]` + host_permissions.
2. Floating button + popup, sharing the save panel.
3. Bookmark read/write layer (getTree / path resolution / create / move).
4. Integrate Domicile with the embedding model set to `multilingual-e5-small`, IndexedDB persistence + incremental updates.
5. Save recommendation: HNSW recall → chat/completions (json_schema) re-rank → confirm + write.
6. **Bookmark reorganization:** full embed → HDBSCAN cluster → LLM naming → preview UI → batch apply.
7. Backup / import / export: HTML serialization/parsing; WebDAV and S3 (SigV4) adapters; `chrome.alarms` scheduling.
8. Settings page.

## Risks & Trade-offs

- **First-time embedding model download (`multilingual-e5-small`, ~hundreds of MB)** — needs progress feedback and IndexedDB caching; WASM fallback when WebGPU is unavailable is slower.
- **Bookmark reorganization is a destructive batch operation** — must "preview + confirm" before executing, and automatically take an HTML backup beforehand so it can be rolled back.
- **Browser-side direct upload to S3/WebDAV requires correct server CORS configuration**; S3 also requires a correct SigV4 implementation.
- **HDBSCAN produces "noise points" (unclassifiable bookmarks)** — needs a fallback (keep in place / move to an "Unsorted" folder).
- **LLM re-ranking sends Top-K candidates + page title/URL to a third party** — the UI needs a privacy notice.
- **The MV3 service worker can be evicted** — long tasks (full embedding / reorg) must be interruptible, resumable, and run their computation in a Web Worker.

## Open Questions (non-blocking, decide during implementation)

1. **Reorg granularity:** "rebuild the whole library" vs. "reorganize only a subfolder / unsorted items" — default to "select a scope, then reorganize" rather than forcing the whole library.
2. **HDBSCAN noise-point placement:** default to an "Unsorted" folder, to be confirmed.
3. **Default scheduled-backup interval** (e.g. once a day) — configurable in settings.
4. **Exact embedding model source / quantized variant** (`Xenova/multilingual-e5-small`, etc.) — decide during implementation.
5. **Whether reorg keeps the existing folder structure as a reference** or builds entirely new — suggest generating the new structure while keeping the old one until the user confirms deletion.

## Reference Projects

- [Domicile](https://github.com/kyrillosishak/Domicile) — in-browser vector DB + local embeddings (Transformers.js) + HNSW; the RAG skeleton for this design.
- [MeMemo](https://github.com/poloclub/mememo) — in-browser HNSW vector index library (alternative).
- [Vectoria](https://github.com/arminpasalic/vectoria) — multilingual embeddings + UMAP + HDBSCAN clustering; reference for the reorganization technology combination.
- [WebLLM](https://github.com/mlc-ai/web-llm) — in-browser OpenAI-compatible LLM inference (not included this iteration; reserved as a local fallback).
- [WXT](https://wxt.dev) — cross-browser extension development framework.
