/**
 * AskABD Storage — Provider Factory
 *
 * Selects storage provider based on STORAGE_PROVIDER environment variable:
 * - 'local' (default): filesystem storage (DEV)
 * - 's3': Amazon S3 (STAGING/PRODUCTION)
 *
 * Singleton instance — created once, reused across all services.
 */

export type { StorageProvider, StoredDocument } from './storage-provider.js';
export { LocalStorageProvider } from './local-storage-provider.js';
export { S3StorageProvider } from './s3-storage-provider.js';

import type { StorageProvider } from './storage-provider.js';
import { LocalStorageProvider } from './local-storage-provider.js';

let _storageProvider: StorageProvider | null = null;

/**
 * Returns the configured storage provider singleton.
 * Provider is selected via STORAGE_PROVIDER env var.
 */
export function getStorageProvider(): StorageProvider {
  if (_storageProvider) return _storageProvider;

  const providerType = process.env.STORAGE_PROVIDER || 'local';

  if (providerType === 's3') {
    // Dynamic import to avoid requiring AWS SDK in DEV
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./s3-storage-provider.js');
    _storageProvider = new mod.S3StorageProvider() as StorageProvider;
  } else {
    _storageProvider = new LocalStorageProvider();
  }

  console.log(`[STORAGE] Provider initialized: ${_storageProvider.name}`);
  return _storageProvider;
}

/** Reset provider (for testing) */
export function resetStorageProvider(): void {
  _storageProvider = null;
}
