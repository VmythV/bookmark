/**
 * Local IndexedDB store for the extension's own bookmark metadata. The native
 * chrome.bookmarks tree remains the source of truth for *positions* (folder
 * hierarchy). This store augments each bookmark with tags, embedding, usage
 * stats, and a prefer flag. See docs/detailed-design.md §3.
 */
import type { StoredBookmark } from '../shared/types';

const DB_NAME = 'smart-bookmark-v2';
const DB_VERSION = 1;
const STORE = 'bookmarks';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function req<T>(r: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

export async function get(id: string): Promise<StoredBookmark | undefined> {
  const db = await openDb();
  return req<StoredBookmark | undefined>(tx(db, 'readonly').get(id));
}

export async function getAll(): Promise<StoredBookmark[]> {
  const db = await openDb();
  return req<StoredBookmark[]>(tx(db, 'readonly').getAll());
}

export async function put(b: StoredBookmark): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').put(b));
}

export async function putMany(bs: StoredBookmark[]): Promise<void> {
  if (bs.length === 0) return;
  const db = await openDb();
  const store = tx(db, 'readwrite');
  await Promise.all(bs.map((b) => req(store.put(b))));
}

export async function remove(id: string): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').delete(id));
}

export async function clear(): Promise<void> {
  const db = await openDb();
  await req(tx(db, 'readwrite').clear());
}