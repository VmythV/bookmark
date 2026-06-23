/**
 * Typed message contracts between UI (content/popup/options) and the background
 * service worker. See docs/detailed-design.md §11.
 *
 * Each request message has a `type` discriminant and a matching response type.
 * Use `sendMessage` to get end-to-end type safety on both sides.
 */
import type { PageInfo, ReorgPlan, ReorgScope, SaveRecommendation } from './types';

export interface SaveRequestMsg {
  type: 'SAVE_REQUEST';
  page: PageInfo;
}
export interface SaveRequestRes {
  recommendation: SaveRecommendation;
}

export interface SaveConfirmMsg {
  type: 'SAVE_CONFIRM';
  recommendation: SaveRecommendation;
  page: PageInfo;
  /** Optional user override of the target folder. */
  overrideFolderId?: string;
  overrideNewFolderPath?: string;
}
export interface SaveConfirmRes {
  createdId: string;
}

export interface PingMsg {
  type: 'PING';
}
export interface PingRes {
  ok: true;
}

export interface IndexBuildMsg {
  type: 'INDEX_BUILD';
}
export interface IndexBuildRes {
  embedded: number;
  skipped: number;
  removed: number;
}

export interface IndexStatusMsg {
  type: 'INDEX_STATUS';
}
export interface IndexStatusRes {
  indexed: boolean;
  folderCount: number;
}

export interface BackupNowMsg {
  type: 'BACKUP_NOW';
}
export interface BackupNowRes {
  bytes: number;
}

export interface BackupTestMsg {
  type: 'BACKUP_TEST';
}
export interface BackupTestRes {
  ok: true;
}

export interface BackupImportMsg {
  type: 'BACKUP_IMPORT';
  /** Optional inline HTML (e.g. from a local file); otherwise pull from remote. */
  html?: string;
}
export interface BackupImportRes {
  created: number;
}

export interface ScheduleSyncMsg {
  type: 'SCHEDULE_SYNC';
}
export interface ScheduleSyncRes {
  ok: true;
}

export interface ReorgBuildMsg {
  type: 'REORG_BUILD_PLAN';
  scope: ReorgScope;
}
export interface ReorgBuildRes {
  plan: ReorgPlan;
}

export interface ReorgApplyMsg {
  type: 'REORG_APPLY';
  plan: ReorgPlan;
}
export interface ReorgApplyRes {
  moved: number;
  created: number;
  unsorted: number;
}

/** Union of all request messages the background understands. */
export type RequestMessage =
  | SaveRequestMsg
  | SaveConfirmMsg
  | PingMsg
  | IndexBuildMsg
  | IndexStatusMsg
  | BackupNowMsg
  | BackupTestMsg
  | BackupImportMsg
  | ScheduleSyncMsg
  | ReorgBuildMsg
  | ReorgApplyMsg;

/** Maps each message type to its response shape. */
export interface ResponseMap {
  SAVE_REQUEST: SaveRequestRes;
  SAVE_CONFIRM: SaveConfirmRes;
  PING: PingRes;
  INDEX_BUILD: IndexBuildRes;
  INDEX_STATUS: IndexStatusRes;
  BACKUP_NOW: BackupNowRes;
  BACKUP_TEST: BackupTestRes;
  BACKUP_IMPORT: BackupImportRes;
  SCHEDULE_SYNC: ScheduleSyncRes;
  REORG_BUILD_PLAN: ReorgBuildRes;
  REORG_APPLY: ReorgApplyRes;
}

/**
 * Thin wrapper over chrome.runtime.sendMessage with typing.
 * The background returns `{ ok: true, data }` or `{ ok: false, error }`.
 */
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
