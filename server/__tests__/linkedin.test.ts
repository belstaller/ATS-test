/**
 * Tests for the LinkedIn sync feature.
 *
 * Covers:
 *  Unit — mapping helpers in linkedinService
 *    buildName, derivePosition, deriveExperienceYears,
 *    buildEducationSummary, normaliseSkills,
 *    mapProfileToCreateDTO, mapProfileToUpdateDTO
 *
 *  Integration — HTTP endpoints
 *    POST /api/linkedin/sync
 *    POST /api/linkedin/sync/batch
 *
 *  Validation — validateLinkedInSync, validateLinkedInBatchSync middleware
 */

import request from 'supertest';
import express, { Application, Request, Response, RequestHandler } from 'express';
import helmet from 'helmet';
import linkedinRoutes from '../routes/linkedinRoutes';
import { errorHandler } from '../middleware/errorHandler';
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
  makeApplicant,
} from './helpers';
import {
  buildName,
  derivePosition,
  deriveExperienceYears,
  buildEducationSummary,
  normaliseSkills,
  mapProfileToCreateDTO,
  mapProfileToUpdateDTO,
} from '../services/linkedinService';
import { LinkedInProfile } from '../types/linkedin';
import {
  validateLinkedInSync,
  validateLinkedInBatchSync,
  validateLinkedInTokenExchange,
  validateLinkedInFetch,
} from '../middleware/validation';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock the applicant service (used by linkedinService internally)
// ---------------------------------------------------------------------------
jest.mock('../services/applicantService');
import * as applicantService from '../services/applicantService';
const mockApplicantService = applicantService as jest.Mocked<typeof applicantService>;

// ---------------------------------------------------------------------------
// Mock the LinkedIn OAuth service (used by the OAuth controller).
// HTTP endpoint tests use this mock to inject controlled responses.
// Pure unit tests (generateState, buildAuthorizationUrl, mapUserInfoToProfile)
// import the real implementation directly via jest.requireActual within
// their describe blocks.
// ---------------------------------------------------------------------------
jest.mock('../services/linkedinOAuthService');
import * as linkedinOAuthService from '../services/linkedinOAuthService';
const mockOAuthService = linkedinOAuthService as jest.Mocked<typeof linkedinOAuthService>;

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/linkedin', linkedinRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Validation middleware test app
// ---------------------------------------------------------------------------
function makeValidationApp(
  method: 'post',
  path: string,
  ...middleware: RequestHandler[]
): Application {
  const a = express();
  a.use(express.json());
  a[method](path, ...middleware, (_req: Request, res: Response) => res.json({ ok: true }));
  return a;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<LinkedInProfile> = {}): LinkedInProfile {
  return {
    profileId: 'alice-123',
    firstName: 'Alice',
    lastName: 'Example',
    emailAddress: 'alice@example.com',
    location: 'San Francisco, CA',
    headline: 'Senior Software Engineer at Acme',
    profileUrl: 'https://linkedin.com/in/alice-123',
    positions: [
      {
        title: 'Senior Software Engineer',
        companyName: 'Acme Corp',
        startYear: 2020,
        endYear: null,
      },
      {
        title: 'Software Engineer',
        companyName: 'Beta Inc',
        startYear: 2017,
        endYear: 2020,
      },
    ],
    educations: [
      {
        schoolName: 'MIT',
        degreeName: 'B.Sc.',
        fieldOfStudy: 'Computer Science',
        endYear: 2017,
      },
    ],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    yearsOfExperience: 7,
    ...overrides,
  };
}

// ===========================================================================
// Unit tests — mapping helpers
// ===========================================================================

