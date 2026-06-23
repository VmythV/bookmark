/**
 * Vector store: IndexedDB persistence + in-memory cosine KNN.
 * See docs/detailed-design.md §3, §7.
 *
 * Vectors are stored normalized, so cosine similarity == dot product. For the
 * bookmark scale this targets (hundreds–thousands of folders), an exact
 * brute-force KNN over normalized vectors is fast enough and avoids pulling in a
 * WASM HNSW dependency. The `query` interface is kept generic so it can be
 * swapped for an approximate HNSW index later without touching callers.
 */
import type { VectorEntry } from '../shared/types';

const DB_NAME = 'smart-bookmark';
const DB_VERSION = 1;
const STORE = 'vectors';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Insert or update one entry. */
export async function upsert(entry: VectorEntry): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').put(entry));
}

/** Insert or update many entries in a single transaction. */
export async function upsertMany(entries: VectorEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  const store = tx(db, 'readwrite');
  await Promise.all(entries.map((e) => req(store.put(e))));
}

/** Remove an entry by key. No-op if absent. */
export async function remove(key: string): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').delete(key));
}

/** Read one entry, or undefined. */
export async function get(key: string): Promise<VectorEntry | undefined> {
  const db = await openDb();
  return req<VectorEntry | undefined>(tx(db, 'readonly').get(key));
}

/** Read all entries, optionally filtered by kind. */
export async function getAll(
  kind?: VectorEntry['kind'],
): Promise<VectorEntry[]> {
  const db = await openDb();
  const all = await req<VectorEntry[]>(tx(db, 'readonly').getAll());
  return kind ? all.filter((e) => e.kind === kind) : all;
}

/** Number of stored entries (optionally by kind). */
export async function count(kind?: VectorEntry['kind']): Promise<number> {
  return (await getAll(kind)).length;
}

/** Wipe the whole store (used by "rebuild index"). */
export async function clear(): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').clear());
}

export interface QueryHit {
  key: string;
  score: number; // cosine similarity, higher is better
}

/**
 * Top-K nearest neighbors by cosine similarity against entries of `kind`.
 * `queryVector` must be normalized (the embedder normalizes its output).
 */
export async function query(
  queryVector: number[],
  k: number,
  kind: VectorEntry['kind'] = 'folder',
): Promise<QueryHit[]> {
  const entries = await getAll(kind);
  const hits: QueryHit[] = entries.map((e) => ({
    key: e.key,
    score: dot(queryVector, e.vector),
  }));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Promisify an IDBRequest. */
function req<T>(r: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}
