/**
 * Applicant Routes
 * ----------------
 * Base path: /api/applicants
 *
 * GET    /                — List applicants (paginated, filterable, searchable)
 * GET    /:id             — Get a single applicant by id
 * POST   /                — Create a new applicant
 * PUT    /:id             — Full update of an applicant
 * PATCH  /:id             — Partial update of an applicant
 * PATCH  /:id/status      — Update applicant pipeline status only
 * DELETE /:id             — Remove an applicant (admin only)
 *
 * Role matrix:
 *   Read   — admin, recruiter, viewer
 *   Write  — admin, recruiter
 *   Delete — admin
 */

import { Router } from 'express';
import {
  getAllApplicants,
  getApplicantById,
  createApplicant,
  updateApplicant,
  updateApplicantStatus,
  deleteApplicant,
} from '../controllers/applicantController';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateIdParam,
  validateApplicantQuery,
  validateCreateApplicant,
  validateUpdateApplicant,
  validateApplicantStatus,
} from '../middleware/validation';

const router = Router();

// All applicant routes require a valid JWT
router.use(authenticate);

// ── Read ──────────────────────────────────────────────────────────────────
router.get(
  '/',
  authorize('admin', 'recruiter', 'viewer'),
  validateApplicantQuery,
  getAllApplicants
);

router.get(
  '/:id',
  authorize('admin', 'recruiter', 'viewer'),
  validateIdParam,
  getApplicantById
);

// ── Write ─────────────────────────────────────────────────────────────────
router.post(
  '/',
  authorize('admin', 'recruiter'),
  validateCreateApplicant,
  createApplicant
);

router.put(
  '/:id',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateUpdateApplicant,
  updateApplicant
);

router.patch(
  '/:id',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateUpdateApplicant,
  updateApplicant
);

router.patch(
  '/:id/status',
  authorize('admin', 'recruiter'),
  validateIdParam,
  validateApplicantStatus,
  updateApplicantStatus
);

// ── Delete ────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  authorize('admin'),
  validateIdParam,
  deleteApplicant
);

export default router;
