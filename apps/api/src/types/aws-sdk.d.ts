/**
 * Type declarations for optional AWS SDK dependencies.
 * These are loaded dynamically at runtime only when STORAGE_PROVIDER=s3 or EMAIL_PROVIDER=ses.
 * In DEV, these modules are not installed — dynamic import handles the absence gracefully.
 */

declare module '@aws-sdk/client-s3' {
  export class S3Client {
    constructor(config: { region: string });
    send(command: any): Promise<any>;
  }
  export class PutObjectCommand {
    constructor(input: any);
  }
  export class GetObjectCommand {
    constructor(input: any);
  }
  export class HeadObjectCommand {
    constructor(input: any);
  }
  export class DeleteObjectCommand {
    constructor(input: any);
  }
}

declare module '@aws-sdk/client-sesv2' {
  export class SESv2Client {
    constructor(config: { region: string });
    send(command: any): Promise<any>;
  }
  export class SendEmailCommand {
    constructor(input: any);
  }
}
