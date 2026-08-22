/**
 * AskABD Document Storage Service
 * Handles real file persistence. Development: filesystem. Production: object storage (S3).
 * Never exposes internal paths. Never stores binary in lifecycle/audit records.
 *
 * Uses StorageProvider abstraction:
 * - DEV: LocalStorageProvider (filesystem)
 * - STAGING/PRODUCTION: S3StorageProvider (Amazon S3 + KMS)
 *
 * Selection via STORAGE_PROVIDER environment variable.
 */

import { Readable } from 'stream';
import { getStorageProvider } from './storage/index.js';

export interface StoredDocument {
  storageReference: string;
  checksum: string;
  fileSize: number;
}

export class DocumentStorageService {
  private get provider() {
    return getStorageProvider();
  }

  /**
   * Save a file from a readable stream. Returns storage reference + checksum.
   */
  async save(clientId: string, serviceId: string, requirementKey: string, fileName: string, version: number, stream: Readable): Promise<StoredDocument> {
    // Storage reference is a logical path — never the filesystem absolute path
    const storageReference = `${clientId}/${serviceId}/${requirementKey}/v${version}/${fileName}`;
    const { checksum, fileSize } = await this.provider.save(storageReference, stream);
    return { storageReference, checksum, fileSize };
  }

  /**
   * Save a discovery-source document (Universal Discovery document
   * ingestion, migration 045) — a genuinely different logical path shape
   * from the onboarding-requirement documents above (no serviceId/
   * requirementKey), but the SAME real storage provider underneath. Reuses
   * this class rather than a second document-storage service.
   */
  async saveDiscoveryDocument(clientId: string, sourceId: string, fileName: string, stream: Readable): Promise<StoredDocument> {
    const storageReference = `discovery/${clientId}/${sourceId}/${fileName}`;
    const { checksum, fileSize } = await this.provider.save(storageReference, stream);
    return { storageReference, checksum, fileSize };
  }

  /**
   * Check if a stored document exists
   */
  exists(storageReference: string): boolean | Promise<boolean> {
    return this.provider.exists(storageReference);
  }

  /**
   * Get a readable stream for a stored document
   */
  read(storageReference: string): Readable | null | Promise<Readable | null> {
    return this.provider.read(storageReference);
  }

  /**
   * Delete a stored document
   */
  delete(storageReference: string): boolean | Promise<boolean> {
    return this.provider.delete(storageReference);
  }

  /**
   * Get file size of stored document
   */
  getSize(storageReference: string): number | Promise<number> {
    return this.provider.getSize(storageReference);
  }
}
