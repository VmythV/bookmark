/**
 * Background-side client for the offscreen embedder.
 * Ensures the offscreen document exists, sends embed requests, and correlates
 * asynchronous responses by id. See docs/detailed-design.md §7, §10.
 */
import { getConfig } from '../services/storage';

const OFFSCREEN_PATH = 'offscreen.html';

let creating: Promise<void> | null = null;

/** Create the offscreen document if it isn't already open. */
async function ensureOffscreen(): Promise<void> {
  const contexts: unknown[] = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  if (contexts && contexts.length > 0) return;

  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['WORKERS' as chrome.offscreen.Reason],
      justification: 'Run the local embedding model in a Web Worker.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

let nextId = 1;

interface Pending {
  resolve: (vectors: number[][]) => void;
  reject: (err: Error) => void;
  onProgress?: (payload: unknown) => void;
}
const pending = new Map<number, Pending>();

// Single listener correlating offscreen responses to pending requests.
chrome.runtime.onMessage.addListener(
  (message: { target?: string; id?: number; type?: string; vectors?: number[][]; error?: string; payload?: unknown }) => {
    if (message?.target !== 'embed-response' || message.id == null) return;
    const p = pending.get(message.id);
    if (!p) return;
    if (message.type === 'progress') {
      p.onProgress?.(message.payload);
    } else if (message.type === 'result') {
      pending.delete(message.id);
      p.resolve(message.vectors ?? []);
    } else if (message.type === 'error') {
      pending.delete(message.id);
      p.reject(new Error(message.error ?? 'embed failed'));
    }
  },
);

async function send(
  type: 'embed' | 'warmup',
  texts: string[],
  onProgress?: (payload: unknown) => void,
): Promise<number[][]> {
  await ensureOffscreen();
  const cfg = await getConfig();
  const id = nextId++;
  const result = new Promise<number[][]>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
  });
  await chrome.runtime.sendMessage({
    target: 'offscreen-embed',
    id,
    type,
    texts,
    model: cfg.embedding.model,
  });
  return result;
}

/** Embed a batch of texts → normalized vectors (one per input). */
export function embed(
  texts: string[],
  onProgress?: (payload: unknown) => void,
): Promise<number[][]> {
  return send('embed', texts, onProgress);
}

/** Embed a single text → one normalized vector. */
export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  if (!vec) throw new Error('embedding returned no vector');
  return vec;
}

/** Preload the model (download weights) without embedding anything. */
export function warmup(onProgress?: (payload: unknown) => void): Promise<number[][]> {
  return send('warmup', [], onProgress);
}
