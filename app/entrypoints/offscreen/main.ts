/**
 * Offscreen document: hosts the embedder Web Worker and bridges messages
 * between the background service worker and the worker.
 * See docs/detailed-design.md §7, §10.
 *
 * Background → offscreen: chrome.runtime message { target:'offscreen-embed', id, type, texts?, model }
 * offscreen → background: chrome.runtime message { target:'embed-response', id, ... }
 */
import EmbedderWorker from '@/lib/rag/embedderWorker?worker';

const worker = new EmbedderWorker();

// Forward worker output to the background.
worker.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { id: number; type: string };
  void chrome.runtime.sendMessage({ target: 'embed-response', ...data });
});

interface EmbedRequest {
  target: 'offscreen-embed';
  id: number;
  type: 'embed' | 'warmup';
  texts?: string[];
  model: string;
}

chrome.runtime.onMessage.addListener((message: EmbedRequest) => {
  if (message?.target !== 'offscreen-embed') return;
  worker.postMessage({
    id: message.id,
    type: message.type,
    texts: message.texts,
    model: message.model,
  });
  // No response via sendResponse; results come back asynchronously as
  // 'embed-response' messages.
});
