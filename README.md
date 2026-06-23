# Smart Bookmark

> **English** | [简体中文](./README.zh-CN.md)

A privacy-first browser extension that bookmarks the current page in **one click** and uses **local RAG + a cloud LLM** to recommend the right folder — or suggest creating a new one. It writes directly to your **native browser bookmarks**, can **reorganize an existing bookmark collection** into a fresh folder structure automatically, and backs everything up to **WebDAV / S3**.

> Status: **design phase**. See [`docs/`](./docs) for the full specification. No runtime code yet.

## Features

- **One-click save** — a floating in-page button *and* a toolbar popup.
- **Smart folder recommendation** — local embeddings recall the most relevant folders, then a cloud LLM picks one or proposes a new folder. Only a small candidate set is sent to the LLM, never your whole tree.
- **Native bookmark integration** — uses `chrome.bookmarks`, so saving *is* saving to the browser. No second copy to keep in sync.
- **Bookmark reorganization** — embed all bookmarks, cluster them with HDBSCAN, let the LLM name each cluster, preview, then apply. Destructive steps are always preview-then-confirm with an automatic safety backup.
- **Backup & import/export** — one-way overwrite snapshots to WebDAV or S3 in standard HTML bookmark format. Triggered manually or on a schedule.
- **Bilingual quality** — uses `multilingual-e5-small` embeddings for strong Chinese *and* English results.
- **Privacy-first** — embeddings run locally; folder names and titles never leave your machine for the embedding step. Only the LLM re-rank call sends page title/URL + candidate folder names to your configured endpoint.

## How It Works

```
Click → capture page → local embed (multilingual-e5-small)
      → HNSW recall Top-K folders → cloud LLM re-rank (chat/completions, JSON schema)
      → you confirm → chrome.bookmarks.create → (optional) backup
```

The browser's native bookmark tree is the single source of truth; the local vector
index in IndexedDB is a derived cache that can be rebuilt at any time.

## Tech Stack

- [WXT](https://wxt.dev) + TypeScript — cross-browser extension framework (targeting Chrome/Edge, MV3).
- [Domicile](https://github.com/kyrillosishak/Domicile) skeleton — in-browser embeddings (Transformers.js) + HNSW + IndexedDB.
- `multilingual-e5-small` — multilingual local embedding model.
- HDBSCAN — automatic clustering for reorganization.
- OpenAI-compatible `/v1/chat/completions` — cloud LLM re-ranking & naming.

## Documentation

- [Design Overview](./docs/design-overview.md) — goals, scope, key decisions, risks.
- [Detailed Design](./docs/detailed-design.md) — modules, data models, flows, MV3 constraints, milestones.
- [Getting Started & Testing](./docs/getting-started.md) — build, load, manual test checklist, unit tests.
- [TODO / progress](./docs/TODO.md) — milestone checklist.

## Development

```bash
pnpm install
pnpm dev        # launch a dev build with HMR (Chrome)
pnpm build      # production build → .output/chrome-mv3
pnpm compile    # type-check (tsc --noEmit)
```

Load the unpacked extension: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3` (or the dev output).

## Usage

1. Open **Settings** (extension options) and, optionally, configure an OpenAI-compatible LLM endpoint, key, and model. Without a key, recommendations fall back to a local keyword rule.
2. Click **Build / update index** to embed your existing folders locally (first run downloads the embedding model).
3. Browse to any page and click the floating button or the toolbar icon to save — pick the recommended folder or override it.
4. Use **Reorganize bookmarks** to cluster existing bookmarks into a fresh structure (preview, then apply — a safety backup is taken automatically).
5. Configure **Backup** (WebDAV/S3) for one-way snapshots, or export/import a standard HTML bookmark file locally.

## Scope (this iteration)

**In:** Chrome/Edge (MV3), dual save entry, local multilingual RAG, cloud chat-completions re-ranking, one-way WebDAV/S3 backup (manual + scheduled), HTML import/export, bookmark reorganization.

**Out:** Firefox/Safari, two-way sync, in-browser LLM (WebLLM), the Responses API, a self-hosted backend, credential encryption.

## Privacy

Embeddings are computed locally. The only data sent to a third party is during the
LLM re-rank/naming step: the page title/URL and the names of the Top-K candidate
folders, sent to the OpenAI-compatible endpoint **you** configure. API keys and
backup credentials are stored locally (plaintext in this iteration) and are never
uploaded by the extension.

## License

MIT