describe('buildName()', () => {
  it('joins firstName and lastName with a space', () => {
    expect(buildName(makeProfile())).toBe('Alice Example');
  });

  it('returns only firstName when lastName is absent', () => {
    expect(buildName(makeProfile({ lastName: undefined }))).toBe('Alice');
  });

  it('returns only lastName when firstName is absent', () => {
    expect(buildName(makeProfile({ firstName: undefined }))).toBe('Example');
  });

  it('returns undefined when both are absent', () => {
    expect(buildName(makeProfile({ firstName: undefined, lastName: undefined }))).toBeUndefined();
  });

  it('trims whitespace from name parts', () => {
    expect(buildName(makeProfile({ firstName: '  Alice ', lastName: ' Example  ' }))).toBe(
      'Alice Example'
    );
  });
});

describe('derivePosition()', () => {
  it('returns the title of the current (endYear=null) position', () => {
    expect(derivePosition(makeProfile())).toBe('Senior Software Engineer');
  });

  it('returns the most recent past position when no current role exists', () => {
    const profile = makeProfile({
      positions: [
        { title: 'Lead Engineer', companyName: 'A', startYear: 2018, endYear: 2022 },
        { title: 'Junior Engineer', companyName: 'B', startYear: 2015, endYear: 2018 },
      ],
    });
    expect(derivePosition(profile)).toBe('Lead Engineer');
  });

  it('falls back to the headline (without " at Company" suffix)', () => {
    expect(
      derivePosition(makeProfile({ positions: undefined }))
    ).toBe('Senior Software Engineer');
  });

  it('returns the full headline when no " at " is present', () => {
    expect(
      derivePosition(makeProfile({ positions: undefined, headline: 'Freelance Consultant' }))
    ).toBe('Freelance Consultant');
  });

  it('returns undefined when no positions and no headline', () => {
    expect(
      derivePosition(makeProfile({ positions: undefined, headline: undefined }))
    ).toBeUndefined();
  });

  it('returns undefined when positions array is empty', () => {
    expect(
      derivePosition(makeProfile({ positions: [], headline: undefined }))
    ).toBeUndefined();
  });
});

describe('deriveExperienceYears()', () => {
  it('returns the pre-computed yearsOfExperience when provided', () => {
    expect(deriveExperienceYears(makeProfile({ yearsOfExperience: 7 }))).toBe(7);
  });

  it('rounds decimal yearsOfExperience', () => {
    expect(deriveExperienceYears(makeProfile({ yearsOfExperience: 7.8 }))).toBe(8);
  });

  it('accepts zero as a valid yearsOfExperience value', () => {
    expect(deriveExperienceYears(makeProfile({ yearsOfExperience: 0 }))).toBe(0);
  });

  it('computes from positions when yearsOfExperience is absent', () => {
    const profile = makeProfile({
      yearsOfExperience: undefined,
      positions: [
        { title: 'Dev', startYear: 2017, endYear: 2020 }, // 3 years
        { title: 'Lead', startYear: 2020, endYear: null }, // current year − 2020
      ],
    });
    const result = deriveExperienceYears(profile);
    const currentYear = new Date().getFullYear();
    const expected = 3 + (currentYear - 2020);
    expect(result).toBe(expected);
  });

  it('returns undefined when no positions and no yearsOfExperience', () => {
    expect(
      deriveExperienceYears(makeProfile({ yearsOfExperience: undefined, positions: undefined }))
    ).toBeUndefined();
  });

  it('skips positions without a startYear', () => {
    const profile = makeProfile({
      yearsOfExperience: undefined,
      positions: [{ title: 'Mystery Role' }],
    });
    expect(deriveExperienceYears(profile)).toBeUndefined();
  });
});

