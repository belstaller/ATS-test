/**
 * LinkedIn OAuth 2.0 Service
 *
 * Handles the full LinkedIn OAuth 2.0 Authorization Code flow:
 *  1. {@link buildAuthorizationUrl} — generates the LinkedIn authorization URL
 *     and an opaque CSRF state token.
 *  2. {@link exchangeCodeForToken} — POSTs the authorization code to LinkedIn's
 *     token endpoint and returns an access token.
 *  3. {@link fetchLinkedInProfile} — calls the LinkedIn API (userinfo endpoint)
 *     with an access token and maps the response to a {@link LinkedInProfile}.
 *  4. {@link fetchAndSync} — convenience wrapper that fetches the profile and
 *     optionally triggers an ATS sync via {@link linkedinService.syncProfile}.
 *
 * Environment variables required:
 *  - LINKEDIN_CLIENT_ID      — OAuth app client ID
 *  - LINKEDIN_CLIENT_SECRET  — OAuth app client secret
 *  - LINKEDIN_REDIRECT_URI   — must match the redirect URI registered in the
 *                              LinkedIn developer portal
 */

import * as https from 'https';
import * as querystring from 'querystring';
import * as crypto from 'crypto';
import {
  LinkedInAuthorizationUrlResponse,
  LinkedInTokenResponse,
  LinkedInOAuthToken,
  LinkedInProfile,
  LinkedInFetchRequest,
  LinkedInFetchResult,
} from '../types/linkedin';
import * as linkedinService from './linkedinService';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable "${name}" is required for LinkedIn OAuth`);
  }
  return value;
}

/** LinkedIn OAuth 2.0 authorization endpoint. */
const LINKEDIN_AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';

/** LinkedIn OAuth 2.0 token endpoint. */
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

/**
 * LinkedIn OpenID Connect userinfo endpoint.
 * Returns the authenticated member's profile claims.
 * Requires the `openid`, `profile`, and `email` scopes.
 */
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

/**
 * Scopes requested during authorization.
 *
 * - `openid`   — OpenID Connect baseline (required for userinfo endpoint)
 * - `profile`  — given name, family name, profile picture, vanity name
 * - `email`    — primary email address
 *
 * The `w_member_social` scope (posting on behalf of a member) is intentionally
 * omitted — the ATS only needs to read profile data.
 */
const LINKEDIN_SCOPES = ['openid', 'profile', 'email'];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random, URL-safe state token.
 * Used as a CSRF mitigation parameter in the OAuth flow.
 */
export function generateState(): string {
  return crypto.randomBytes(24).toString('hex');
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/**
 * Builds a LinkedIn OAuth 2.0 authorization URL and returns it together with
 * the generated CSRF state token.
 *
 * The caller (controller) should persist the `state` value in a short-lived
 * server-side store (e.g. a signed cookie or a server-side session) so it can
 * be verified when LinkedIn redirects back with the code.
 *
 * @param overrideState - Optional state override (useful in tests).
 */
export function buildAuthorizationUrl(
  overrideState?: string
): LinkedInAuthorizationUrlResponse {
  const clientId = getRequiredEnv('LINKEDIN_CLIENT_ID');
  const redirectUri = getRequiredEnv('LINKEDIN_REDIRECT_URI');
  const state = overrideState ?? generateState();

  const params = querystring.stringify({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(' '),
  });

  return {
    authorizationUrl: `${LINKEDIN_AUTHORIZATION_URL}?${params}`,
    state,
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers (no external dependencies — uses Node's built-in https module)
// ---------------------------------------------------------------------------

/**
 * Performs an HTTPS POST with an `application/x-www-form-urlencoded` body.
 * Returns the parsed JSON response body.
 */
function httpsPost<T>(url: string, body: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const encoded = querystring.stringify(body);
    const parsed = new URL(url);

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(encoded),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as T;
          resolve(parsed);
        } catch {
          reject(new Error(`LinkedIn token endpoint returned non-JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(encoded);
    req.end();
  });
}

/**
 * Performs an HTTPS GET with a Bearer Authorization header.
 * Returns the parsed JSON response body.
 */
