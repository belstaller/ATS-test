import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as linkedinService from '../services/linkedinService';
import {
  LinkedInSyncRequest,
  LinkedInBatchSyncRequest,
  LinkedInBatchSyncResponse,
  LinkedInSyncResult,
  LinkedInBatchSyncError,
} from '../types/linkedin';

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