describe('buildEducationSummary()', () => {
  it('formats degree, field and school correctly', () => {
    const result = buildEducationSummary([
      { schoolName: 'MIT', degreeName: 'B.Sc.', fieldOfStudy: 'Computer Science', endYear: 2017 },
    ]);
    expect(result).toBe('B.Sc. in Computer Science, MIT (2017)');
  });

  it('handles missing fieldOfStudy', () => {
    const result = buildEducationSummary([{ schoolName: 'MIT', degreeName: 'B.Sc.' }]);
    expect(result).toBe('B.Sc., MIT');
  });

  it('handles missing degreeName', () => {
    const result = buildEducationSummary([
      { schoolName: 'MIT', fieldOfStudy: 'Computer Science' },
    ]);
    expect(result).toBe('Computer Science, MIT');
  });

  it('handles missing endYear', () => {
    const result = buildEducationSummary([
      { schoolName: 'MIT', degreeName: 'B.Sc.', fieldOfStudy: 'CS', endYear: null },
    ]);
    expect(result).toBe('B.Sc. in CS, MIT');
  });

  it('joins multiple education entries with newlines', () => {
    const result = buildEducationSummary([
      { schoolName: 'MIT', degreeName: 'B.Sc.', fieldOfStudy: 'CS', endYear: 2017 },
      { schoolName: 'Stanford', degreeName: 'M.Sc.', fieldOfStudy: 'AI', endYear: 2019 },
    ]);
    expect(result).toContain('\n');
    expect(result).toContain('MIT');
    expect(result).toContain('Stanford');
  });

  it('returns undefined for empty array', () => {
    expect(buildEducationSummary([])).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(buildEducationSummary(undefined)).toBeUndefined();
  });
});

describe('normaliseSkills()', () => {
  it('trims whitespace from each skill', () => {
    expect(normaliseSkills(['  TypeScript ', ' Node.js  '])).toEqual(['TypeScript', 'Node.js']);
  });

  it('removes duplicate skills (case-insensitive)', () => {
    expect(normaliseSkills(['TypeScript', 'typescript', 'TYPESCRIPT'])).toEqual(['TypeScript']);
  });

  it('removes empty strings', () => {
    expect(normaliseSkills(['TypeScript', '', '   '])).toEqual(['TypeScript']);
  });

  it('caps the result at 50 entries', () => {
    const input = Array.from({ length: 60 }, (_, i) => `Skill${i}`);
    const result = normaliseSkills(input);
    expect(result?.length).toBe(50);
  });

  it('returns undefined for empty array', () => {
    expect(normaliseSkills([])).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normaliseSkills(undefined)).toBeUndefined();
  });
});

// ===========================================================================
// Unit tests — DTO mapping
// ===========================================================================

describe('mapProfileToCreateDTO()', () => {
  it('maps all core fields correctly', () => {
    const dto = mapProfileToCreateDTO(makeProfile());
    expect(dto.name).toBe('Alice Example');
    expect(dto.email).toBe('alice@example.com');
    expect(dto.location).toBe('San Francisco, CA');
    expect(dto.position).toBe('Senior Software Engineer');
    expect(dto.experience_years).toBe(7);
    expect(dto.skills).toEqual(['TypeScript', 'Node.js', 'PostgreSQL']);
    expect(dto.linkedin_url).toBe('https://linkedin.com/in/alice-123');
    expect(dto.source).toBe('linkedin');
    expect(dto.education).toContain('MIT');
  });

  it('normalises email to lowercase', () => {
    const dto = mapProfileToCreateDTO(makeProfile({ emailAddress: 'Alice@Example.COM' }));
    expect(dto.email).toBe('alice@example.com');
  });

  it('throws when name cannot be derived', () => {
    expect(() =>
      mapProfileToCreateDTO(
        makeProfile({ firstName: undefined, lastName: undefined })
      )
    ).toThrow(/firstName and lastName/i);
  });

  it('throws when emailAddress is absent', () => {
    expect(() =>
      mapProfileToCreateDTO(makeProfile({ emailAddress: undefined }))
    ).toThrow(/emailAddress/i);
  });

  it('always sets source to "linkedin"', () => {
    expect(mapProfileToCreateDTO(makeProfile()).source).toBe('linkedin');
  });
});

