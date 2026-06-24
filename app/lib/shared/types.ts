/**
 * Core data models. See docs/detailed-design.md §4 (kept aligned across versions).
 */

/** A native chrome.bookmarks node (mirror). */
export interface BookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  /** undefined => folder */
  url?: string;
  index?: number;
  children?: BookmarkNode[];
}

/** Information captured from the current page when saving. */
export interface PageInfo {
  url: string;
  title: string;
  selectionText?: string;
  description?: string;
}

/** A candidate folder presented to the user for a recommendation. */
export interface FolderCandidate {
  id: string;
  /** Full path, e.g. "Dev/Rust". */
  path: string;
}

/** A recommendation produced for the save flow. */
export interface FolderRecommendation {
  folderId: string;
  /** 0..1 confidence from the ranker (vector score if available, else lexical). */
  confidence: number;
  /** Component scores for transparency / debugging. */
  scores: {
    behavior: number;
    domain: number;
    lexical: number;
    vector: number;
    prefer: number;
  };
  reason: string;
}

/** A bookmark in our own IndexedDB store (mirror + extras). */
export interface StoredBookmark {
  /** chrome.bookmarks id. */
  id: string;
  url: string;
  title: string;
  /** chrome bookmark parent id. */
  folderId: string;
  /** chrome bookmark folder path, e.g. "Dev/Rust". */
  folderPath: string;
  tags: string[];
  /** Optional cloud embedding (unit-normalized). null when not yet embedded. */
  embedding: number[] | null;
  /** Hash of the title+url+folder path; if unchanged, embedding is reused. */
  embeddingTextHash: string | null;
  /** Times the user picked this bookmark from search results. */
  useCount: number;
  /** epoch ms */
  lastUsed: number | null;
  savedAt: number;
  /** Whether the user explicitly chose this folder (bumps prefer score). */
  preferFolder: boolean;
}

/** Weights for the three-or-four-lane ranker. */
export interface RankerWeights {
  behavior: number;
  domain: number;
  lexical: number;
  vector: number;
  prefer: number;
}

/** Configuration for an OpenAI-compatible embedding endpoint. */
export interface EmbeddingConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  /** e.g. 'text-embedding-3-small', 'text-embedding-v3' (Qwen), multilingual-e5-large via OpenAI gateway. */
  model: string;
}

/** Configuration for an OpenAI-compatible chat endpoint. */
export interface ChatConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  /** e.g. 'gpt-4o-mini', 'deepseek-chat', 'qwen-plus' */
  model: string;
}

/** Backup configuration (WebDAV / S3 one-way overwrite snapshot). */
export interface BackupConfig {
  target: 'none' | 'webdav' | 's3';
  schedule: 'off' | 'daily' | 'weekly';
  webdav?: { url: string; username: string; password: string };
  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    key: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface AppConfig {
  embedding: EmbeddingConfig;
  chat: ChatConfig;
  recommend: {
    weights: RankerWeights;
    topK: number;
  };
  search: {
    /** 'lexical' (no vector) or 'hybrid' (vector + lexical with RRF). */
    mode: 'lexical' | 'hybrid';
    topK: number;
  };
  backup: BackupConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  embedding: { enabled: false, endpoint: '', apiKey: '', model: '' },
  chat: { enabled: false, endpoint: '', apiKey: '', model: '' },
  recommend: {
    weights: { behavior: 0.1, domain: 0.25, lexical: 0.2, vector: 0.4, prefer: 0.05 },
    topK: 5,
  },
  search: { mode: 'lexical', topK: 50 },
  backup: { target: 'none', schedule: 'off' },
};

export const NO_EMBEDDING_WEIGHTS: RankerWeights = {
  behavior: 0.2,
  domain: 0.4,
  lexical: 0.3,
  vector: 0,
  prefer: 0.1,
};