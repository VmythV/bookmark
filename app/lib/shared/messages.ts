/**
 * Typed message contracts between UI (content/popup/options/search/sidebar) and
 * the background service worker. See docs/detailed-design.md §11.
 */
import type {
  PageInfo,
  FolderRecommendation,
  StoredBookmark,
  BackupConfig,
} from './types';

export type { PageInfo, FolderRecommendation, StoredBookmark, BackupConfig };

// ───── Save ─────

export interface SaveRequestMsg {
  type: 'SAVE_REQUEST';
  page: PageInfo;
}
export interface SaveRequestRes {
  /** Top-K ranked folder candidates for the user to choose from. */
  recommendations: FolderRecommendation[];
  /** ai-generated tag suggestions (empty if no embedding provider). */
  suggestedTags: string[];
}

export interface SaveConfirmMsg {
  type: 'SAVE_CONFIRM';
  page: PageInfo;
  folderId: string;
  tags: string[];
}
export interface SaveConfirmRes {
  id: string;
}

// ───── Search ─────

export interface SearchMsg {
  type: 'SEARCH';
  query: string;
  topK?: number;
}
export interface SearchRes {
  results: StoredBookmark[];
}

// ───── Config ─────

export interface PingMsg {
  type: 'PING';
}
export interface PingRes {
  ok: true;
}

export interface GetConfigMsg {
  type: 'GET_CONFIG';
}
export interface GetConfigRes {
  config: import('./types').AppConfig;
}

export interface SetConfigMsg {
  type: 'SET_CONFIG';
  patch: Partial<import('./types').AppConfig>;
}
export interface SetConfigRes {
  config: import('./types').AppConfig;
}

export interface TestProviderMsg {
  type: 'TEST_PROVIDER';
  /** Which provider to test. */
  which: 'embedding' | 'chat';
}
export interface TestProviderRes {
  ok: boolean;
  /** Present when ok=false. */
  error?: string;
}

export interface ListFoldersMsg {
  type: 'LIST_FOLDERS';
}
export interface ListFoldersRes {
  folders: Array<{ id: string; path: string }>;
}

export interface EnsureFolderMsg {
  type: 'ENSURE_FOLDER';
  /** Slash-separated path, e.g. "Dev/Rust". */
  path: string;
}
export interface EnsureFolderRes {
  folderId: string;
}

// ───── Union / map ─────

export type RequestMessage =
  | SaveRequestMsg
  | SaveConfirmMsg
  | SearchMsg
  | PingMsg
  | GetConfigMsg
  | SetConfigMsg
  | TestProviderMsg
  | ListFoldersMsg
  | EnsureFolderMsg;

export interface ResponseMap {
  SAVE_REQUEST: SaveRequestRes;
  SAVE_CONFIRM: SaveConfirmRes;
  SEARCH: SearchRes;
  PING: PingRes;
  GET_CONFIG: GetConfigRes;
  SET_CONFIG: SetConfigRes;
  TEST_PROVIDER: TestProviderRes;
  LIST_FOLDERS: ListFoldersRes;
  ENSURE_FOLDER: EnsureFolderRes;
}

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function sendMessage<M extends RequestMessage>(
  message: M,
): Promise<ResponseMap[M['type']]> {
  const res = (await chrome.runtime.sendMessage(message)) as Envelope<
    ResponseMap[M['type']]
  >;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}