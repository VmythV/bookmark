/**
 * WebDAV backup adapter: PUT to upload, GET to fetch, basic auth.
 * See docs/detailed-design.md §9.
 *
 * `url` is the full file URL (e.g. https://dav.example.com/bookmarks.html).
 * The server must allow the extension origin via CORS for PUT/GET.
 */
import type { BackupAdapter } from './adapter';
import type { BackupConfig } from '../shared/types';

export class WebDavAdapter implements BackupAdapter {
  constructor(private cfg: NonNullable<BackupConfig['webdav']>) {}

  private headers(extra?: Record<string, string>): Headers {
    const h = new Headers(extra);
    if (this.cfg.username || this.cfg.password) {
      h.set('Authorization', 'Basic ' + btoa(`${this.cfg.username}:${this.cfg.password}`));
    }
    return h;
  }

  async put(content: string): Promise<void> {
    const res = await fetch(this.cfg.url, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'text/html; charset=utf-8' }),
      body: content,
    });
    if (!res.ok) throw new Error(`WebDAV PUT failed: HTTP ${res.status}`);
  }

  async get(): Promise<string | null> {
    const res = await fetch(this.cfg.url, {
      method: 'GET',
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`WebDAV GET failed: HTTP ${res.status}`);
    return res.text();
  }

  async test(): Promise<void> {
    // HEAD if supported; fall back to GET. A 404 is fine (no snapshot yet).
    const res = await fetch(this.cfg.url, {
      method: 'HEAD',
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`WebDAV test failed: HTTP ${res.status}`);
    }
  }
}
