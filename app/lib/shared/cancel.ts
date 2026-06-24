/**
 * Cooperative cancellation for long-running background tasks (reorg analyze /
 * apply). A token is scoped to one run — NOT a global flag — so a long-lived
 * MV3 service worker can run sequential tasks without cross-run races.
 *
 * Loops call throwIfCancelled(token) at their boundaries; the port handler sets
 * token.cancelled on disconnect or an explicit cancel message.
 */

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export interface CancelToken {
  cancelled: boolean;
}

export function newToken(): CancelToken {
  return { cancelled: false };
}

export function throwIfCancelled(token: CancelToken | undefined): void {
  if (token?.cancelled) throw new CancelledError();
}
