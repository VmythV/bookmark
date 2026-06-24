/**
 * Typed accessor over chrome.storage.local for app configuration.
 * See docs/detailed-design.md §3 (services/storage.ts) and §12.
 */
import { DEFAULT_CONFIG, type AppConfig } from '../shared/types';

const CONFIG_KEY = 'config';

/** Deep-ish merge of stored config over defaults (one level for nested objects). */
function withDefaults(stored: Partial<AppConfig> | undefined): AppConfig {
  if (!stored) return structuredClone(DEFAULT_CONFIG);
  return {
    embedding: { ...DEFAULT_CONFIG.embedding, ...stored.embedding },
    chat: { ...DEFAULT_CONFIG.chat, ...stored.chat },
    recommend: { ...DEFAULT_CONFIG.recommend, ...stored.recommend },
    search: { ...DEFAULT_CONFIG.search, ...stored.search },
    backup: { ...DEFAULT_CONFIG.backup, ...stored.backup },
  };
}

/** Read the full config, filling defaults for missing keys. */
export async function getConfig(): Promise<AppConfig> {
  const res = await chrome.storage.local.get(CONFIG_KEY);
  return withDefaults(res[CONFIG_KEY] as Partial<AppConfig> | undefined);
}

/** Persist a partial update, merged over the current config. */
export async function setConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig();
  const next: AppConfig = withDefaults({ ...current, ...patch });
  await chrome.storage.local.set({ [CONFIG_KEY]: next });
  return next;
}

/** Subscribe to config changes. Returns an unsubscribe function. */
export function onConfigChanged(fn: (cfg: AppConfig) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[CONFIG_KEY]) {
      fn(withDefaults(changes[CONFIG_KEY].newValue as Partial<AppConfig>));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
