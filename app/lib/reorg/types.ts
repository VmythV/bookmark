/**
 * Types for the bookmark reorganization ("Organize") flow.
 * See docs plan: relocate misfiled bookmarks into existing folders + cluster
 * homeless ones into proposed new folders.
 */

/** A proposed move of one bookmark into a better existing folder. */
export interface RelocateMove {
  id: string;
  title: string;
  url: string;
  host: string;
  fromFolderId: string;
  fromPath: string;
  toFolderId: string;
  toPath: string;
  /** Target folder confidence, 0..1. */
  confidence: number;
  /** Current folder confidence, 0..1 (for margin transparency). */
  currentScore: number;
  reason: string;
}

/** A proposed brand-new folder gathering a cluster of homeless bookmarks. */
export interface NewFolderProposal {
  /** Client-stable key for checkbox / name-edit state. */
  tempId: string;
  /** Suggested name (editable in the UI). */
  name: string;
  /** Parent folder the new folder is created under. */
  parentId: string;
  parentPath: string;
  memberIds: string[];
  /** Up to ~5 representative titles for display. */
  sampleTitles: string[];
  /** Shared keywords that drove the (fallback) name. */
  sharedTokens: string[];
}

export interface ReorgPlan {
  moves: RelocateMove[];
  newFolders: NewFolderProposal[];
  stats: {
    total: number;
    embedded: number;
    relocated: number;
    homeless: number;
    clustered: number;
  };
  generatedAt: number;
  /** False when no embedding provider was available (degraded plan). */
  embeddingUsed: boolean;
}

export interface ApplyReorgInput {
  moves: Array<{ id: string; toFolderId: string }>;
  newFolders: Array<{ name: string; parentId: string; memberIds: string[] }>;
}

export interface ApplyReorgResult {
  foldersCreated: number;
  bookmarksMoved: number;
  skipped: number;
}

export type ReorgPhase =
  | 'sync'
  | 'embedding'
  | 'relocate'
  | 'cluster'
  | 'naming'
  | 'done';

export interface ReorgProgress {
  phase: ReorgPhase;
  done: number;
  total: number;
  message: string;
}
