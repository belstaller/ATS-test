/**
 * LinkedIn Routes
 * ---------------
 * Base path: /api/linkedin
 *
 * POST /sync        — Sync a single LinkedIn profile with the ATS
 * POST /sync/batch  — Sync up to 100 LinkedIn profiles in one request
 *
 * Role matrix:
 *   Write — admin, recruiter
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateLinkedInSync,
  validateLinkedInBatchSync,
} from '../middleware/validation';
import {
  syncLinkedInProfile,
  syncLinkedInProfileBatch,
} from '../controllers/linkedinController';

const router = Router();

// All LinkedIn sync routes require a valid JWT and at least recruiter role
router.use(authenticate);
router.use(authorize('admin', 'recruiter'));

// ── Single profile sync ───────────────────────────────────────────────────
router.post('/sync', validateLinkedInSync, syncLinkedInProfile);

// ── Batch profile sync ────────────────────────────────────────────────────
router.post('/sync/batch', validateLinkedInBatchSync, syncLinkedInProfileBatch);

export default router;
