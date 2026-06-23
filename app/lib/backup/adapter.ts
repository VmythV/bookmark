/**
 * Common interface for one-way backup targets. See docs/detailed-design.md §9.
 *
 * Backup is a full-overwrite snapshot: `put` replaces the remote content, `get`
 * fetches it back for import, `test` verifies connectivity/credentials.
 */
export interface BackupAdapter {
  /** Upload (overwrite) the snapshot. */
  put(content: string): Promise<void>;
  /** Fetch the snapshot back, or null if it doesn't exist yet. */
  get(): Promise<string | null>;
  /** Verify the target is reachable and credentials work. */
  test(): Promise<void>;
}
