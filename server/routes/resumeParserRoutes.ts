/**
 * Resume Routes
 * -------------
 * Base path: /api/resume
 *
 * POST /parse  — Parse a plain-text resume and return structured candidate data
 * POST /upload — Upload a resume file (PDF, DOCX, TXT), extract its text,
 *                persist metadata, and return the upload record + extracted text
 *
 * Role matrix:
 *   Write — admin, recruiter
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateResumeParseRequest,
  resumeUpload,
  validateResumeUpload,
  handleUploadError,
} from '../middleware/validation';
import { parseResumeHandler } from '../controllers/resumeParserController';
import { uploadResumeHandler } from '../controllers/resumeUploadController';

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

// ── Upload ────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  authorize('admin', 'recruiter'),
  resumeUpload.single('resume'),
  handleUploadError,
  validateResumeUpload,
  uploadResumeHandler
);

export default router;
