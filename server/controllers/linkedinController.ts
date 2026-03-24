import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as linkedinService from '../services/linkedinService';
import * as linkedinOAuthService from '../services/linkedinOAuthService';
import {
  LinkedInSyncRequest,
  LinkedInBatchSyncRequest,
  LinkedInBatchSyncResponse,
  LinkedInSyncResult,
  LinkedInBatchSyncError,
  LinkedInTokenExchangeRequest,
  LinkedInFetchRequest,
} from '../types/linkedin';

// ===========================================================================
// OAuth endpoints
// ===========================================================================

/**
 * GET /api/linkedin/oauth/authorize
 *
 * Builds and returns the LinkedIn OAuth 2.0 authorization URL.  The client
 * should redirect the user's browser to `authorizationUrl` to start the
 * OAuth flow.
 *
 * The `state` value returned here is a one-time CSRF token — the client
 * **must** pass it back in the subsequent POST /oauth/token request so the
 * server can verify that the callback originated from its own authorization
 * request.
 */
export async function getAuthorizationUrl(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = linkedinOAuthService.buildAuthorizationUrl();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/linkedin/oauth/token
 *
 * Exchanges a LinkedIn authorization code for an access token.  The `code`
 * is obtained from LinkedIn's callback redirect; the `state` must match the
 * value previously returned by GET /oauth/authorize.
 *
 * Returns the access token details so the client can immediately call
 * POST /oauth/fetch to retrieve candidate data.
 */
export async function exchangeToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code } = req.body as LinkedInTokenExchangeRequest;
    const token = await linkedinOAuthService.exchangeCodeForToken(code);
    res.status(200).json(token);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/linkedin/oauth/fetch
 *
 * Fetches the authenticated LinkedIn member's profile using an access token
 * and optionally syncs it with the ATS.
 *
 * When `sync` is `true` (the default), the profile is fed through the same
 * mapping and upsert logic as POST /api/linkedin/sync, returning both the
 * raw profile and the sync outcome.
 */
export async function fetchProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as LinkedInFetchRequest;
    const result = await linkedinOAuthService.fetchAndSync(body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// ===========================================================================
// Sync endpoints
// ===========================================================================

/**
 * POST /api/linkedin/sync
 *
 * Syncs a single LinkedIn profile with the ATS.  Finds or creates the
 * matching applicant record and updates it with the LinkedIn data.
 */
export async function syncLinkedInProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as LinkedInSyncRequest;
    const result = await linkedinService.syncProfile(body);
    const statusCode = result.action === 'created' ? 201 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/linkedin/sync/batch
 *
 * Syncs up to 100 LinkedIn profiles in a single request.  Each profile is
 * processed independently; individual failures are captured and reported in
 * the response rather than aborting the whole batch.
 */
export async function syncLinkedInProfileBatch(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { profiles } = req.body as LinkedInBatchSyncRequest;

    const results: Array<LinkedInSyncResult | LinkedInBatchSyncError> = [];
    let succeeded = 0;
    let failed = 0;

    // Process profiles sequentially to avoid overwhelming the primary DB pool
    // with parallel writes. For very large batch sizes a queue/worker pattern
    // would be preferable, but this is appropriate for the ≤100 limit.
    for (const profile of profiles) {
      try {
        const result = await linkedinService.syncProfile({ profile });
        results.push(result);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ linkedinProfileId: profile.profileId, error: message });
        failed++;
      }
    }

    const response: LinkedInBatchSyncResponse = {
      total: profiles.length,
      succeeded,
      failed,
      results,
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}
