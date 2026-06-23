# Getting Started & Testing Guide

How to build, load, manually test, and unit-test the Smart Bookmark extension.

## 1. Prerequisites

- **Node.js** ≥ 18 (developed on 22)
- **pnpm** ≥ 10
- **Chrome** or **Edge** (Chromium, MV3)
- A working internet connection for the first index build (the embedding model
  downloads from the HuggingFace CDN). Behind a proxy, export it before running
  network commands, e.g.:
  ```bash
  export https_proxy=http://127.0.0.1:10808 http_proxy=http://127.0.0.1:10808 all_proxy=socks5://127.0.0.1:10808
  ```

## 2. Install

```bash
pnpm install     # also runs `wxt prepare` (generates .wxt/ types)
```

## 3. Run / Build

```bash
pnpm dev         # dev build with HMR; output in .output/chrome-mv3 (dev)
pnpm build       # production build → .output/chrome-mv3
pnpm compile     # type-check only (tsc --noEmit)
pnpm test        # run unit tests once (vitest run)
pnpm test:watch  # unit tests in watch mode
```

`pnpm dev` keeps rebuilding on change. `pnpm build` produces a static unpacked
extension you load manually.

## 4. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the output folder:
   - dev: `.output/chrome-mv3` (created by `pnpm dev`)
   - prod: `.output/chrome-mv3` (created by `pnpm build`)
5. The **Smart Bookmark** icon appears in the toolbar. Pin it for convenience.

To reload after changes: `pnpm build` again, then click the **reload** icon on
the extension card (dev mode auto-reloads most changes).

### Inspecting logs
- **Background / offscreen:** on the extension card, click **service worker**
  (and **offscreen.html** if listed) to open DevTools for those contexts.
- **Popup:** right-click the toolbar icon → **Inspect popup**.
- **Options:** open the options page, then F12.
- **Content script (floating button):** the page's own DevTools console,
  filtered to `[smart-bookmark]`.

## 5. Manual test checklist

Work top to bottom; each builds on the previous.

### 5.1 Settings & index
- [ ] Open **Settings**. The Privacy card is visible.
- [ ] (Optional) Enter an OpenAI-compatible **endpoint**, **API key**, **model**. Without these, recommendations use the local keyword fallback.
- [ ] Click **Build / update index**. A progress bar advances; first run downloads the model (watch the offscreen console). Status shows "Indexed: N folders."
- [ ] Click **Cancel** mid-build → the task stops without error.
- [ ] Click **Clear & rebuild** → index is wiped and rebuilt.

### 5.2 Saving (toolbar popup)
- [ ] Visit a content page. Click the toolbar icon.
- [ ] The popup shows the page title/URL and a recommended folder (existing or "new folder" mode), plus a reason.
- [ ] Switch between **Existing folder** / **New folder**; edit the target.
- [ ] Click **Save** → the bookmark appears in the chosen folder (check `chrome://bookmarks`).

### 5.3 Saving (floating button)
- [ ] On any page, the 🔖 floating button appears (bottom-right).
- [ ] Click it → it shows ⏳ then ✅, and the bookmark is saved to the recommended folder.

### 5.4 Reorganization
- [ ] In Settings → **Reorganize bookmarks**, choose a scope (All or a folder).
- [ ] Click **Build plan**. Progress runs through embedding → clustering → naming. A preview lists proposed folders with member counts and sample titles.
- [ ] Click **Apply plan**, confirm. Bookmarks move under `Reorganized/<name>`, noise under `Reorganized/Unsorted`. A safety HTML backup is taken first (see background console).

### 5.5 Backup / import / export
- [ ] **Export to file…** downloads `bookmarks.html`. Open it in a browser to verify it's a valid bookmark file.
- [ ] **Import from file…** with mode = *Merge* → bookmarks appear under "Imported bookmarks" (existing tree untouched).
- [ ] Configure WebDAV or S3 (with CORS allowing the extension origin), **Test connection** → "Connection OK", **Backup now** → "Backed up N bytes", **Import from remote** → bookmarks imported.
- [ ] Set a **Schedule** (daily/weekly) and **Save settings** → a `chrome.alarms` entry is created (inspect via the background console: `chrome.alarms.getAll`).

### Known runtime prerequisites / gotchas
- **CORS:** browser-side PUT/GET to S3/WebDAV requires the server/bucket to allow this extension's origin. A failed preflight surfaces as a network error.
- **S3 endpoint:** object URL is `${endpoint}/${bucket}/${key}`; use a region-correct endpoint.
- **Model download size:** first index build fetches tens of MB; subsequent runs use the IndexedDB cache.
- **Embedding language:** default `Xenova/multilingual-e5-small` handles English + Chinese; change in Settings if needed.

## 6. Unit tests

Pure, browser-free logic is covered by Vitest:

```bash
pnpm test
```

Current coverage:
- `app/lib/backup/htmlBookmarks.test.ts` — serialize/parse round-trip, escaping, nesting, garbage input.
- `app/lib/reorg/cluster.test.ts` — HDBSCAN grouping, noise, disjoint partition, small-input handling.
- `app/lib/llm/fallback.test.ts` — keyword matching, new-folder proposal, CJK tokenization, confidence bounds.

These run in a Node environment (no Chrome APIs). Modules that touch
`chrome.*` (services, controllers, embedder) are exercised through the manual
checklist above rather than unit tests.

### Adding tests
Place `*.test.ts` next to the module under `app/lib/**`. Only test code that
doesn't import `chrome.*` (directly or transitively), or mock those APIs with
`wxt/testing/fake-browser` + the `WxtVitest` plugin if you need to.
