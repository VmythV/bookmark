import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'app',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Smart Bookmark',
    description:
      'AI-assisted bookmarking: one-click save with smart folder + tag suggestions, semantic search, and WebDAV/S3 backup.',
    permissions: ['bookmarks', 'storage', 'activeTab', 'alarms', 'scripting'],
    host_permissions: ['https://*/*', 'http://*/*'],
    commands: {
      'quick-save': {
        description: 'Quick-save the current page',
        suggested_key: { default: 'Ctrl+B', mac: 'Command+B' },
      },
    },
  },
});