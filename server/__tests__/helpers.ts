/**
 * Shared test helpers.
 *
 * Provides:
 *  - Factory functions for test fixtures
 *  - A helper to build a signed JWT for a given role
 *  - A helper that builds the Express app with real routing but mocked services
 */

import jwt from 'jsonwebtoken';
import { UserRole, JwtPayload } from '../types/user';
import { Applicant } from '../types/applicant';
import { UserPublic } from '../types/user';

export const TEST_JWT_SECRET = 'test-secret-do-not-use-in-production';

/** Signs a JWT using the test secret (mirrors authController logic). */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

export function adminToken(): string {
  return signToken({ userId: 1, email: 'admin@test.com', role: 'admin' });
}

export function recruiterToken(): string {
  return signToken({ userId: 2, email: 'recruiter@test.com', role: 'recruiter' });
}

export function viewerToken(): string {
  return signToken({ userId: 3, email: 'viewer@test.com', role: 'viewer' });
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function makeApplicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: 1,
    name: 'Alice Example',
    email: 'alice@example.com',
    phone: '555-0100',
    position: 'Software Engineer',
    status: 'applied',
    resume_url: 'https://example.com/resume.pdf',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeUser(overrides: Partial<UserPublic & { role: UserRole }> = {}): UserPublic {
  return {
    id: 10,
    name: 'Bob Admin',
    email: 'bob@example.com',
    role: 'admin' as UserRole,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}
