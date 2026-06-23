/**
 * Cooperative cancellation for long background tasks (index build, reorg).
 * The UI requests cancellation via a message; long loops poll `isCancelled`
 * and bail out with a CancelledError. See docs/detailed-design.md §10.
 */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

let cancelRequested = false;

/** Request cancellation of the currently running task. */
export function requestCancel(): void {
  cancelRequested = true;
}

/** Clear the cancel flag at the start of a new task. */
export function resetCancel(): void {
  cancelRequested = false;
}

/** True if cancellation has been requested. */
export function isCancelled(): boolean {
  return cancelRequested;
}

/** Throw if cancellation was requested. Call at loop boundaries. */
export function throwIfCancelled(): void {
  if (cancelRequested) throw new CancelledError();
}
