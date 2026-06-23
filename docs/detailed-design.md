# Detailed Design: Smart Bookmark Extension

> This document expands the [Design Overview](./design-overview.md) into module-level,
> data-model-level, and flow-level detail. It is a design specification, not an
> implementation. Code snippets are illustrative interface sketches only.

## Table of Contents

1. [Architecture & Layers](#1-architecture--layers)
2. [Entry Points & Manifest](#2-entry-points--manifest)
3. [Module Breakdown](#3-module-breakdown)
4. [Data Models](#4-data-models)
5. [Core Flow: Save a Bookmark](#5-core-flow-save-a-bookmark)
6. [Core Flow: Reorganize Existing Bookmarks](#6-core-flow-reorganize-existing-bookmarks)
7. [Local RAG Subsystem](#7-local-rag-subsystem)
8. [LLM Provider Layer](#8-llm-provider-layer)
9. [Backup / Import / Export Subsystem](#9-backup--import--export-subsystem)
10. [MV3 Constraints & Long-Running Tasks](#10-mv3-constraints--long-running-tasks)
11. [Messaging Contract](#11-messaging-contract)
12. [Settings & Configuration](#12-settings--configuration)
13. [Error Handling & Fallbacks](#13-error-handling--fallbacks)
14. [Privacy & Security](#14-privacy--security)
15. [Project Layout](#15-project-layout)
16. [Milestones](#16-milestones)
17. [Open Questions](#17-open-questions)

---

## 1. Architecture & Layers

The extension is a pure client-side MV3 web extension. There is no self-hosted
backend. Four logical layers:

| Layer | Responsibility | Runtime location |
|-------|----------------|------------------|
| **UI** | Floating button, toolbar popup, options/reorg pages | content script + extension pages |
| **Orchestration** | Coordinates save/reorg/backup flows, owns app state | background service worker |
| **Intelligence** | Local embeddings, HNSW recall, LLM re-ranking, clustering | Web Worker (compute) + provider modules |
| **Persistence** | Native bookmarks (source of truth) + config + vector index | `chrome.bookmarks`, `storage.local`, IndexedDB |

Key principle: **the native bookmark tree is the single source of truth.** The
vector index in IndexedDB is a derived cache that can always be rebuilt from the
bookmark tree.

```
                ┌──────────────────────── UI layer ────────────────────────┐
                │  content script        toolbar popup       options/reorg  │
                │  (floating button)     (save panel)        pages          │
                └───────────────┬───────────────┬───────────────┬──────────┘
                                │   runtime messaging (typed)    │
                ┌───────────────▼────────────────────────────────▼──────────┐
                │           background service worker (orchestrator)         │
                │  saveController · reorgController · backupController       │
                └──────┬──────────────┬──────────────┬───────────────┬───────┘
                       │              │              │               │
                ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼─────┐ ┌───────▼──────┐
                │ bookmarks  │ │  RAG       │ │  LLM       │ │ backup       │
                │ service    │ │ subsystem  │ │ provider   │ │ adapters     │
                │(chrome API)│ │(worker)    │ │(chat/comp) │ │(WebDAV/S3)   │
                └────────────┘ └─────┬──────┘ └─────┬──────┘ └──────────────┘
                                     │              │
                              IndexedDB        cloud endpoint
                             (vectors)      (/v1/chat/completions)
```

---

## 2. Entry Points & Manifest

WXT file-based entry points (`entrypoints/`):

| Entry point | Type | Purpose |
|-------------|------|---------|
| `background.ts` | service worker | orchestration, alarms, message router |
| `content.ts` | content script | inject floating button via `createShadowRootUi` |
| `popup/` | action popup | save panel (toolbar icon) |
| `options/` | options page | settings + reorganization workbench |

Manifest (declared through `wxt.config.ts`):

```ts
export default defineConfig({
  manifest: {
    name: 'Smart Bookmark',
    permissions: ['bookmarks', 'storage', 'activeTab', 'alarms'],
    host_permissions: [
      // user-configured at runtime; declared broadly, narrowed via optional_host_permissions if desired
      'https://*/*',
    ],
    action: { default_popup: 'popup.html' },
    options_page: 'options.html',
  },
});
```

Notes:
- `bookmarks` — read/write the native tree.
- `storage` — config + vector-index metadata (vectors themselves in IndexedDB).
- `activeTab` — read the current tab's url/title on demand without broad host grants.
- `alarms` — scheduled backups.
- `host_permissions` — needed for `fetch` to the user's LLM endpoint and WebDAV/S3
  hosts. Consider `optional_host_permissions` + runtime request to minimize the
  grant surface (open question).

---

## 3. Module Breakdown

```
src/
├─ services/
│  ├─ bookmarks.ts        # chrome.bookmarks wrapper: getTree, path resolution, create, move, batch
│  ├─ storage.ts          # typed storage.local accessor (config, secrets, metadata)
│  └─ vectorStore.ts      # IndexedDB vector persistence + HNSW index lifecycle
├─ rag/
│  ├─ embedder.ts         # Transformers.js multilingual-e5-small wrapper (runs in worker)
│  ├─ recall.ts           # HNSW Top-K cosine recall
│  ├─ folderText.ts       # build "representative text" for a folder
│  └─ indexer.ts          # full build + incremental update on bookmark events
├─ llm/
│  ├─ provider.ts         # ChatCompletionsProvider (OpenAI-compatible)
│  ├─ schemas.ts          # JSON schemas for structured outputs
│  └─ fallback.ts         # keyword-rule recommendation (no key / offline)
├─ reorg/
│  ├─ cluster.ts          # HDBSCAN over bookmark embeddings
│  ├─ naming.ts           # LLM folder naming per cluster
│  └─ plan.ts             # build a reorg plan (preview) + apply
├─ backup/
│  ├─ htmlBookmarks.ts    # Netscape bookmark HTML serialize/parse
│  ├─ webdav.ts           # WebDAV PUT/GET adapter
│  └─ s3.ts               # S3 SigV4 PUT/GET adapter
├─ controllers/
│  ├─ saveController.ts
│  ├─ reorgController.ts
│  └─ backupController.ts
└─ shared/
   ├─ messages.ts         # typed message contracts
   └─ types.ts
```

Each module is single-responsibility and independently testable. Controllers live
in the background worker; `rag/embedder`, `rag/recall`, and `reorg/cluster` run in
a dedicated Web Worker (see §10).

---

## 4. Data Models

```ts
// A native bookmark node, mirrored from chrome.bookmarks
interface BookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;          // undefined => folder
  index?: number;
  children?: BookmarkNode[];
}

// Vector index entry (IndexedDB). One per folder (for recall) and optionally per bookmark (for reorg).
interface VectorEntry {
  key: string;           // bookmark/folder id
  kind: 'folder' | 'bookmark';
  vector: number[];      // multilingual-e5-small embedding
  textHash: string;      // hash of the source text, to skip re-embedding unchanged nodes
  updatedAt: number;     // epoch ms (stamped by caller, not inside worker)
}

// LLM structured recommendation (save flow)
interface SaveRecommendation {
  action: 'use_existing' | 'create_new';
  folderId?: string;        // when use_existing
  newFolderPath?: string;   // when create_new, e.g. "Dev/Rust"
  confidence: number;       // 0..1
  reason: string;
}

// Reorg plan (preview before apply)
interface ReorgPlan {
  clusters: ReorgCluster[];
  noise: string[];          // bookmark ids HDBSCAN could not classify
  generatedAt: number;
}
interface ReorgCluster {
  suggestedFolderName: string;
  suggestedPath: string;    // full path under a root
  bookmarkIds: string[];
}

// Persisted configuration (storage.local)
interface AppConfig {
  llm: {
    endpoint: string;       // e.g. https://api.example.com/v1
    apiKey: string;         // PLAINTEXT this iteration (local only)
    model: string;
  };
  embedding: { model: string };  // default 'Xenova/multilingual-e5-small'
  recall: { topK: number };      // default 10
  backup: {
    target: 'none' | 'webdav' | 's3';
    schedule: 'off' | 'daily' | 'weekly';
    webdav?: { url: string; username: string; password: string };
    s3?: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; key: string };
  };
}
```

> **Time stamping note:** the compute worker and any deterministic code must not
> call `Date.now()` where reproducibility matters; timestamps are stamped by the
> orchestrator at the boundary.

---

## 5. Core Flow: Save a Bookmark

```
User clicks floating button / toolbar icon
        │
        ▼
UI captures { url, title, selectionText, meta(description, og:tags) }
        │  message: SAVE_REQUEST
        ▼
saveController (background)
        │ 1. ensure index is warm (lazy build if first run)
        │ 2. embed the page text  ──────────► RAG worker (embedder)
        │ 3. HNSW recall Top-K folders ─────► RAG worker (recall)
        │ 4. build LLM prompt: page info + Top-K candidate folders (path + sample titles)
        │ 5. call ChatCompletionsProvider (json_schema strict) ──► cloud endpoint
        │      └─ on no-key/offline/error → fallback.ts keyword rule
        ▼
SaveRecommendation returned to UI
        │  user reviews: accept / pick another folder / edit new-folder name
        ▼
On confirm:
        │ bookmarks.service.create(...)   (create folder path if action=create_new)
        │ indexer: incremental add of the new bookmark
        │ (optional) backupController.maybeBackup()
        ▼
Done — toast + collapse panel
```

Prompt construction keeps the LLM context bounded: only the Top-K recalled folders
are described (path + a few sample titles each), never the full tree. This is the
whole point of the local-recall-then-LLM-rerank split.

---

## 6. Core Flow: Reorganize Existing Bookmarks

A **destructive batch operation**, therefore strictly preview-then-apply, with an
automatic safety backup.

```
User opens reorg workbench (options page) and picks a scope
   (whole library / a subfolder / unsorted only)
        │  message: REORG_BUILD_PLAN { scope }
        ▼
reorgController (background → worker)
   1. collect bookmarks in scope
   2. embed each bookmark (reuse cached vectors when textHash unchanged)
   3. HDBSCAN cluster the embeddings           → clusters + noise[]
   4. for each cluster: LLM names the folder    → suggestedFolderName/path
   5. assemble ReorgPlan
        │  ReorgPlan returned to UI
        ▼
UI renders preview: clusters as proposed folders, draggable reassignment,
   noise shown as "Unsorted" (default placement)
        │  user edits & confirms  → message: REORG_APPLY { plan }
        ▼
reorgController.apply:
   0. AUTO BACKUP: serialize current tree to HTML, store locally (rollback copy)
   1. create proposed folders
   2. batch-move bookmarks into target folders
   3. place noise into "Unsorted" (or keep in place — configurable)
   4. rebuild/patch the vector index for moved nodes
        ▼
Done — summary (N moved, M folders created, K unsorted) + "undo via backup" hint
```

Safety properties:
- Nothing is moved before the user confirms the preview.
- A full HTML snapshot is taken automatically right before applying.
- Apply is idempotent-friendly: re-running with the same plan is a no-op for nodes
  already in place.

---

## 7. Local RAG Subsystem

**Skeleton:** Domicile (Transformers.js embeddings + pure-TS HNSW + IndexedDB),
with the embedding model overridden to `multilingual-e5-small` for strong
Chinese + English quality.

- **Embedder** (`rag/embedder.ts`): loads `Xenova/multilingual-e5-small` via
  Transformers.js, WebGPU when available, WASM fallback. Model weights cached in
  IndexedDB by Transformers.js; first load shows a progress bar.
- **Folder representative text** (`rag/folderText.ts`): `folderName + fullPath +
  up to N sample child titles`. This is what gets embedded for recall.
- **Index lifecycle** (`rag/indexer.ts`):
  - *Full build* on first use: walk the tree, embed every folder, bulk-insert into HNSW.
  - *Incremental update*: subscribe to `bookmarks.onCreated/onChanged/onRemoved/onMoved`
    and patch only affected entries. `textHash` skips re-embedding unchanged nodes.
- **Recall** (`rag/recall.ts`): cosine HNSW `query(pageVector, topK)`.

The vector store is a derived cache: a "Rebuild index" action in settings can wipe
and regenerate it from the tree at any time.

---

## 8. LLM Provider Layer

**Endpoint:** OpenAI-compatible `POST {endpoint}/chat/completions` only. The
Responses API is deliberately not used (target endpoints may not support it).

Structured output via `response_format`:

```ts
// llm/schemas.ts — save recommendation
const SAVE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'save_recommendation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['use_existing', 'create_new'] },
        folderId: { type: ['string', 'null'] },
        newFolderPath: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['action', 'folderId', 'newFolderPath', 'confidence', 'reason'],
      additionalProperties: false,
    },
  },
};
```

```ts
// llm/provider.ts — sketch
async function recommend(page: PageInfo, candidates: FolderCandidate[], cfg: AppConfig['llm']): Promise<SaveRecommendation> {
  const res = await fetch(`${cfg.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(page, candidates) },
      ],
      response_format: SAVE_SCHEMA,
    }),
  });
  // parse choices[0].message.content as JSON (already schema-constrained)
}
```

**Fallback** (`llm/fallback.ts`): when no API key is configured, the request fails,
or the user is offline — recommend by keyword overlap between the page
title/domain and folder names/paths, returning the best match or `create_new`
with a derived name. Same `SaveRecommendation` shape, so the UI is agnostic.

**Reorg naming** reuses the provider with a different schema (`{folderName}` per
cluster, given representative sample titles from the cluster).

---

## 9. Backup / Import / Export Subsystem

**Format:** standard Netscape bookmark HTML (`htmlBookmarks.ts`), readable by any
browser and most bookmark tools. Optional companion JSON for fidelity.

**Mode:** one-way, full overwrite snapshot (no incremental diff, no two-way sync).

**Adapters:**
- `webdav.ts`: `PUT {url}` to upload, `GET {url}` to fetch for import. Basic auth.
- `s3.ts`: SigV4-signed `PUT`/`GET` against an S3-compatible endpoint. Requires the
  bucket's CORS to allow the extension origin.

**Triggers:**
- Manual: a "Backup now" button.
- Scheduled: `chrome.alarms` (`daily` / `weekly`), handler in the background worker.

**Import:** fetch remote HTML (or local file) → parse → present a preview → write
into the tree (merge or replace — replace by default for a backup-restore mental
model; merge is an open question).

**CORS caveat:** browser-side direct upload to S3/WebDAV needs correct server CORS.
This is documented as a setup prerequisite and surfaced in settings with a "test
connection" action.

---

## 10. MV3 Constraints & Long-Running Tasks

The MV3 service worker can be **evicted at any time**. Full embedding and
reorganization are long tasks, so:

- Heavy compute (embedding, HNSW build, HDBSCAN) runs in a **dedicated Web Worker**
  owned by an extension page (options/reorg page) when that page is open, or is
  **chunked + checkpointed** so it survives worker restarts.
- Progress and partial state are checkpointed to IndexedDB; a restarted task
  resumes from the last checkpoint rather than restarting.
- Tasks are **cancellable**; the UI owns a cancel control.
- `chrome.alarms` (not `setTimeout`) drives scheduling, since timers don't survive
  worker eviction.

---

## 11. Messaging Contract

Typed messages between UI and background (`shared/messages.ts`):

| Message | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `SAVE_REQUEST` | UI → bg | `PageInfo` | `SaveRecommendation` |
| `SAVE_CONFIRM` | UI → bg | `{ rec, overrides? }` | `{ createdId }` |
| `REORG_BUILD_PLAN` | UI → bg | `{ scope }` | `ReorgPlan` |
| `REORG_APPLY` | UI → bg | `{ plan }` | `{ moved, created, unsorted }` |
| `BACKUP_NOW` | UI → bg | `{}` | `{ ok, url }` |
| `INDEX_REBUILD` | UI → bg | `{}` | `{ count }` |
| `PROGRESS` | bg → UI | `{ task, done, total }` | — (event) |

---

## 12. Settings & Configuration

Options page sections:
1. **LLM** — endpoint, API key, model, "test" button.
2. **Embedding** — model (default `multilingual-e5-small`), "rebuild index".
3. **Recall** — Top-K (default 10).
4. **Backup** — target (none/WebDAV/S3), credentials, schedule (off/daily/weekly),
   "backup now", "test connection".
5. **Reorganization workbench** — scope picker, build plan, preview, apply.
6. **Privacy notice** — explains what is sent to the cloud LLM endpoint.

All values persist to `storage.local` (plaintext this iteration; local-only).

---

## 13. Error Handling & Fallbacks

| Failure | Behavior |
|---------|----------|
| No API key / offline / LLM error | Fall back to keyword-rule recommendation (same shape) |
| Embedding model download fails | Retry with backoff; allow keyword-only mode meanwhile |
| WebGPU unavailable | Transparent WASM fallback (slower) |
| Backup target unreachable / CORS | Surface a clear error + "test connection" guidance; never silently drop |
| HDBSCAN noise points | Default to "Unsorted" folder (configurable: keep in place) |
| Worker evicted mid-task | Resume from IndexedDB checkpoint |

---

## 14. Privacy & Security

- **Local-first:** folder names, titles, and page text are embedded **locally**;
  they never leave the machine for the embedding step.
- **What leaves the machine:** only the LLM re-rank/naming calls send the page
  title/URL + Top-K candidate folder names to the user-configured endpoint. A
  privacy notice states this explicitly.
- **Secrets:** API keys and S3/WebDAV credentials are stored **plaintext** in
  `storage.local` this iteration (explicit user decision; data is local-only and
  never uploaded by the extension itself). Encryption (master-password derived) is
  a future option.
- **Destructive ops gated:** reorganization always previews and auto-backs-up
  before applying.

---

## 15. Project Layout

```
bookmark/
├─ docs/
│  ├─ design-overview.md
│  └─ detailed-design.md      ← this file
├─ entrypoints/               (WXT)
│  ├─ background.ts
│  ├─ content.ts
│  ├─ popup/
│  └─ options/
├─ src/                       (modules per §3)
├─ wxt.config.ts
├─ package.json
├─ README.md                  (English, default)
└─ README.zh-CN.md            (Chinese)
```

---

## 16. Milestones

1. **M1 — Scaffold & bookmark CRUD:** WXT project, manifest, floating button +
   popup, create/move bookmarks. (No AI yet.)
2. **M2 — Local RAG:** integrate Domicile + `multilingual-e5-small`, full + incremental index, HNSW recall.
3. **M3 — LLM save recommendation:** chat/completions provider + schema + fallback; end-to-end save flow.
4. **M4 — Backup/import/export:** HTML serialize/parse, WebDAV + S3 adapters, manual + scheduled.
5. **M5 — Reorganization:** HDBSCAN clustering, LLM naming, preview + apply with auto-backup.
6. **M6 — Polish:** settings UX, progress/cancel, privacy notice, error states.

---

## 17. Open Questions

1. **Reorg granularity** — default to "select a scope, then reorganize" rather than forcing the whole library.
2. **HDBSCAN noise-point placement** — default "Unsorted" folder; confirm.
3. **Default scheduled-backup interval** — `daily` proposed; configurable.
4. **Embedding model variant** — `Xenova/multilingual-e5-small`; confirm quantization.
5. **Reorg keeps old structure as reference** vs. fully rebuilds — suggest keep-until-confirmed.
6. **Import merge vs. replace** — replace by default (backup-restore model); merge as option.
7. **host_permissions breadth** — broad `https://*/*` vs. `optional_host_permissions` requested at runtime.
