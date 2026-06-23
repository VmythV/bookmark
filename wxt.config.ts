import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Source code lives under `app/` so `src/` can hold framework-agnostic modules.
  srcDir: 'app',
  manifest: {
    name: 'Smart Bookmark',
    description:
      'One-click bookmarking with local RAG + cloud LLM folder recommendation, reorganization, and WebDAV/S3 backup.',
    permissions: ['bookmarks', 'storage', 'activeTab', 'alarms', 'offscreen'],
    // ONNX runtime (used by Transformers.js) needs wasm-unsafe-eval to execute
    // its WebAssembly in the offscreen document / worker.
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // Needed for fetch() to the user-configured LLM endpoint and WebDAV/S3 hosts.
    // Broad for now; may switch to optional_host_permissions requested at runtime.
    host_permissions: ['https://*/*', 'http://*/*'],
  },
});
