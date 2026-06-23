/**
 * Core data models. See docs/detailed-design.md §4.
 */

/** A native bookmark node, mirrored from chrome.bookmarks. */
export interface BookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  /** undefined => this node is a folder */
  url?: string;
  index?: number;
  children?: BookmarkNode[];
}

/** Information captured from the current page when saving. */
export interface PageInfo {
  url: string;
  title: string;
  /** Selected text, if any. */
  selectionText?: string;
  /** <meta name="description"> or og:description. */
  description?: string;
}

/** A vector index entry persisted in IndexedDB. */
export interface VectorEntry {
  key: string; // bookmark/folder id
  kind: 'folder' | 'bookmark';
  vector: number[]; // normalized embedding (cosine == dot product)
  textHash: string; // hash of the source text, to skip re-embedding unchanged nodes
  updatedAt: number; // epoch ms, stamped by the caller
}

/** A candidate folder presented to the LLM during re-ranking. */
export interface FolderCandidate {
  id: string;
  /** Full path, e.g. "Dev/Rust". */
  path: string;
  /** A few sample child titles to give the LLM context. */
  sampleTitles: string[];
}

/** Structured recommendation returned by the save flow (LLM or fallback). */
export interface SaveRecommendation {
  action: 'use_existing' | 'create_new';
  /** Set when action === 'use_existing'. */
  folderId?: string;
  /** Set when action === 'create_new', e.g. "Dev/Rust". */
  newFolderPath?: string;
  confidence: number; // 0..1
  reason: string;
}

/** Persisted configuration (storage.local). Plaintext this iteration, local-only. */
export interface AppConfig {
  llm: {
    /** e.g. https://api.example.com/v1 */
    endpoint: string;
    apiKey: string;
    model: string;
  };
  embedding: {
    /** default 'Xenova/multilingual-e5-small' */
    model: string;
  };
  recall: {
    /** default 10 */
    topK: number;
  };
  backup: BackupConfig;
}

export interface BackupConfig {
  target: 'none' | 'webdav' | 's3';
  schedule: 'off' | 'daily' | 'weekly';
  webdav?: {
    url: string;
    username: string;
    password: string;
  };
  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    key: string;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: { endpoint: '', apiKey: '', model: '' },
  embedding: { model: 'Xenova/multilingual-e5-small' },
  recall: { topK: 10 },
  backup: { target: 'none', schedule: 'off' },
};
