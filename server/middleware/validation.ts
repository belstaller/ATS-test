import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  APPLICANT_STATUSES,
  APPLICANT_SOURCES,
  ApplicantSource,
  ApplicantStatus,
  UpdateApplicantDTO,
} from '../types/applicant';
import { UserRole } from '../types/user';
import { RESUME_MIME_TYPES, ResumeMimeType } from '../types/resume';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  // Allow digits, spaces, dashes, dots, parentheses and leading +
  return /^\+?[\d\s\-().]{7,20}$/.test(phone);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPositiveInt(value: unknown): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(value: unknown): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

/** Accepts an ISO-8601 date string (YYYY-MM-DD). */
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// ID parameter
// ---------------------------------------------------------------------------

/**
 * Validates that :id route param is a positive integer.
 */
export function validateIdParam(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;
  if (!isPositiveInt(id)) {
    res.status(400).json({ error: 'Invalid id: must be a positive integer' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function validateRegister(req: Request, res: Response, next: NextFunction): void {
  const { name, email, password, role } = req.body as Record<string, unknown>;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  if (name.trim().length > 255) {
    res.status(400).json({ error: 'Name must not exceed 255 characters' });
    return;
  }

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long' });
    return;
  }

  const validRoles: UserRole[] = ['admin', 'recruiter', 'viewer'];
  if (role !== undefined && !validRoles.includes(role as UserRole)) {
    res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    return;
  }

  next();
}

export function validateLogin(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body as Record<string, unknown>;

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Applicants — shared field validators (used by both create & update)
// ---------------------------------------------------------------------------

/**
 * Validates the full set of applicant fields that appear in both
 * `CreateApplicantDTO` and `UpdateApplicantDTO`.  Returns an error message
 * string when validation fails, or `null` when everything is fine.
 *
 * Callers decide which fields are required vs. optional.
 */
function validateApplicantFields(body: Record<string, unknown>): string | null {
  const {
    name,
    email,
    phone,
    location,
    position,
    experience_years,
    education,
    skills,
    resume_url,
    linkedin_url,
    github_url,
    portfolio_url,
    status,
    salary_expected,
    availability_date,
    source,
    assigned_to,
  } = body;

  // name
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return 'Name must be a non-empty string';
    }
    if (name.trim().length > 255) {
      return 'Name must not exceed 255 characters';
    }
  }

  // email
  if (email !== undefined) {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return 'Valid email is required';
    }
  }

  // phone
  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string' || !isValidPhone(phone)) {
      return 'Phone must be a valid phone number (7–20 digits)';
    }
  }

  // location
  if (location !== undefined && location !== null) {
    if (typeof location !== 'string' || location.trim().length === 0) {
      return 'Location must be a non-empty string';
    }
    if (location.trim().length > 255) {
      return 'Location must not exceed 255 characters';
    }
  }

  // position
  if (position !== undefined && position !== null) {
    if (typeof position !== 'string' || position.trim().length === 0) {
      return 'Position must be a non-empty string';
    }
    if (position.trim().length > 255) {
      return 'Position must not exceed 255 characters';
    }
  }

  // experience_years
  if (experience_years !== undefined && experience_years !== null) {
    if (!isNonNegativeInt(experience_years)) {
      return 'experience_years must be a non-negative integer';
    }
  }

  // education
  if (education !== undefined && education !== null) {
    if (typeof education !== 'string' || education.trim().length === 0) {
      return 'Education must be a non-empty string';
    }
    if (education.trim().length > 5_000) {
      return 'Education must not exceed 5,000 characters';
    }
  }

  // skills
  if (skills !== undefined && skills !== null) {
    if (!Array.isArray(skills)) {
      return 'Skills must be an array of strings';
    }
    if (skills.length > 50) {
      return 'Skills must not contain more than 50 entries';
    }
    for (const skill of skills) {
      if (typeof skill !== 'string' || skill.trim().length === 0) {
        return 'Each skill must be a non-empty string';
      }
      if (skill.trim().length > 100) {
        return 'Each skill must not exceed 100 characters';
      }
    }
  }

  // resume_url
  if (resume_url !== undefined && resume_url !== null) {
    if (typeof resume_url !== 'string' || !isValidUrl(resume_url)) {
      return 'resume_url must be a valid HTTP/HTTPS URL';
    }
  }

  // linkedin_url
  if (linkedin_url !== undefined && linkedin_url !== null) {
    if (typeof linkedin_url !== 'string' || !isValidUrl(linkedin_url)) {
      return 'linkedin_url must be a valid HTTP/HTTPS URL';
    }
  }

  // github_url
  if (github_url !== undefined && github_url !== null) {
    if (typeof github_url !== 'string' || !isValidUrl(github_url)) {
      return 'github_url must be a valid HTTP/HTTPS URL';
    }
  }

  // portfolio_url
  if (portfolio_url !== undefined && portfolio_url !== null) {
    if (typeof portfolio_url !== 'string' || !isValidUrl(portfolio_url)) {
      return 'portfolio_url must be a valid HTTP/HTTPS URL';
    }
  }

  // status
  if (status !== undefined && !APPLICANT_STATUSES.includes(status as ApplicantStatus)) {
    return `Status must be one of: ${APPLICANT_STATUSES.join(', ')}`;
  }

  // salary_expected
  if (salary_expected !== undefined && salary_expected !== null) {
    if (!isPositiveInt(salary_expected)) {
      return 'salary_expected must be a positive integer';
    }
  }

  // availability_date
  if (availability_date !== undefined && availability_date !== null) {
    if (typeof availability_date !== 'string' || !isValidDateString(availability_date)) {
      return 'availability_date must be a valid ISO-8601 date (YYYY-MM-DD)';
    }
  }

  // source
  if (source !== undefined && !APPLICANT_SOURCES.includes(source as ApplicantSource)) {
    return `Source must be one of: ${APPLICANT_SOURCES.join(', ')}`;
  }

  // assigned_to
  if (assigned_to !== undefined && assigned_to !== null) {
    if (!isPositiveInt(assigned_to)) {
      return 'assigned_to must be a positive integer (user id)';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Applicants — endpoint validators
// ---------------------------------------------------------------------------

/**
 * Full-body validation for POST /api/applicants (create).
 */
export function validateCreateApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const body = req.body as Record<string, unknown>;
  const { name, email } = body;

  // Required fields for creation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  // Shared field validation
  const error = validateApplicantFields(body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  next();
}

/**
 * Partial-body validation for PUT /api/applicants/:id (full update) and
 * PATCH /api/applicants/:id (partial update).
 * At least one field must be provided.
 */
export function validateUpdateApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const body = req.body as Record<string, unknown>;

  const knownFields: Array<keyof UpdateApplicantDTO> = [
    'name',
    'email',
    'phone',
    'location',
    'position',
    'experience_years',
    'education',
    'skills',
    'resume_url',
    'linkedin_url',
    'github_url',
    'portfolio_url',
    'status',
    'salary_expected',
    'availability_date',
    'source',
    'assigned_to',
  ];

  const hasAnyField = knownFields.some((f) => body[f] !== undefined);

  if (!hasAnyField) {
    res.status(400).json({ error: 'Request body must include at least one field to update' });
    return;
  }

  const error = validateApplicantFields(body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  next();
}

/**
 * Validates PATCH /api/applicants/:id/status body.
 */
export function validateApplicantStatus(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { status } = req.body as Record<string, unknown>;

  if (!status || !APPLICANT_STATUSES.includes(status as ApplicantStatus)) {
    res
      .status(400)
      .json({ error: `Status must be one of: ${APPLICANT_STATUSES.join(', ')}` });
    return;
  }

  next();
}

/**
 * Validates query parameters for GET /api/applicants.
 */
export function validateApplicantQuery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const {
    status,
    source,
    location,
    skills,
    assigned_to,
    experience_years_min,
    experience_years_max,
    search,
    page,
    limit,
  } = req.query as Record<string, string | undefined>;

  if (status !== undefined && !APPLICANT_STATUSES.includes(status as ApplicantStatus)) {
    res
      .status(400)
      .json({ error: `status query param must be one of: ${APPLICANT_STATUSES.join(', ')}` });
    return;
  }

  if (source !== undefined && !APPLICANT_SOURCES.includes(source as ApplicantSource)) {
    res
      .status(400)
      .json({ error: `source query param must be one of: ${APPLICANT_SOURCES.join(', ')}` });
    return;
  }

  if (location !== undefined) {
    if (typeof location !== 'string' || location.trim().length === 0) {
      res.status(400).json({ error: 'location query param must be a non-empty string' });
      return;
    }
    if (location.trim().length > 255) {
      res.status(400).json({ error: 'location query param must not exceed 255 characters' });
      return;
    }
  }

  if (skills !== undefined) {
    if (typeof skills !== 'string' || skills.trim().length === 0) {
      res.status(400).json({ error: 'skills query param must be a non-empty string' });
      return;
    }
    // Validate each comma-separated skill token
    const skillList = skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillList.length > 50) {
      res.status(400).json({ error: 'skills query param must not contain more than 50 entries' });
      return;
    }
    for (const skill of skillList) {
      if (skill.length > 100) {
        res
          .status(400)
          .json({ error: 'Each skill in the skills query param must not exceed 100 characters' });
        return;
      }
    }
  }

  if (assigned_to !== undefined && !isPositiveInt(assigned_to)) {
    res.status(400).json({ error: 'assigned_to query param must be a positive integer' });
    return;
  }

  if (experience_years_min !== undefined && !isNonNegativeInt(experience_years_min)) {
    res
      .status(400)
      .json({ error: 'experience_years_min must be a non-negative integer' });
    return;
  }

  if (experience_years_max !== undefined && !isNonNegativeInt(experience_years_max)) {
    res
      .status(400)
      .json({ error: 'experience_years_max must be a non-negative integer' });
    return;
  }

  if (
    experience_years_min !== undefined &&
    experience_years_max !== undefined &&
    parseInt(experience_years_min, 10) > parseInt(experience_years_max, 10)
  ) {
    res
      .status(400)
      .json({ error: 'experience_years_min must not be greater than experience_years_max' });
    return;
  }

  if (search !== undefined) {
    if (typeof search !== 'string' || search.trim().length === 0) {
      res.status(400).json({ error: 'search query param must be a non-empty string' });
      return;
    }
    if (search.trim().length > 255) {
      res.status(400).json({ error: 'search query param must not exceed 255 characters' });
      return;
    }
  }

  if (page !== undefined && !isPositiveInt(page)) {
    res.status(400).json({ error: 'page must be a positive integer' });
    return;
  }

  if (limit !== undefined && !isPositiveInt(limit)) {
    res.status(400).json({ error: 'limit must be a positive integer' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * Validates POST /api/applicants/:id/notes (create note).
 */
export function validateCreateNote(req: Request, res: Response, next: NextFunction): void {
  const { body } = req.body as Record<string, unknown>;

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'Note body is required and must be a non-empty string' });
    return;
  }

  if (body.trim().length > 10_000) {
    res.status(400).json({ error: 'Note body must not exceed 10,000 characters' });
    return;
  }

  next();
}

/**
 * Validates PATCH /api/applicants/:id/notes/:noteId (update note).
 */
export function validateUpdateNote(req: Request, res: Response, next: NextFunction): void {
  const { body } = req.body as Record<string, unknown>;

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'Note body is required and must be a non-empty string' });
    return;
  }

  if (body.trim().length > 10_000) {
    res.status(400).json({ error: 'Note body must not exceed 10,000 characters' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Param: noteId
// ---------------------------------------------------------------------------

/**
 * Validates that :noteId route param is a positive integer.
 */
export function validateNoteIdParam(req: Request, res: Response, next: NextFunction): void {
  const { noteId } = req.params;
  if (!isPositiveInt(noteId)) {
    res.status(400).json({ error: 'Invalid noteId: must be a positive integer' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Validates query parameters for GET /api/users.
 */
export function validateUserQuery(req: Request, res: Response, next: NextFunction): void {
  const { role, page, limit } = req.query as Record<string, string | undefined>;

  const validRoles: UserRole[] = ['admin', 'recruiter', 'viewer'];
  if (role !== undefined && !validRoles.includes(role as UserRole)) {
    res.status(400).json({ error: `role query param must be one of: ${validRoles.join(', ')}` });
    return;
  }

  if (page !== undefined && !isPositiveInt(page)) {
    res.status(400).json({ error: 'page must be a positive integer' });
    return;
  }

  if (limit !== undefined && !isPositiveInt(limit)) {
    res.status(400).json({ error: 'limit must be a positive integer' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

/**
 * Validates POST /api/linkedin/sync.
 *
 * Requires:
 *  - `profile` — an object with at least a non-empty `profileId` string.
 *  - `applicantId` — optional positive integer.
 */
export function validateLinkedInSync(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { profile, applicantId } = req.body as Record<string, unknown>;

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    res.status(400).json({ error: 'profile is required and must be an object' });
    return;
  }

  const p = profile as Record<string, unknown>;

  if (!p.profileId || typeof p.profileId !== 'string' || p.profileId.trim().length === 0) {
    res.status(400).json({ error: 'profile.profileId is required and must be a non-empty string' });
    return;
  }

  if (p.profileId.trim().length > 255) {
    res.status(400).json({ error: 'profile.profileId must not exceed 255 characters' });
    return;
  }

  if (p.emailAddress !== undefined && p.emailAddress !== null) {
    if (typeof p.emailAddress !== 'string' || !isValidEmail(p.emailAddress)) {
      res.status(400).json({ error: 'profile.emailAddress must be a valid email address' });
      return;
    }
  }

  if (p.profileUrl !== undefined && p.profileUrl !== null) {
    if (typeof p.profileUrl !== 'string' || !isValidUrl(p.profileUrl)) {
      res.status(400).json({ error: 'profile.profileUrl must be a valid HTTP/HTTPS URL' });
      return;
    }
  }

  if (p.skills !== undefined && p.skills !== null) {
    if (!Array.isArray(p.skills)) {
      res.status(400).json({ error: 'profile.skills must be an array of strings' });
      return;
    }
    for (const skill of p.skills as unknown[]) {
      if (typeof skill !== 'string') {
        res.status(400).json({ error: 'Each entry in profile.skills must be a string' });
        return;
      }
    }
  }

  if (p.positions !== undefined && p.positions !== null) {
    if (!Array.isArray(p.positions)) {
      res.status(400).json({ error: 'profile.positions must be an array' });
      return;
    }
    for (const pos of p.positions as unknown[]) {
      if (typeof pos !== 'object' || Array.isArray(pos) || pos === null) {
        res.status(400).json({ error: 'Each entry in profile.positions must be an object' });
        return;
      }
    }
  }

  if (p.educations !== undefined && p.educations !== null) {
    if (!Array.isArray(p.educations)) {
      res.status(400).json({ error: 'profile.educations must be an array' });
      return;
    }
    for (const edu of p.educations as unknown[]) {
      if (typeof edu !== 'object' || Array.isArray(edu) || edu === null) {
        res.status(400).json({ error: 'Each entry in profile.educations must be an object' });
        return;
      }
    }
  }

  if (p.yearsOfExperience !== undefined && p.yearsOfExperience !== null) {
    if (!isNonNegativeInt(p.yearsOfExperience)) {
      res
        .status(400)
        .json({ error: 'profile.yearsOfExperience must be a non-negative integer' });
      return;
    }
  }

  if (applicantId !== undefined && applicantId !== null) {
    if (!isPositiveInt(applicantId)) {
      res.status(400).json({ error: 'applicantId must be a positive integer' });
      return;
    }
  }

  next();
}

/**
 * Validates POST /api/linkedin/sync/batch.
 *
 * Requires:
 *  - `profiles` — a non-empty array (max 100 entries).
 *  - Each item must be an object with a non-empty `profileId` string.
 */
export function validateLinkedInBatchSync(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { profiles } = req.body as Record<string, unknown>;

  if (!Array.isArray(profiles)) {
    res.status(400).json({ error: 'profiles must be a non-empty array' });
    return;
  }

  if (profiles.length === 0) {
    res.status(400).json({ error: 'profiles array must not be empty' });
    return;
  }

  if (profiles.length > 100) {
    res.status(400).json({ error: 'profiles array must not exceed 100 entries per request' });
    return;
  }

  for (let i = 0; i < profiles.length; i++) {
    const item = profiles[i] as unknown;
    if (typeof item !== 'object' || Array.isArray(item) || item === null) {
      res.status(400).json({ error: `profiles[${i}] must be an object` });
      return;
    }
    const p = item as Record<string, unknown>;
    if (!p.profileId || typeof p.profileId !== 'string' || p.profileId.trim().length === 0) {
      res
        .status(400)
        .json({ error: `profiles[${i}].profileId is required and must be a non-empty string` });
      return;
    }
  }

  next();
}

// ---------------------------------------------------------------------------
// Resume Parser
// ---------------------------------------------------------------------------

/**
 * Validates the request body for POST /api/resume/parse.
 *
 * Requires:
 *  - `content` — a non-empty string (max 200,000 characters) representing
 *    the plain-text content of the resume to parse.
 */
export function validateResumeParseRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { content } = req.body as Record<string, unknown>;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res
      .status(400)
      .json({ error: 'content is required and must be a non-empty string' });
    return;
  }

  if (content.length > 200_000) {
    res
      .status(400)
      .json({ error: 'content must not exceed 200,000 characters' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Resume Upload
// ---------------------------------------------------------------------------

/** Maximum allowed resume file size: 10 MB. */
const RESUME_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Multer instance configured for in-memory storage of resume uploads.
 *
 * Limits:
 *  - Single file per request (field name: `resume`)
 *  - Max 10 MB per file
 *  - Accepted types: PDF, DOCX, TXT
 */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_FILE_SIZE },
  fileFilter(
    _req: Request,
    file: Express.Multer.File,
    callback: multer.FileFilterCallback
  ) {
    if (RESUME_MIME_TYPES.includes(file.mimetype as ResumeMimeType)) {
      callback(null, true);
    } else {
      callback(
        new Error(
          `Unsupported file type "${file.mimetype}". ` +
            'Accepted types: PDF, DOCX, TXT.'
        )
      );
    }
  },
});

/**
 * Validates that the resume file was included in the multipart request
 * and performs additional checks on the uploaded file metadata.
 *
 * Must be used **after** `resumeUpload.single('resume')` in the middleware
 * chain so that `req.file` is populated.
 */
export function validateResumeUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.file) {
    res.status(400).json({
      error: 'A resume file is required. Upload a PDF, DOCX, or TXT file using the "resume" field.',
    });
    return;
  }

  // Guard against empty files
  if (req.file.size === 0) {
    res.status(400).json({ error: 'Uploaded file must not be empty.' });
    return;
  }

  // Validate optional applicant_id query / body parameter
  const rawApplicantId =
    (req.body as Record<string, unknown>).applicant_id ??
    (req.query as Record<string, unknown>).applicant_id;

  if (rawApplicantId !== undefined && rawApplicantId !== null && rawApplicantId !== '') {
    const n = Number(rawApplicantId);
    if (!Number.isInteger(n) || n <= 0) {
      res
        .status(400)
        .json({ error: 'applicant_id must be a positive integer when provided.' });
      return;
    }
  }

  next();
}

/**
 * Express error-handling middleware that converts multer-specific errors
 * (file-too-large, wrong MIME type, missing boundary) into consistent 400
 * responses.
 *
 * Place this **after** `resumeUpload.single()` in the middleware chain so it
 * only catches errors from the upload routes.
 */
export function handleUploadError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: `File too large. Maximum allowed size is ${RESUME_MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  // File-filter rejection (wrong MIME type) is a plain Error thrown by
  // multer's fileFilter callback.
  if (
    err instanceof Error &&
    err.message.startsWith('Unsupported file type')
  ) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Busboy / multipart parsing errors (e.g. missing boundary) should surface
  // as 400 Bad Request rather than 500.
  if (
    err instanceof Error &&
    (err.message.includes('Boundary not found') ||
      err.message.includes('Multipart:'))
  ) {
    res.status(400).json({
      error:
        'A resume file is required. Upload a PDF, DOCX, or TXT file using the "resume" field.',
    });
    return;
  }

  next(err);
}

// ---------------------------------------------------------------------------
// Keep the old export alias so existing imports don't break
// ---------------------------------------------------------------------------

/** @deprecated Use validateCreateApplicant instead */
export const validateApplicant = validateCreateApplicant;
