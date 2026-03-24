/**
 * LinkedIn ↔ ATS synchronisation service.
 *
 * Responsibilities:
 *  1. Map a raw {@link LinkedInProfile} to an ATS {@link CreateApplicantDTO} /
 *     {@link UpdateApplicantDTO}, applying field-level precedence rules so
 *     that no data discrepancies are introduced.
 *  2. Resolve the target ATS applicant (by explicit id, by email look-up, or
 *     by creating a new record).
 *  3. Return a {@link LinkedInSyncResult} that tells the caller what happened.
 */

import * as applicantService from './applicantService';
import {
  CreateApplicantDTO,
  UpdateApplicantDTO,
  Applicant,
} from '../types/applicant';
import {
  LinkedInProfile,
  LinkedInEducation,
  LinkedInSyncRequest,
  LinkedInSyncResult,
} from '../types/linkedin';

// ---------------------------------------------------------------------------
// Field-mapping helpers
// ---------------------------------------------------------------------------

/**
 * Builds the candidate's full name from LinkedIn first/last name parts.
 * Returns `undefined` when neither part is available.
 */
export function buildName(profile: LinkedInProfile): string | undefined {
  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const full = [first, last].filter(Boolean).join(' ');
  return full.length > 0 ? full : undefined;
}

/**
 * Derives the most recent job title from the positions array, or falls back
 * to the profile headline.  Returns `undefined` when no title is available.
 */
export function derivePosition(profile: LinkedInProfile): string | undefined {
  if (profile.positions && profile.positions.length > 0) {
    // LinkedIn returns positions newest-first; take the first one that is
    // either current (endYear === null) or has the highest startYear.
    const sorted = [...profile.positions].sort((a, b) => {
      // Current roles (endYear === null) sort above all past roles.
      if (a.endYear === null && b.endYear !== null) return -1;
      if (b.endYear === null && a.endYear !== null) return 1;
      // Otherwise sort by startYear descending.
      return (b.startYear ?? 0) - (a.startYear ?? 0);
    });

    const title = sorted[0]?.title?.trim();
    if (title) return title;
  }

  // Fall back to the headline (strip company suffix if present, e.g. "Engineer at Acme")
  if (profile.headline) {
    const headline = profile.headline.trim();
    const atIndex = headline.toLowerCase().lastIndexOf(' at ');
    return atIndex > 0 ? headline.slice(0, atIndex).trim() : headline;
  }

  return undefined;
}

/**
 * Computes total years of experience.
 * Prefers the pre-computed `yearsOfExperience` field; when absent, sums up
 * the durations of all non-overlapping positions.
 */
export function deriveExperienceYears(profile: LinkedInProfile): number | undefined {
  if (profile.yearsOfExperience !== undefined && profile.yearsOfExperience >= 0) {
    return Math.round(profile.yearsOfExperience);
  }

  if (!profile.positions || profile.positions.length === 0) {
    return undefined;
  }

  const currentYear = new Date().getFullYear();
  let totalYears = 0;

  for (const pos of profile.positions) {
    const start = pos.startYear;
    if (!start) continue;
    // endYear === null means "current role"; treat as current calendar year.
    const end = pos.endYear === null || pos.endYear === undefined ? currentYear : pos.endYear;
    const duration = end - start;
    if (duration > 0) {
      totalYears += duration;
    }
  }

  return totalYears > 0 ? totalYears : undefined;
}

/**
 * Builds a free-text education summary from LinkedIn educations array.
 * Each entry is formatted as "Degree in Field, School (Year)" and joined by
 * newlines.  Returns `undefined` when no education data is present.
 */
export function buildEducationSummary(
  educations: LinkedInEducation[] | undefined
): string | undefined {
  if (!educations || educations.length === 0) return undefined;

  const lines = educations
    .map((edu) => {
      const parts: string[] = [];

      if (edu.degreeName && edu.fieldOfStudy) {
        parts.push(`${edu.degreeName} in ${edu.fieldOfStudy}`);
      } else if (edu.degreeName) {
        parts.push(edu.degreeName);
      } else if (edu.fieldOfStudy) {
        parts.push(edu.fieldOfStudy);
      }

      if (edu.schoolName) {
        parts.push(edu.schoolName);
      }

      const year = edu.endYear ? `(${edu.endYear})` : '';
      return [parts.join(', '), year].filter(Boolean).join(' ');
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Deduplicates and normalises the skills array.
 * Trims whitespace, removes empty strings, and enforces the ATS limit of 50
 * entries (extras are silently dropped).
 */
export function normaliseSkills(skills: string[] | undefined): string[] | undefined {
  if (!skills || skills.length === 0) return undefined;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of skills) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
    if (result.length >= 50) break;
  }

  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Profile → DTO mapping
// ---------------------------------------------------------------------------

/**
 * Maps a {@link LinkedInProfile} to a {@link CreateApplicantDTO}.
 * Used when creating a brand-new ATS applicant from LinkedIn data.
 *
 * The `name` and `email` fields are mandatory for creation; this function
 * will throw if neither can be derived from the profile.
 */
export function mapProfileToCreateDTO(profile: LinkedInProfile): CreateApplicantDTO {
  const name = buildName(profile);
  if (!name) {
    throw new Error(
      `LinkedIn profile "${profile.profileId}" is missing both firstName and lastName`
    );
  }

  const email = profile.emailAddress?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      `LinkedIn profile "${profile.profileId}" does not include an emailAddress`
    );
  }

  return {
    name,
    email,
    location: profile.location?.trim() || undefined,
    position: derivePosition(profile),
    experience_years: deriveExperienceYears(profile),
    education: buildEducationSummary(profile.educations),
    skills: normaliseSkills(profile.skills),
    linkedin_url: profile.profileUrl?.trim() || undefined,
    source: 'linkedin',
    // status defaults to 'applied' in the service layer
  };
}

