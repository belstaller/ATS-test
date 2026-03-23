import { Request, Response, NextFunction } from 'express';
import { APPLICANT_STATUSES } from '../types/applicant';
import { UserRole } from '../types/user';

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
// Applicants
// ---------------------------------------------------------------------------

/**
 * Full-body validation for POST /api/applicants (create).
 */
export function validateCreateApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { name, email, phone, position, status, resume_url } = req.body as Record<
    string,
    unknown
  >;

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

  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string' || !isValidPhone(phone)) {
      res.status(400).json({ error: 'Phone must be a valid phone number (7–20 digits)' });
      return;
    }
  }

  if (position !== undefined && position !== null) {
    if (typeof position !== 'string' || position.trim().length === 0) {
      res.status(400).json({ error: 'Position must be a non-empty string' });
      return;
    }
    if (position.trim().length > 255) {
      res.status(400).json({ error: 'Position must not exceed 255 characters' });
      return;
    }
  }

  if (status !== undefined && !APPLICANT_STATUSES.includes(status as Applicant['status'])) {
    res
      .status(400)
      .json({ error: `Status must be one of: ${APPLICANT_STATUSES.join(', ')}` });
    return;
  }

  if (resume_url !== undefined && resume_url !== null) {
    if (typeof resume_url !== 'string' || !isValidUrl(resume_url)) {
      res.status(400).json({ error: 'resume_url must be a valid HTTP/HTTPS URL' });
      return;
    }
  }

  next();
}

/**
 * Partial-body validation for PUT /api/applicants/:id (full update) and
 * PATCH /api/applicants/:id (partial update).
 * At least one field must be provided for PATCH; PUT allows a full set.
 */
export function validateUpdateApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { name, email, phone, position, status, resume_url } = req.body as Record<
    string,
    unknown
  >;

  const hasAnyField =
    name !== undefined ||
    email !== undefined ||
    phone !== undefined ||
    position !== undefined ||
    status !== undefined ||
    resume_url !== undefined;

  if (!hasAnyField) {
    res.status(400).json({ error: 'Request body must include at least one field to update' });
    return;
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name must be a non-empty string' });
      return;
    }
    if (name.trim().length > 255) {
      res.status(400).json({ error: 'Name must not exceed 255 characters' });
      return;
    }
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
  }

  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string' || !isValidPhone(phone)) {
      res.status(400).json({ error: 'Phone must be a valid phone number (7–20 digits)' });
      return;
    }
  }

  if (position !== undefined && position !== null) {
    if (typeof position !== 'string' || position.trim().length === 0) {
      res.status(400).json({ error: 'Position must be a non-empty string' });
      return;
    }
    if (position.trim().length > 255) {
      res.status(400).json({ error: 'Position must not exceed 255 characters' });
      return;
    }
  }

  if (status !== undefined && !APPLICANT_STATUSES.includes(status as Applicant['status'])) {
    res
      .status(400)
      .json({ error: `Status must be one of: ${APPLICANT_STATUSES.join(', ')}` });
    return;
  }

  if (resume_url !== undefined && resume_url !== null) {
    if (typeof resume_url !== 'string' || !isValidUrl(resume_url)) {
      res.status(400).json({ error: 'resume_url must be a valid HTTP/HTTPS URL' });
      return;
    }
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

  if (!status || !APPLICANT_STATUSES.includes(status as Applicant['status'])) {
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
  const { status, page, limit } = req.query as Record<string, string | undefined>;

  if (status !== undefined && !APPLICANT_STATUSES.includes(status as Applicant['status'])) {
    res
      .status(400)
      .json({ error: `status query param must be one of: ${APPLICANT_STATUSES.join(', ')}` });
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
// Keep the old export alias so existing imports don't break
// ---------------------------------------------------------------------------

/** @deprecated Use validateCreateApplicant instead */
export const validateApplicant = validateCreateApplicant;

// Workaround: the status type needs to be importable within the file
type Applicant = import('../types/applicant').Applicant;
