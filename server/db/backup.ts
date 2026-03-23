/**
 * Database Backup & Restore Service
 * -----------------------------------
 * Provides programmatic wrappers around `pg_dump` / `pg_restore` so the ATS
 * can create, list, and restore PostgreSQL backups at any time — via the REST
 * API or the CLI.
 *
 * Backup files are written to the directory defined by the `DB_BACKUP_DIR`
 * environment variable (default: `./backups`).  Each file is named with an
 * ISO-8601 timestamp so the set is chronologically ordered and human-readable.
 *
 * Scheduled (automatic) backups are controlled by:
 *   DB_BACKUP_SCHEDULE_HOURS  – interval in hours between automatic backups
 *                               (default: 24; set to 0 to disable).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Directory where backup files are stored. */
export const BACKUP_DIR = path.resolve(
  process.env.DB_BACKUP_DIR || path.join(process.cwd(), 'backups')
);

/** Hours between automatic scheduled backups (0 = disabled). */
const SCHEDULE_HOURS = parseFloat(process.env.DB_BACKUP_SCHEDULE_HOURS || '24');

// Keep at most this many backup files; older ones are pruned automatically.
const MAX_BACKUPS = parseInt(process.env.DB_BACKUP_MAX_COUNT || '7');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a pg_dump / pg_restore compatible `libpq` connection-string env. */
function buildPgEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: process.env.DB_HOST || 'localhost',
    PGPORT: process.env.DB_PORT || '5432',
    PGDATABASE: process.env.DB_NAME || 'ats_test',
    PGUSER: process.env.DB_USER || 'postgres',
    PGPASSWORD: process.env.DB_PASSWORD || 'postgres',
  };
}

/** Ensure the backup directory exists. */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[backup] Created backup directory: ${BACKUP_DIR}`);
  }
}

/**
 * Returns an ISO-8601 timestamp suitable for use in a file name.
 * Example: `2024-06-15T14-30-00`
 */
function timestampForFilename(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BackupMetadata {
  /** File name (without directory). */
  filename: string;
  /** Absolute path to the backup file. */
  filepath: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Creation time of the file (ISO-8601 string). */
  createdAt: string;
}

/**
 * Creates a compressed custom-format pg_dump backup.
 *
 * Returns metadata about the file that was written.
 */
export async function createBackup(): Promise<BackupMetadata> {
  ensureBackupDir();

  const filename = `backup-${timestampForFilename()}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log(`[backup] Starting backup → ${filepath}`);

  await execFileAsync(
    'pg_dump',
    [
      '--format=custom', // compressed, restoreable with pg_restore
      '--no-password',
      `--file=${filepath}`,
    ],
    { env: buildPgEnv() }
  );

  const stats = fs.statSync(filepath);

  console.log(
    `[backup] Backup complete: ${filename} (${stats.size} bytes)`
  );

  await pruneOldBackups();

  return {
    filename,
    filepath,
    sizeBytes: stats.size,
    createdAt: stats.birthtime.toISOString(),
  };
}

/**
 * Lists all backup files in the backup directory, newest first.
 */
export function listBackups(): BackupMetadata[] {
  ensureBackupDir();

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.dump'))
    .map((filename) => {
      const filepath = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(filepath);
      return {
        filename,
        filepath,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Restores the database from a backup file.
 *
 * **Warning**: This performs a destructive restore that drops and recreates
 * all objects in the target database.  Only admins should be allowed to call
 * this endpoint.
 *
 * @param filename  Name of the file inside `BACKUP_DIR` to restore from.
 */
export async function restoreBackup(filename: string): Promise<void> {
  // Validate the filename to prevent path traversal attacks.
  const safeFilename = path.basename(filename);
  if (!safeFilename.startsWith('backup-') || !safeFilename.endsWith('.dump')) {
    throw new Error(
      `[backup] Invalid backup filename: "${filename}". ` +
        'Filename must match the pattern backup-<timestamp>.dump'
    );
  }

  const filepath = path.join(BACKUP_DIR, safeFilename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`[backup] Backup file not found: ${safeFilename}`);
  }

  console.log(`[backup] Starting restore from ${filepath}`);

  await execFileAsync(
    'pg_restore',
    [
      '--no-password',
      '--clean', // drop objects before recreating
      '--if-exists', // suppress errors for objects that do not exist yet
      '--no-owner', // skip ownership assignments (helpful in CI/staging)
      '--no-privileges', // skip GRANT/REVOKE
      `--dbname=${process.env.DB_NAME || 'ats_test'}`,
      filepath,
    ],
    { env: buildPgEnv() }
  );

  console.log(`[backup] Restore complete from ${safeFilename}`);
}

/**
 * Removes backup files that exceed `MAX_BACKUPS`, keeping the most recent
 * ones.
 */
async function pruneOldBackups(): Promise<void> {
  const backups = listBackups(); // newest first
  const toDelete = backups.slice(MAX_BACKUPS);

  for (const backup of toDelete) {
    fs.unlinkSync(backup.filepath);
    console.log(`[backup] Pruned old backup: ${backup.filename}`);
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let _scheduleTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the automatic backup scheduler.
 *
 * The first backup runs immediately; subsequent backups run every
 * `DB_BACKUP_SCHEDULE_HOURS` hours.  If `SCHEDULE_HOURS` is 0 the scheduler
 * is disabled.
 */
export function startBackupScheduler(): void {
  if (SCHEDULE_HOURS <= 0) {
    console.log('[backup] Scheduled backups disabled (DB_BACKUP_SCHEDULE_HOURS=0)');
    return;
  }

  const intervalMs = SCHEDULE_HOURS * 60 * 60 * 1000;
  console.log(
    `[backup] Scheduled backups enabled — interval: ${SCHEDULE_HOURS}h`
  );

  const runBackup = () => {
    createBackup().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[backup] Scheduled backup failed: ${message}`);
    });
  };

  // Run once immediately, then on the regular interval.
  runBackup();
  _scheduleTimer = setInterval(runBackup, intervalMs);
}

/**
 * Stops the automatic backup scheduler.  Safe to call even if the scheduler
 * was never started.
 */
export function stopBackupScheduler(): void {
  if (_scheduleTimer !== null) {
    clearInterval(_scheduleTimer);
    _scheduleTimer = null;
    console.log('[backup] Backup scheduler stopped');
  }
}
