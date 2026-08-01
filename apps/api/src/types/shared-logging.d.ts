declare module '@askabd/shared-logging' {
  export interface LoggerConfig {
    service: string;
    environment?: string;
    version?: string;
    level?: string;
  }

  /** Returns a Pino-compatible logger instance */
  export function createLogger(config: LoggerConfig): any;
}
