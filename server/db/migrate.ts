/**
 * Standalone migration runner.
 *
 * Usage (after building):
 *   npm run db:migrate
 *
 * This file is the entry-point referenced in the package.json `db:migrate`
 * script.  It simply delegates to `runMigrations()` and then exits so it can
 * be executed as a one-shot CLI command.
 */

import { runMigrations } from './migrations';
import { closeDatabaseConnections } from './config';

runMigrations()
  .then(() => {
    console.log('[migrate] Database schema is up to date');
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[migrate] Migration failed:', message);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabaseConnections().catch(() => {
      // Ignore errors on shutdown
    });
  });
