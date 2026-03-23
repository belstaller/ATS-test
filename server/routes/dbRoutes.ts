/**
 * Database management routes
 * --------------------------
 * All routes require authentication.  Backup creation and restore are
 * additionally restricted to `admin` users.
 *
 * GET  /api/db/health          — Live connectivity check (any authenticated user)
 * GET  /api/db/backups         — List available backups            (admin only)
 * POST /api/db/backups         — Trigger an on-demand backup       (admin only)
 * POST /api/db/backups/restore — Restore from a named backup file  (admin only)
 */

import { Router, Response, NextFunction } from 'express';
import { primaryPool, replicaPool } from '../db/config';
import {
  createBackup,
  listBackups,
  restoreBackup,
} from '../db/backup';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/db/health
// ---------------------------------------------------------------------------

/**
 * Returns real-time health information for both database pools.
 * Any authenticated user may call this endpoint.
 */
router.get(
  '/health',
  authenticate,
  async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const primaryStart = Date.now();
      await primaryPool.query('SELECT 1');
      const primaryLatencyMs = Date.now() - primaryStart;

      let replicaLatencyMs: number | null = null;
      let replicaStatus: 'ok' | 'not_configured' | 'error' = 'not_configured';

      // replicaPool points to primaryPool when no replica is configured — we
      // detect this by comparing the two pool references.
      if (replicaPool !== primaryPool) {
        try {
          const replicaStart = Date.now();
          await replicaPool.query('SELECT 1');
          replicaLatencyMs = Date.now() - replicaStart;
          replicaStatus = 'ok';
        } catch {
          replicaStatus = 'error';
        }
      }

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        primary: {
          status: 'ok',
          latencyMs: primaryLatencyMs,
          totalCount: primaryPool.totalCount,
          idleCount: primaryPool.idleCount,
          waitingCount: primaryPool.waitingCount,
        },
        replica: {
          status: replicaStatus,
          latencyMs: replicaLatencyMs,
          ...(replicaPool !== primaryPool && {
            totalCount: replicaPool.totalCount,
            idleCount: replicaPool.idleCount,
            waitingCount: replicaPool.waitingCount,
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/db/backups
// ---------------------------------------------------------------------------

/**
 * Returns a list of all backup files currently on disk.
 */
router.get(
  '/backups',
  authenticate,
  authorize('admin'),
  (_req: AuthRequest, res: Response, next: NextFunction): void => {
    try {
      const backups = listBackups();
      res.json({ backups });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/db/backups
// ---------------------------------------------------------------------------

/**
 * Triggers an immediate backup and returns its metadata once complete.
 */
router.post(
  '/backups',
  authenticate,
  authorize('admin'),
  async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metadata = await createBackup();
      res.status(201).json({ message: 'Backup created successfully', backup: metadata });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/db/backups/restore
// ---------------------------------------------------------------------------

/**
 * Restores the database from the specified backup file.
 *
 * Request body:
 *   { "filename": "backup-2024-06-15T14-30-00.dump" }
 */
router.post(
  '/backups/restore',
  authenticate,
  authorize('admin'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.body as { filename?: string };

      if (!filename || typeof filename !== 'string' || filename.trim() === '') {
        res.status(400).json({
          error: 'Request body must include a non-empty "filename" field',
        });
        return;
      }

      await restoreBackup(filename.trim());
      res.json({ message: `Database restored successfully from ${filename}` });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
