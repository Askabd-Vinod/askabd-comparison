/**
 * AskABD Platform — Foundation Module
 *
 * Reusable platform capabilities that every AskABD service inherits.
 * Each sub-module is designed for extraction to a shared package.
 */

export * from './rbac/index.js';
export * from './audit/index.js';
export * from './diagnostics/index.js';
export * from './health/index.js';
export * from './monitoring/index.js';
export * from './feature-flags/index.js';
export * from './config-validator/index.js';
export * from './service-utils/index.js';
