/**
 * AskABD Storage Provider Interface
 * 
 * Abstraction layer for document storage. Implementations:
 * - LocalStorageProvider: filesystem-based (DEV)
 * - S3StorageProvider: Amazon S3 (STAGING/PRODUCTION)
 *
 * Selection via STORAGE_PROVIDER environment variable.
 * Never exposes internal paths or credentials.
 */

import { Readable } from 'stream';

export interface StoredDocument {
  storageReference: string;
  checksum: string;
  fileSize: number;
}

export interface StorageProvider {
  /** Provider name for logging/diagnostics */
  readonly name: string;

  /** Save a file from a readable stream. Returns storage reference + checksum. */
  save(storageReference: string, stream: Readable): Promise<{ checksum: string; fileSize: number }>;

  /** Check if a stored document exists */
  exists(storageReference: string): Promise<boolean>;

  /** Get a readable stream for a stored document */
  read(storageReference: string): Promise<Readable | null>;

  /** Delete a stored document */
  delete(storageReference: string): Promise<boolean>;

  /** Get file size of stored document */
  getSize(storageReference: string): Promise<number>;
}
