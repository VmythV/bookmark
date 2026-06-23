/**
 * S3 (or S3-compatible) backup adapter using aws4fetch for SigV4 signing in the
 * browser. See docs/detailed-design.md §9.
 *
 * The bucket's CORS must allow the extension origin for PUT/GET. `endpoint` is
 * the S3 endpoint base (e.g. https://s3.us-east-1.amazonaws.com or a MinIO/R2
 * endpoint); the object URL is `${endpoint}/${bucket}/${key}`.
 */
import { AwsClient } from 'aws4fetch';
import type { BackupAdapter } from './adapter';
import type { BackupConfig } from '../shared/types';

export class S3Adapter implements BackupAdapter {
  private aws: AwsClient;

  constructor(private cfg: NonNullable<BackupConfig['s3']>) {
    this.aws = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 's3',
    });
  }

  private objectUrl(): string {
    const base = this.cfg.endpoint.replace(/\/+$/, '');
    const key = this.cfg.key.replace(/^\/+/, '');
    return `${base}/${this.cfg.bucket}/${key}`;
  }

  async put(content: string): Promise<void> {
    const res = await this.aws.fetch(this.objectUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: content,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`S3 PUT failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
  }

  async get(): Promise<string | null> {
    const res = await this.aws.fetch(this.objectUrl(), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET failed: HTTP ${res.status}`);
    return res.text();
  }

  async test(): Promise<void> {
    const res = await this.aws.fetch(this.objectUrl(), { method: 'HEAD' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 test failed: HTTP ${res.status}`);
    }
  }
}