function httpsGet<T>(url: string, accessToken: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + (parsed.search || ''),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as T;
          resolve(parsed);
        } catch {
          reject(new Error(`LinkedIn API returned non-JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/**
 * Exchanges an OAuth 2.0 authorization code for an access token by calling
 * LinkedIn's token endpoint.
 *
 * @throws When LinkedIn returns an error in the token response body.
 */
export async function exchangeCodeForToken(code: string): Promise<LinkedInOAuthToken> {
  const clientId = getRequiredEnv('LINKEDIN_CLIENT_ID');
  const clientSecret = getRequiredEnv('LINKEDIN_CLIENT_SECRET');
  const redirectUri = getRequiredEnv('LINKEDIN_REDIRECT_URI');

  const response = await httpsPost<LinkedInTokenResponse & { error?: string; error_description?: string }>(
    LINKEDIN_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }
  );

  if (response.error) {
    throw new Error(
      `LinkedIn token exchange failed: ${response.error} — ${response.error_description ?? ''}`
    );
  }

  if (!response.access_token) {
    throw new Error('LinkedIn token exchange failed: no access_token in response');
  }

  const expiresAt = new Date(Date.now() + response.expires_in * 1000);

  return {
    accessToken: response.access_token,
    expiresAt,
    scope: response.scope ?? LINKEDIN_SCOPES.join(' '),
  };
}

// ---------------------------------------------------------------------------
// Profile fetch
// ---------------------------------------------------------------------------

/**
 * Raw shape returned by the LinkedIn /v2/userinfo endpoint.
 * Field names follow the OpenID Connect standard claims.
 */
interface LinkedInUserInfoResponse {
  sub: string;               // The member's LinkedIn ID
  name?: string;             // Full name
  given_name?: string;       // First name
  family_name?: string;      // Last name
  email?: string;            // Primary email
  email_verified?: boolean;
  locale?: { country: string; language: string };
  picture?: string;          // Profile picture URL
  /** LinkedIn-specific: vanity name used in the public profile URL. */
  vanityName?: string;
  headline?: string;
  /** Member's country code. */
  countryCode?: string;
}

/**
 * Maps a LinkedIn `/v2/userinfo` response to the ATS {@link LinkedInProfile}
 * shape.
 *
 * The userinfo endpoint is the recommended approach for OpenID Connect flows
 * and returns the member's core identity claims.  Extended professional data
 * (positions, educations, skills) is not available via the standard OIDC
 * userinfo endpoint without additional Marketing Developer Platform access; the
 * fields that cannot be populated are left `undefined` so that callers (and
 * ultimately the sync service) can handle them gracefully.
 */
export function mapUserInfoToProfile(userInfo: LinkedInUserInfoResponse): LinkedInProfile {
  // Build the public profile URL from the vanity name when available.
  const profileUrl = userInfo.vanityName
    ? `https://www.linkedin.com/in/${userInfo.vanityName}`
    : undefined;

  // Derive location string from countryCode when a structured location is absent.
  const location = userInfo.locale
    ? `${userInfo.locale.country}`
    : undefined;

  return {
    profileId: userInfo.sub,
    firstName: userInfo.given_name,
    lastName: userInfo.family_name,
    emailAddress: userInfo.email,
    headline: userInfo.headline,
    location,
    profileUrl,
    // Positions, educations, skills, and yearsOfExperience require additional
    // LinkedIn API scopes (e.g. r_fullprofile) beyond what the standard OIDC
    // userinfo endpoint provides.  They are intentionally left undefined here.
  };
}

/**
 * Fetches the authenticated LinkedIn member's profile via the userinfo endpoint
 * using the provided access token.
 *
 * @throws When the LinkedIn API returns an error response.
 */
export async function fetchLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const response = await httpsGet<LinkedInUserInfoResponse & { error?: string; message?: string }>(
    LINKEDIN_USERINFO_URL,
    accessToken
  );

  if (response.error || !response.sub) {
    const detail = response.message ?? response.error ?? 'unknown error';
    throw new Error(`LinkedIn profile fetch failed: ${detail}`);
  }

  return mapUserInfoToProfile(response);
}

// ---------------------------------------------------------------------------
// Fetch + optional sync
// ---------------------------------------------------------------------------

/**
 * Fetches the LinkedIn member's profile and optionally syncs it into the ATS.
 *
 * When `request.sync` is `true` (the default), the fetched profile is fed
 * through {@link linkedinService.syncProfile} so that an ATS applicant record
 * is created or updated automatically.
 *
 * @param request - {@link LinkedInFetchRequest} containing the access token and
 *                  optional sync configuration.
 * @returns {@link LinkedInFetchResult} containing the raw profile and, when
 *          sync is requested, the sync outcome.
 */
export async function fetchAndSync(
  request: LinkedInFetchRequest
): Promise<LinkedInFetchResult> {
  const { accessToken, sync = true, applicantId } = request;

  const profile = await fetchLinkedInProfile(accessToken);

  if (!sync) {
    return { profile };
  }

  const syncResult = await linkedinService.syncProfile({ profile, applicantId });

  return { profile, syncResult };
}
