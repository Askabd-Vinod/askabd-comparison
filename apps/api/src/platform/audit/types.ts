/**
 * AskABD Platform — Audit Engine Types
 *
 * Reusable audit trail types for automatic capture of:
 * Who, When, What, Where, Why, and the Result.
 *
 * Designed for extraction to @askabd/shared-audit.
 */

/**
 * Complete audit event record.
 */
export interface AuditEntry {
  /** Unique audit event ID */
  readonly id: string;
  /** ISO timestamp of the event */
  readonly timestamp: string;

  // WHO
  /** User who performed the action */
  readonly userId: string;
  /** Organization/tenant context */
  readonly tenantId: string;
  /** Session ID if available */
  readonly sessionId?: string;
  /** Client IP address */
  readonly ip?: string;
  /** User agent / browser */
  readonly userAgent?: string;

  // WHAT
  /** Business operation name (e.g., 'Category.Create') */
  readonly operation: string;
  /** Resource type (e.g., 'category', 'product') */
  readonly resource: string;
  /** Resource ID being acted upon */
  readonly resourceId?: string;
  /** HTTP method */
  readonly method?: string;
  /** API path */
  readonly path?: string;

  // CONTEXT
  /** Correlation ID for distributed tracing */
  readonly correlationId?: string;
  /** Request ID */
  readonly requestId?: string;
  /** Service that generated the event */
  readonly service: string;
  /** Module within the service */
  readonly module?: string;
  /** Repository identifier */
  readonly repository?: string;

  // BEFORE/AFTER
  /** State before the operation (for updates/deletes) */
  readonly before?: Record<string, unknown>;
  /** State after the operation (for creates/updates) */
  readonly after?: Record<string, unknown>;
  /** Fields that changed */
  readonly changedFields?: readonly string[];

  // RESULT
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Duration in milliseconds */
  readonly durationMs?: number;
  /** Error details if failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };

  // CLASSIFICATION
  /** Severity: info, warning, critical */
  readonly severity: 'info' | 'warning' | 'critical';
  /** Category for filtering */
  readonly category: 'data' | 'auth' | 'admin' | 'system' | 'security';
}

/**
 * Audit configuration.
 */
export interface AuditConfig {
  /** Service name for audit entries */
  service: string;
  /** Repository name */
  repository?: string;
  /** Whether to capture request/response bodies */
  capturePayloads: boolean;
  /** Maximum payload size to capture (bytes) */
  maxPayloadSize: number;
  /** Operations to exclude from auditing */
  excludeOperations?: readonly string[];
  /** Paths to exclude from auditing */
  excludePaths?: readonly string[];
}

/**
 * Audit sink — where audit entries are sent.
 * Default: structured log. Can be extended to database, queue, etc.
 */
export interface AuditSink {
  write(entry: AuditEntry): void | Promise<void>;
}