describe('mapProfileToUpdateDTO()', () => {
  it('updates name when LinkedIn provides a different value', () => {
    const existing = makeApplicant({ name: 'Old Name' });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.name).toBe('Alice Example');
  });

  it('omits name when it matches the existing ATS value', () => {
    const existing = makeApplicant({ name: 'Alice Example' });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.name).toBeUndefined();
  });

  it('normalises email to lowercase and updates when different', () => {
    const existing = makeApplicant({ email: 'old@example.com' });
    const dto = mapProfileToUpdateDTO(
      makeProfile({ emailAddress: 'Alice@EXAMPLE.COM' }),
      existing
    );
    expect(dto.email).toBe('alice@example.com');
  });

  it('omits email when it already matches', () => {
    const existing = makeApplicant({ email: 'alice@example.com' });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.email).toBeUndefined();
  });

  it('merges new LinkedIn skills with existing ATS skills', () => {
    const existing = makeApplicant({ skills: ['React', 'TypeScript'] });
    const dto = mapProfileToUpdateDTO(
      makeProfile({ skills: ['TypeScript', 'Node.js', 'PostgreSQL'] }),
      existing
    );
    // TypeScript is already present; Node.js and PostgreSQL are new
    expect(dto.skills).toEqual(['React', 'TypeScript', 'Node.js', 'PostgreSQL']);
  });

  it('omits skills when LinkedIn adds nothing new', () => {
    const existing = makeApplicant({ skills: ['TypeScript', 'Node.js', 'PostgreSQL'] });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.skills).toBeUndefined();
  });

  it('does not overwrite status, salary_expected, or assigned_to', () => {
    const existing = makeApplicant({ status: 'interview', salary_expected: 120000 });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.status).toBeUndefined();
    expect(dto.salary_expected).toBeUndefined();
    expect(dto.assigned_to).toBeUndefined();
  });

  it('sets source to "linkedin" when existing source differs', () => {
    const existing = makeApplicant({ source: 'referral' });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.source).toBe('linkedin');
  });

  it('omits source when existing source is already "linkedin"', () => {
    const existing = makeApplicant({ source: 'linkedin' });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(dto.source).toBeUndefined();
  });

  it('returns an empty DTO when the LinkedIn data matches the existing ATS record exactly', () => {
    const existing = makeApplicant({
      name: 'Alice Example',
      email: 'alice@example.com',
      location: 'San Francisco, CA',
      position: 'Senior Software Engineer',
      experience_years: 7,
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      linkedin_url: 'https://linkedin.com/in/alice-123',
      source: 'linkedin',
      education: 'B.Sc. in Computer Science, MIT (2017)',
    });
    const dto = mapProfileToUpdateDTO(makeProfile(), existing);
    expect(Object.keys(dto).length).toBe(0);
  });
});

// ===========================================================================
// Validation middleware unit tests
// ===========================================================================

