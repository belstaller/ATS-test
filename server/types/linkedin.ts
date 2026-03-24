// ---------------------------------------------------------------------------
// LinkedIn OAuth — authorization & token exchange
// ---------------------------------------------------------------------------

/**
 * Response returned by GET /api/linkedin/oauth/authorize.
 *
 * The client should redirect the user's browser to `authorizationUrl` to
 * begin the LinkedIn OAuth 2.0 authorization-code flow.
 */
export interface LinkedInAuthorizationUrlResponse {
  authorizationUrl: string;
  state: string;
}

/**
 * The LinkedIn token endpoint response, as returned after exchanging an
 * authorization code.
 */
export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  /** Present only when the `r_emailaddress` scope was granted. */
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
  token_type: string;
}

/**
 * Body accepted by POST /api/linkedin/oauth/token.
 * Exchanges an authorization code (received in the OAuth callback) for an
 * access token.
 */
export interface LinkedInTokenExchangeRequest {
  /** The authorization code returned by LinkedIn's callback. */
  code: string;
  /**
   * The CSRF state value previously returned by GET /authorize.
   * Must match the value that was embedded in the original authorization URL.
   */
  state: string;
}

/**
 * Internal — slim representation of the access token stored in memory / session
 * while the OAuth flow progresses.
 */
export interface LinkedInOAuthToken {
  accessToken: string;
  expiresAt: Date;
  scope: string;
}

/**
 * Body accepted by POST /api/linkedin/oauth/fetch.
 * Fetches a LinkedIn member's profile using an existing access token and
 * optionally syncs it into the ATS.
 */
export interface LinkedInFetchRequest {
  /** Access token obtained from POST /api/linkedin/oauth/token. */
  accessToken: string;
  /**
   * When `true` (default) the fetched profile is automatically synced into
   * the ATS via the same logic as POST /api/linkedin/sync.
   */
  sync?: boolean;
  /** Optional explicit ATS applicant id to target during sync. */
  applicantId?: number;
}

/**
 * Response returned by POST /api/linkedin/oauth/fetch.
 */
export interface LinkedInFetchResult {
  /** The raw LinkedIn profile data retrieved from the API. */
  profile: LinkedInProfile;
  /**
   * Present when `sync` was `true`.  Contains the outcome of the ATS sync
   * operation performed after fetching the profile.
   */
  syncResult?: LinkedInSyncResult;
}

// ---------------------------------------------------------------------------
// LinkedIn Profile — raw inbound payload
// ---------------------------------------------------------------------------

/**
 * A single entry in a LinkedIn candidate's employment history.
 * All fields are optional because LinkedIn data can be sparse.
 */
export interface LinkedInPosition {
  title?: string;
  companyName?: string;
  startYear?: number;
  endYear?: number | null; // null means "current role"
  description?: string;
}

/**
 * A single entry in a LinkedIn candidate's education history.
 */
export interface LinkedInEducation {
  schoolName?: string;
  degreeName?: string;
  fieldOfStudy?: string;
  endYear?: number | null;
}

/**
 * Raw LinkedIn profile as supplied by an integration (webhook, manual import,
 * OAuth callback, etc.).  Only the fields that the ATS cares about are
 * declared; unknown keys are silently ignored during mapping.
 */
export interface LinkedInProfile {
  /** LinkedIn member's public identifier (e.g. "alice-example-123abc"). */
  profileId: string;

  // ── Identity ───────────────────────────────────────────────────────────
  firstName?: string;
  lastName?: string;
  /** The primary email address exposed by the LinkedIn member. */
  emailAddress?: string;
  /** Free-text location as shown on the LinkedIn profile. */
  location?: string;
  /** LinkedIn profile headline (e.g. "Senior Software Engineer at Acme"). */
  headline?: string;
  /** Summary / "About" section text. */
  summary?: string;
  /** Direct URL to the candidate's LinkedIn profile page. */
  profileUrl?: string;

  // ── Professional profile ────────────────────────────────────────────────
  positions?: LinkedInPosition[];
  educations?: LinkedInEducation[];
  skills?: string[];
  /** Years of total experience — may be pre-computed by the sourcing tool. */
  yearsOfExperience?: number;
}

// ---------------------------------------------------------------------------
// Sync request / result
// ---------------------------------------------------------------------------

/**
 * The body accepted by POST /api/linkedin/sync.
 *
 * `profile` carries the LinkedIn data to map.
 * `applicantId` is optional: when provided, the sync targets that specific ATS
 * candidate; when absent the service looks up the candidate by email and
 * creates one if none is found.
 */
export interface LinkedInSyncRequest {
  profile: LinkedInProfile;
  /** ATS applicant id — optional explicit target. */
  applicantId?: number;
}

/** Outcome of a sync operation. */
export type LinkedInSyncAction = 'created' | 'updated';

/**
 * Response body returned by POST /api/linkedin/sync and
 * POST /api/linkedin/sync/batch (per-item result).
 */
export interface LinkedInSyncResult {
  /** Whether an ATS record was created or updated. */
  action: LinkedInSyncAction;
  /** The ATS applicant id that was affected. */
  applicantId: number;
  /** The LinkedIn profileId that was mapped. */
  linkedinProfileId: string;
  /** Human-readable summary of what changed. */
  message: string;
}

/**
 * Body accepted by POST /api/linkedin/sync/batch.
 */
export interface LinkedInBatchSyncRequest {
  profiles: LinkedInProfile[];
}

/**
 * Response body for POST /api/linkedin/sync/batch.
 */
export interface LinkedInBatchSyncResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<LinkedInSyncResult | LinkedInBatchSyncError>;
}

/**
 * Per-item error entry within a batch sync response.
 */
export interface LinkedInBatchSyncError {
  linkedinProfileId: string;
  error: string;
}
