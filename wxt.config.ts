import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Source code lives under `app/` so `src/` can hold framework-agnostic modules.
  srcDir: 'app',
  manifest: {
    name: 'Smart Bookmark',
    description:
      'One-click bookmarking with local RAG + cloud LLM folder recommendation, reorganization, and WebDAV/S3 backup.',
    permissions: ['bookmarks', 'storage', 'activeTab', 'alarms'],
    // Needed for fetch() to the user-configured LLM endpoint and WebDAV/S3 hosts.
    // Broad for now; may switch to optional_host_permissions requested at runtime.
    host_permissions: ['https://*/*', 'http://*/*'],
  },
});
