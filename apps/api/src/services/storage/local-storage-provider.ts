/**
 * AskABD Local Filesystem Storage Provider
 * 
 * Used in DEV environment. Stores files in a configurable local directory.
 * Path traversal protection via reference validation.
 */

import { createWriteStream, existsSync, mkdirSync, statSync, createReadStream, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import type { StorageProvider } from './storage-provider.js';

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(root?: string) {
    this.root = root || process.env.DOCUMENT_STORAGE_PATH || join(process.cwd(), 'uploads');
  }

  /**
   * Validates a storage reference to prevent path traversal attacks.
   * References must not contain '..' or absolute paths.
   */
  private validateReference(ref: string): string {
    if (ref.includes('..') || ref.startsWith('/') || ref.startsWith('\\')) {
      throw new Error('Invalid storage reference: path traversal detected');
    }
    const resolved = resolve(this.root, ref);
    if (!resolved.startsWith(resolve(this.root))) {
      throw new Error('Invalid storage reference: path traversal detected');
    }
    return resolved;
  }

  async save(storageReference: string, stream: Readable): Promise<{ checksum: string; fileSize: number }> {
    const filePath = this.validateReference(storageReference);
    const dir = filePath.substring(0, filePath.lastIndexOf('/') >= 0 ? filePath.lastIndexOf('/') : filePath.lastIndexOf('\\'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const hash = createHash('sha256');
    let fileSize = 0;

    const writeStream = createWriteStream(filePath);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        fileSize += chunk.length;
      });
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      stream.on('error', reject);
    });

    return { checksum: hash.digest('hex'), fileSize };
  }

  async exists(storageReference: string): Promise<boolean> {
    try {
      const filePath = this.validateReference(storageReference);
      return existsSync(filePath);
    } catch {
      return false;
    }
  }

  async read(storageReference: string): Promise<Readable | null> {
    try {
      const filePath = this.validateReference(storageReference);
      if (!existsSync(filePath)) return null;
      return createReadStream(filePath);
    } catch {
      return null;
    }
  }

  async delete(storageReference: string): Promise<boolean> {
    try {
      const filePath = this.validateReference(storageReference);
      if (!existsSync(filePath)) return false;
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSize(storageReference: string): Promise<number> {
    try {
      const filePath = this.validateReference(storageReference);
      if (!existsSync(filePath)) return 0;
      return statSync(filePath).size;
    } catch {
      return 0;
    }
  }
}
