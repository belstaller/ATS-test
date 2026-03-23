/**
 * Applicant Notes Routes
 * ----------------------
 * Base path: /api/applicants/:id/notes
 *
 * GET    /                        — List all notes for an applicant
 * POST   /                        — Add a note to an applicant
 * PATCH  /:noteId                 — Edit a note (author or admin only)
 * DELETE /:noteId                 — Delete a note (author or admin only)
 *
 * Role matrix:
 *   Read   — admin, recruiter, viewer
 *   Write  — admin, recruiter
 *   Edit / Delete own notes — admin, recruiter (author only or admin)
 */

import { Router } from 'express';
import {
  getNotesByApplicant,
  createNote,
  updateNote,
  deleteNote,
} from '../controllers/noteController';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateIdParam,
  validateNoteIdParam,
  validateCreateNote,
  validateUpdateNote,
} from '../middleware/validation';

// This router is mounted with `mergeParams: true` so that `:id` from the
// parent applicantRoutes is available as `req.params.id`.
const router = Router({ mergeParams: true });

// All note routes require a valid JWT.
router.use(authenticate);

// ── Read ──────────────────────────────────────────────────────────────────
router.get(
  '/',
  authorize('admin', 'recruiter', 'viewer'),
  validateIdParam,
  getNotesByApplicant
);

// ── Create ────────────────────────────────────────────────────────────────
router.post(
  '/',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateCreateNote,
  createNote
);

// ── Update ────────────────────────────────────────────────────────────────
router.patch(
  '/:noteId',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateNoteIdParam,
  validateUpdateNote,
  updateNote
);

// ── Delete ────────────────────────────────────────────────────────────────
router.delete(
  '/:noteId',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateNoteIdParam,
  deleteNote
);

export default router;
