/**
 * Resume Parser Routes
 * --------------------
 * Base path: /api/resume
 *
 * POST /parse — Parse a plain-text resume and return structured candidate data
 *
 * Role matrix:
 *   Write — admin, recruiter
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateResumeParseRequest } from '../middleware/validation';
import { parseResumeHandler } from '../controllers/resumeParserController';

const router = Router();

// All resume routes require a valid JWT
router.use(authenticate);

// ── Parse ─────────────────────────────────────────────────────────────────
router.post(
  '/parse',
  authorize('admin', 'recruiter'),
  validateResumeParseRequest,
  parseResumeHandler
);

export default router;