describe('validateLinkedInSync middleware', () => {
  const app = makeValidationApp('post', '/', validateLinkedInSync);
  const validBody = { profile: { profileId: 'alice-123', emailAddress: 'alice@example.com' } };

  it('passes a minimal valid body', async () => {
    expect((await request(app).post('/').send(validBody)).status).toBe(200);
  });

  it('passes with optional applicantId', async () => {
    expect(
      (await request(app).post('/').send({ ...validBody, applicantId: 5 })).status
    ).toBe(200);
  });

  it('rejects missing profile', async () => {
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  it('rejects profile as a non-object (string)', async () => {
    const res = await request(app).post('/').send({ profile: 'alice-123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  it('rejects profile as an array', async () => {
    const res = await request(app).post('/').send({ profile: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  it('rejects missing profileId', async () => {
    const res = await request(app).post('/').send({ profile: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('rejects empty profileId string', async () => {
    const res = await request(app).post('/').send({ profile: { profileId: '   ' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('rejects profileId longer than 255 characters', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'x'.repeat(256) } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('rejects invalid emailAddress', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', emailAddress: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/emailAddress/i);
  });

  it('rejects invalid profileUrl', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', profileUrl: 'ftp://bad' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileUrl/i);
  });

  it('rejects non-array skills', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', skills: 'TypeScript' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skills/i);
  });

  it('rejects skills array with non-string entries', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', skills: [42] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skills/i);
  });

  it('rejects non-array positions', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', positions: 'dev' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positions/i);
  });

  it('rejects positions array with non-object entries', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', positions: ['bad'] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positions/i);
  });

  it('rejects non-array educations', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', educations: 'mit' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/educations/i);
  });

  it('rejects negative yearsOfExperience', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', yearsOfExperience: -1 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yearsOfExperience/i);
  });

  it('rejects non-integer applicantId', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...validBody, applicantId: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicantId/i);
  });

  it('rejects zero applicantId', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...validBody, applicantId: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicantId/i);
  });

  it('accepts null applicantId (explicit opt-out)', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...validBody, applicantId: null });
    expect(res.status).toBe(200);
  });

  it('accepts null emailAddress', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', emailAddress: null } });
    expect(res.status).toBe(200);
  });

  it('accepts zero yearsOfExperience', async () => {
    const res = await request(app)
      .post('/')
      .send({ profile: { profileId: 'abc', yearsOfExperience: 0 } });
    expect(res.status).toBe(200);
  });
});

describe('validateLinkedInBatchSync middleware', () => {
  const batchApp = makeValidationApp('post', '/', validateLinkedInBatchSync);

  it('passes a valid single-item batch', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({ profiles: [{ profileId: 'alice-123' }] });
    expect(res.status).toBe(200);
  });

  it('passes a valid multi-item batch', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({
        profiles: [
          { profileId: 'alice-123', emailAddress: 'alice@example.com' },
          { profileId: 'bob-456', emailAddress: 'bob@example.com' },
        ],
      });
    expect(res.status).toBe(200);
  });

  it('rejects missing profiles field', async () => {
    const res = await request(batchApp).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profiles/i);
  });

  it('rejects non-array profiles', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({ profiles: 'alice-123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profiles/i);
  });

  it('rejects empty profiles array', async () => {
    const res = await request(batchApp).post('/').send({ profiles: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it('rejects profiles array exceeding 100 entries', async () => {
    const profiles = Array.from({ length: 101 }, (_, i) => ({ profileId: `p-${i}` }));
    const res = await request(batchApp).post('/').send({ profiles });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/i);
  });

  it('rejects a profile entry that is not an object', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({ profiles: ['not-an-object'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profiles\[0\]/i);
  });

  it('rejects a profile entry with a missing profileId', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({ profiles: [{ firstName: 'Alice' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('rejects a profile entry with an empty profileId', async () => {
    const res = await request(batchApp)
      .post('/')
      .send({ profiles: [{ profileId: '' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('accepts exactly 100 profiles (boundary)', async () => {
    const profiles = Array.from({ length: 100 }, (_, i) => ({ profileId: `p-${i}` }));
    const res = await request(batchApp).post('/').send({ profiles });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// HTTP endpoint integration tests
// ===========================================================================

describe('POST /api/linkedin/sync', () => {
  const validBody = {
    profile: {
      profileId: 'alice-123',
      firstName: 'Alice',
      lastName: 'Example',
      emailAddress: 'alice@example.com',
      location: 'San Francisco, CA',
      headline: 'Senior Software Engineer at Acme',
      profileUrl: 'https://linkedin.com/in/alice-123',
      skills: ['TypeScript', 'Node.js'],
      yearsOfExperience: 7,
    },
  };

  beforeEach(() => jest.clearAllMocks());

  // ── Create path ────────────────────────────────────────────────────────────

  it('201 — creates a new applicant when no match is found', async () => {
    // No applicant found by email search
    mockApplicantService.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
      totalPages: 0,
    });
    const created = makeApplicant({ id: 99, name: 'Alice Example', source: 'linkedin' });
    mockApplicantService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('created');
    expect(res.body.applicantId).toBe(99);
    expect(res.body.linkedinProfileId).toBe('alice-123');
    expect(res.body.message).toMatch(/created/i);
  });

  it('201 — creates applicant with correct source=linkedin', async () => {
    mockApplicantService.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
      totalPages: 0,
    });
    const created = makeApplicant({ id: 99 });
    mockApplicantService.create.mockResolvedValue(created);

    await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(mockApplicantService.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'linkedin' })
    );
  });

  // ── Update path ────────────────────────────────────────────────────────────

  it('200 — updates an existing applicant matched by email', async () => {
    const existing = makeApplicant({
      id: 42,
      email: 'alice@example.com',
      name: 'Old Name',
      source: 'direct',
    });
    mockApplicantService.findAll.mockResolvedValue({
      data: [existing],
      total: 1,
      page: 1,
      limit: 5,
      totalPages: 1,
    });
    const updated = makeApplicant({ ...existing, name: 'Alice Example', source: 'linkedin' });
    mockApplicantService.update.mockResolvedValue(updated);

    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updated');
    expect(res.body.applicantId).toBe(42);
    expect(res.body.linkedinProfileId).toBe('alice-123');
    expect(res.body.message).toMatch(/updated/i);
  });

  it('200 — targets applicant by explicit applicantId', async () => {
    const existing = makeApplicant({ id: 7, source: 'direct' });
    mockApplicantService.findById.mockResolvedValue(existing);
    const updated = makeApplicant({ ...existing, source: 'linkedin' });
    mockApplicantService.update.mockResolvedValue(updated);

    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(adminToken()))
      .send({ ...validBody, applicantId: 7 });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updated');
    expect(res.body.applicantId).toBe(7);
    // findById was used; findAll was not called
    expect(mockApplicantService.findById).toHaveBeenCalledWith(7);
    expect(mockApplicantService.findAll).not.toHaveBeenCalled();
  });

  it('200 — skips update call when nothing has changed', async () => {
    const existing = makeApplicant({
      id: 42,
      name: 'Alice Example',
      email: 'alice@example.com',
      location: 'San Francisco, CA',
      position: 'Senior Software Engineer',
      experience_years: 7,
      skills: ['TypeScript', 'Node.js'],
      linkedin_url: 'https://linkedin.com/in/alice-123',
      source: 'linkedin',
      education: undefined,
    });
    mockApplicantService.findAll.mockResolvedValue({
      data: [existing],
      total: 1,
      page: 1,
      limit: 5,
      totalPages: 1,
    });

    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updated');
    // No actual fields changed → update service should NOT be called
    expect(mockApplicantService.update).not.toHaveBeenCalled();
  });

  it('404 — returns 404 when explicit applicantId does not exist', async () => {
    mockApplicantService.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(adminToken()))
      .send({ ...validBody, applicantId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── Auth / RBAC ────────────────────────────────────────────────────────────

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).post('/api/linkedin/sync').send(validBody);
    expect(res.status).toBe(401);
  });

  it('403 — viewer cannot sync LinkedIn profiles', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(viewerToken()))
      .send(validBody);
    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('400 — missing profile field', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  it('400 — missing profileId', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send({ profile: { firstName: 'Alice' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });

  it('400 — invalid emailAddress', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send({ profile: { profileId: 'x', emailAddress: 'bad' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/emailAddress/i);
  });

  it('400 — invalid profileUrl', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send({ profile: { profileId: 'x', profileUrl: 'not-a-url' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileUrl/i);
  });

  it('400 — invalid applicantId (string)', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync')
      .set(authHeader(recruiterToken()))
      .send({ profile: { profileId: 'x' }, applicantId: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicantId/i);
  });
});

describe('POST /api/linkedin/sync/batch', () => {
  const profileA: LinkedInProfile = {
    profileId: 'alice-123',
    firstName: 'Alice',
    lastName: 'Example',
    emailAddress: 'alice@example.com',
    skills: ['TypeScript'],
    yearsOfExperience: 5,
  };

  const profileB: LinkedInProfile = {
    profileId: 'bob-456',
    firstName: 'Bob',
    lastName: 'Builder',
    emailAddress: 'bob@example.com',
    skills: ['Python'],
    yearsOfExperience: 3,
  };

  beforeEach(() => jest.clearAllMocks());

  it('200 — syncs all profiles and returns aggregate stats', async () => {
    // Both profiles → no existing match → creates new applicants
    mockApplicantService.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
      totalPages: 0,
    });
    mockApplicantService.create
      .mockResolvedValueOnce(makeApplicant({ id: 11, name: 'Alice Example' }))
      .mockResolvedValueOnce(makeApplicant({ id: 22, name: 'Bob Builder' }));

    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(adminToken()))
      .send({ profiles: [profileA, profileB] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.succeeded).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].action).toBe('created');
    expect(res.body.results[1].action).toBe('created');
  });

  it('200 — partial failure is captured per-item; others still succeed', async () => {
    // profileA → no match → create succeeds
    // profileB → no email → service throws (no emailAddress)
    const profileBNoEmail: LinkedInProfile = { ...profileB, emailAddress: undefined };

    mockApplicantService.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
      totalPages: 0,
    });
    mockApplicantService.create.mockResolvedValue(
      makeApplicant({ id: 11, name: 'Alice Example' })
    );

    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(adminToken()))
      .send({ profiles: [profileA, profileBNoEmail] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);
    // Successful result has action field
    const success = res.body.results.find(
      (r: { action?: string }) => r.action === 'created'
    );
    expect(success).toBeDefined();
    // Error entry has error field
    const failure = res.body.results.find(
      (r: { error?: string }) => r.error !== undefined
    );
    expect(failure).toBeDefined();
    expect(failure.linkedinProfileId).toBe('bob-456');
  });

  it('200 — mix of create and update results', async () => {
    const existingAlice = makeApplicant({
      id: 42,
      email: 'alice@example.com',
      source: 'direct',
    });

    mockApplicantService.findAll
      // First call: alice found
      .mockResolvedValueOnce({
        data: [existingAlice],
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      })
      // Second call: bob not found
      .mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 1,
        limit: 5,
        totalPages: 0,
      });

    mockApplicantService.update.mockResolvedValue(
      makeApplicant({ ...existingAlice, source: 'linkedin' })
    );
    mockApplicantService.create.mockResolvedValue(
      makeApplicant({ id: 99, name: 'Bob Builder' })
    );

    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(adminToken()))
      .send({ profiles: [profileA, profileB] });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toBe(2);
    expect(res.body.failed).toBe(0);

    const actions = res.body.results.map((r: { action: string }) => r.action);
    expect(actions).toContain('updated');
    expect(actions).toContain('created');
  });

  // ── Auth / RBAC ────────────────────────────────────────────────────────────

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .send({ profiles: [profileA] });
    expect(res.status).toBe(401);
  });

  it('403 — viewer cannot batch-sync profiles', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(viewerToken()))
      .send({ profiles: [profileA] });
    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('400 — missing profiles field', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(recruiterToken()))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profiles/i);
  });

  it('400 — empty profiles array', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(recruiterToken()))
      .send({ profiles: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it('400 — profiles array exceeding 100 entries', async () => {
    const profiles = Array.from({ length: 101 }, (_, i) => ({ profileId: `p-${i}` }));
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(recruiterToken()))
      .send({ profiles });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/i);
  });

  it('400 — profile entry missing profileId', async () => {
    const res = await request(app)
      .post('/api/linkedin/sync/batch')
      .set(authHeader(recruiterToken()))
      .send({ profiles: [{ firstName: 'NoId' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profileId/i);
  });
});
