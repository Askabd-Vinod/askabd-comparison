/**
 * AskABD S3 Storage Provider
 * 
 * Used in STAGING/PRODUCTION. Stores files in Amazon S3 with KMS encryption.
 * Bucket name and region configured via environment variables.
 * Never exposes bucket internals or credentials.
 *
 * Dependencies: @aws-sdk/client-s3 (added as optional peer — only loaded when
 * STORAGE_PROVIDER=s3). This avoids breaking DEV environments without AWS SDK.
 */

import { Readable } from 'stream';
import { createHash } from 'crypto';
import type { StorageProvider } from './storage-provider.js';

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly bucket: string;
  private readonly region: string;
  private client: any = null;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    this.region = process.env.S3_REGION || 'us-east-1';

    if (!this.bucket) {
      throw new Error('[S3StorageProvider] S3_BUCKET environment variable is required');
    }
  }

  /** Lazy-load AWS SDK to avoid import failure in DEV */
  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    try {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({ region: this.region });
      return this.client;
    } catch (err) {
      throw new Error(`[S3StorageProvider] Failed to load @aws-sdk/client-s3: ${(err as Error).message}. Install with: npm install @aws-sdk/client-s3`);
    }
  }

  /**
   * Validates storage reference — must not attempt path traversal.
   */
  private validateReference(ref: string): string {
    if (ref.includes('..') || ref.startsWith('/') || ref.startsWith('\\')) {
      throw new Error('Invalid storage reference: path traversal detected');
    }
    return ref;
  }

  async save(storageReference: string, stream: Readable): Promise<{ checksum: string; fileSize: number }> {
    const key = this.validateReference(storageReference);
    const s3 = await this.getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    // Buffer the stream to calculate checksum and get size
    const chunks: Buffer[] = [];
    const hash = createHash('sha256');

    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      hash.update(buf);
    }

    const body = Buffer.concat(chunks);
    const checksum = hash.digest('hex');
    const fileSize = body.length;

    await s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ServerSideEncryption: 'aws:kms',
      Metadata: { 'sha256-checksum': checksum },
    }));

    return { checksum, fileSize };
  }

  async exists(storageReference: string): Promise<boolean> {
    try {
      const key = this.validateReference(storageReference);
      const s3 = await this.getClient();
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  async read(storageReference: string): Promise<Readable | null> {
    try {
      const key = this.validateReference(storageReference);
      const s3 = await this.getClient();
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const response = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return response.Body as Readable;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async delete(storageReference: string): Promise<boolean> {
    try {
      const key = this.validateReference(storageReference);
      const s3 = await this.getClient();
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSize(storageReference: string): Promise<number> {
    try {
      const key = this.validateReference(storageReference);
      const s3 = await this.getClient();
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const response = await s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return response.ContentLength ?? 0;
    } catch {
      return 0;
    }
  }
}
