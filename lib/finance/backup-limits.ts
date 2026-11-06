/* Backup restore limits, shared by the upload form (client) and lib/finance/backup-service.ts. */

/** The upload, gzipped by the browser when it can. Server Actions accept 3 MB (next.config.ts). */
export const MAX_UPLOAD_BYTES = 2_500_000;
/** The JSON once unzipped. */
export const MAX_BACKUP_BYTES = 25_000_000;
