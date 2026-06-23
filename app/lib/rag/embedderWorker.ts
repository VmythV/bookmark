/**
 * Embedder Web Worker. Runs inside the offscreen document.
 * Loads a Transformers.js feature-extraction pipeline (lazy singleton) and
 * returns normalized embeddings. See docs/detailed-design.md §7, §10.
 *
 * Protocol (postMessage):
 *   in : { id, type: 'embed', texts: string[], model: string }
 *   in : { id, type: 'warmup', model: string }
 *   out: { id, type: 'progress', payload }          // model download progress
 *   out: { id, type: 'result', vectors: number[][] }
 *   out: { id, type: 'error', error: string }
 */
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

// Download weights from the HuggingFace CDN at runtime; do not look for local models.
env.allowLocalModels = false;

let current: { model: string; pipe: Promise<FeatureExtractionPipeline> } | null =
  null;

function getPipeline(model: string, id: number): Promise<FeatureExtractionPipeline> {
  if (current?.model !== model) {
    current = {
      model,
      pipe: pipeline('feature-extraction', model, {
        progress_callback: (payload: unknown) => {
          self.postMessage({ id, type: 'progress', payload });
        },
      }) as Promise<FeatureExtractionPipeline>,
    };
  }
  return current.pipe;
}

interface InMsg {
  id: number;
  type: 'embed' | 'warmup';
  texts?: string[];
  model: string;
}

self.addEventListener('message', (event: MessageEvent<InMsg>) => {
  void handle(event.data);
});

async function handle(msg: InMsg): Promise<void> {
  try {
    const pipe = await getPipeline(msg.model, msg.id);
    if (msg.type === 'warmup') {
      self.postMessage({ id: msg.id, type: 'result', vectors: [] });
      return;
    }
    const texts = msg.texts ?? [];
    if (texts.length === 0) {
      self.postMessage({ id: msg.id, type: 'result', vectors: [] });
      return;
    }
    // e5 models expect a task prefix; "passage:" for documents works well for
    // both indexing and short-query use at this scale.
    const prefixed = texts.map((t) => `passage: ${t}`);
    const output = await pipe(prefixed, { pooling: 'mean', normalize: true });
    const vectors = output.tolist() as number[][];
    self.postMessage({ id: msg.id, type: 'result', vectors });
  } catch (err) {
    self.postMessage({
      id: msg.id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
