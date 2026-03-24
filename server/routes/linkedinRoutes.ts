/**
 * LinkedIn Routes
 * ---------------
 * Base path: /api/linkedin
 *
 * OAuth 2.0 flow:
 *   GET  /oauth/authorize  — build & return the LinkedIn authorization URL
 *   POST /oauth/token      — exchange an authorization code for an access token
 *   POST /oauth/fetch      — fetch candidate data using an access token
 *
 * Profile sync:
 *   POST /sync             — sync a single LinkedIn profile with the ATS
 *   POST /sync/batch       — sync up to 100 LinkedIn profiles in one request
 *
 * Role matrix:
 *   All endpoints — admin, recruiter
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  validateLinkedInSync,
  validateLinkedInBatchSync,
  validateLinkedInTokenExchange,
  validateLinkedInFetch,
} from '../middleware/validation';
import {
  getAuthorizationUrl,
  exchangeToken,
  fetchProfile,
  syncLinkedInProfile,
  syncLinkedInProfileBatch,
} from '../controllers/linkedinController';

const router = Router();

// All LinkedIn routes require a valid JWT and at least recruiter role
router.use(authenticate);
router.use(authorize('admin', 'recruiter'));

// ── OAuth 2.0 flow ────────────────────────────────────────────────────────

// Step 1 — obtain the LinkedIn authorization URL (and CSRF state token)
router.get('/oauth/authorize', getAuthorizationUrl);

// Step 2 — exchange the authorization code for an access token
router.post('/oauth/token', validateLinkedInTokenExchange, exchangeToken);

// Step 3 — fetch the candidate's profile (and optionally sync into ATS)
router.post('/oauth/fetch', validateLinkedInFetch, fetchProfile);

// ── Single profile sync ───────────────────────────────────────────────────
router.post('/sync', validateLinkedInSync, syncLinkedInProfile);

// ── Batch profile sync ────────────────────────────────────────────────────
router.post('/sync/batch', validateLinkedInBatchSync, syncLinkedInProfileBatch);

export default router;