/**
 * Maps a {@link LinkedInProfile} to an {@link UpdateApplicantDTO}.
 * Only fields that are **explicitly present** in the LinkedIn payload are
 * included — this prevents accidentally overwriting ATS data with `undefined`.
 *
 * Fields that the ATS owns exclusively (e.g. `status`, `salary_expected`,
 * `assigned_to`) are never touched by a LinkedIn sync.
 */
export function mapProfileToUpdateDTO(
  profile: LinkedInProfile,
  existing: Applicant
): UpdateApplicantDTO {
  const dto: UpdateApplicantDTO = {};

  // ── Name: only update if LinkedIn provides a more complete version ───────
  const linkedInName = buildName(profile);
  if (linkedInName && linkedInName !== existing.name) {
    dto.name = linkedInName;
  }

  // ── Email: normalise and update only if it differs ───────────────────────
  const linkedInEmail = profile.emailAddress?.trim().toLowerCase();
  if (linkedInEmail && linkedInEmail !== existing.email) {
    dto.email = linkedInEmail;
  }

  // ── Location ──────────────────────────────────────────────────────────────
  if (profile.location !== undefined) {
    const loc = profile.location.trim() || undefined;
    if (loc !== existing.location) {
      dto.location = loc;
    }
  }

  // ── Position ──────────────────────────────────────────────────────────────
  if (profile.positions !== undefined || profile.headline !== undefined) {
    const pos = derivePosition(profile);
    if (pos !== undefined && pos !== existing.position) {
      dto.position = pos;
    }
  }

  // ── Experience years ──────────────────────────────────────────────────────
  if (
    profile.yearsOfExperience !== undefined ||
    (profile.positions !== undefined && profile.positions.length > 0)
  ) {
    const exp = deriveExperienceYears(profile);
    if (exp !== undefined && exp !== existing.experience_years) {
      dto.experience_years = exp;
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (profile.educations !== undefined) {
    const edu = buildEducationSummary(profile.educations);
    if (edu !== undefined && edu !== existing.education) {
      dto.education = edu;
    }
  }

  // ── Skills: merge LinkedIn skills with existing ATS skills ───────────────
  if (profile.skills !== undefined) {
    const linkedInSkills = normaliseSkills(profile.skills) ?? [];
    const existingSkills: string[] = existing.skills ?? [];

    // Build a case-insensitive set of existing skills for dedup.
    const existingLower = new Set(existingSkills.map((s) => s.toLowerCase()));
    const newSkills = linkedInSkills.filter(
      (s) => !existingLower.has(s.toLowerCase())
    );

    if (newSkills.length > 0) {
      const merged = [...existingSkills, ...newSkills].slice(0, 50);
      dto.skills = merged;
    }
  }

  // ── LinkedIn URL ──────────────────────────────────────────────────────────
  if (profile.profileUrl !== undefined) {
    const url = profile.profileUrl.trim() || undefined;
    if (url !== existing.linkedin_url) {
      dto.linkedin_url = url;
    }
  }

  // ── Source: once linked to LinkedIn it stays that way ────────────────────
  if (existing.source !== 'linkedin') {
    dto.source = 'linkedin';
  }

  return dto;
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

/**
 * Resolves which ATS applicant a LinkedIn profile should be synced to.
 *
 * Resolution order:
 *  1. Explicit `applicantId` in the request (verified to exist).
 *  2. Email look-up via `findAll` with an exact email search.
 *  3. `null` — a new record should be created.
 */
async function resolveApplicant(
  profile: LinkedInProfile,
  applicantId?: number
): Promise<Applicant | null> {
  if (applicantId !== undefined) {
    const found = await applicantService.findById(applicantId);
    if (!found) {
      const err = new Error(`Applicant with id ${applicantId} not found`) as Error & {
        status: number;
      };
      err.status = 404;
      throw err;
    }
    return found;
  }

  const email = profile.emailAddress?.trim().toLowerCase();
  if (!email) return null;

  // Use the search filter to locate by exact email match.
  const { data } = await applicantService.findAll({ search: email, limit: 5 });
  const match = data.find((a) => a.email.toLowerCase() === email);
  return match ?? null;
}

/**
 * Syncs a single LinkedIn profile with the ATS.
 *
 * @param request - The sync request containing the LinkedIn profile and
 *                  optional target applicant id.
 * @returns A {@link LinkedInSyncResult} describing the outcome.
 */
export async function syncProfile(request: LinkedInSyncRequest): Promise<LinkedInSyncResult> {
  const { profile, applicantId } = request;

  const existing = await resolveApplicant(profile, applicantId);

  if (existing === null) {
    // ── Create new ATS applicant ────────────────────────────────────────────
    const createDTO = mapProfileToCreateDTO(profile);
    const created = await applicantService.create(createDTO);

    return {
      action: 'created',
      applicantId: created.id,
      linkedinProfileId: profile.profileId,
      message: `Created new applicant "${created.name}" (id: ${created.id}) from LinkedIn profile "${profile.profileId}"`,
    };
  }

  // ── Update existing ATS applicant ────────────────────────────────────────
  const updateDTO = mapProfileToUpdateDTO(profile, existing);

  if (Object.keys(updateDTO).length > 0) {
    await applicantService.update(existing.id, updateDTO);
  }

  return {
    action: 'updated',
    applicantId: existing.id,
    linkedinProfileId: profile.profileId,
    message: `Updated applicant "${existing.name}" (id: ${existing.id}) from LinkedIn profile "${profile.profileId}"`,
  };
}
