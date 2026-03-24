/**
 * Candidate Search & Filter — integration tests
 *
 * Covers every filter parameter accepted by GET /api/applicants:
 *   search, status, source, position, location, skills,
 *   assigned_to, experience_years_min/max, page, limit
 *
 * Also covers:
 *  - Combined / compound filter usage
 *  - Validation errors for malformed query params
 *  - Pagination metadata in the response
 *  - Role-based access (all three roles can read)
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import applicantRoutes from '../routes/applicantRoutes';
import { errorHandler } from '../middleware/errorHandler';
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
  makeApplicant,
} from './helpers';
import { PaginatedApplicants } from '../types/applicant';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock the applicant service
// ---------------------------------------------------------------------------
jest.mock('../services/applicantService');
import * as applicantService from '../services/applicantService';
const mockService = applicantService as jest.Mocked<typeof applicantService>;

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/applicants', applicantRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function paginated(overrides: Partial<PaginatedApplicants> = {}): PaginatedApplicants {
  return {
    data: [makeApplicant()],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function get(query = '') {
  return request(app)
    .get(`/api/applicants${query}`)
    .set(authHeader(adminToken()));
}

// ---------------------------------------------------------------------------
// 1. Basic search param
// ---------------------------------------------------------------------------

describe('Candidate search — ?search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards search term to the service', async () => {
    mockService.findAll.mockResolvedValue(paginated());

    await get('?search=alice');

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice' })
    );
  });

  it('400 — empty search string is rejected', async () => {
    const res = await get('?search=');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/search/i);
  });

  it('400 — search longer than 255 chars is rejected', async () => {
    const res = await get(`?search=${'a'.repeat(256)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/search/i);
  });

  it('200 — search exactly 255 chars is accepted', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await get(`?search=${'a'.repeat(255)}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. Status filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?status', () => {
  beforeEach(() => jest.clearAllMocks());

  const validStatuses = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

  validStatuses.forEach((s) => {
    it(`200 — forwards valid status "${s}" to service`, async () => {
      mockService.findAll.mockResolvedValue(paginated());
      await get(`?status=${s}`);
      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: s })
      );
    });
  });

  it('400 — invalid status value', async () => {
    const res = await get('?status=pending');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Source filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?source', () => {
  beforeEach(() => jest.clearAllMocks());

  const validSources = ['direct', 'linkedin', 'referral', 'job_board', 'agency', 'github', 'other'];

  validSources.forEach((s) => {
    it(`200 — forwards valid source "${s}" to service`, async () => {
      mockService.findAll.mockResolvedValue(paginated());
      await get(`?source=${s}`);
      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ source: s })
      );
    });
  });

  it('400 — invalid source value', async () => {
    const res = await get('?source=twitter');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Position filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?position', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards position to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?position=Engineer');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ position: 'Engineer' })
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Location filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?location', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards location to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?location=Berlin');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'Berlin' })
    );
  });

  it('400 — empty location string', async () => {
    const res = await get('?location=');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location/i);
  });

  it('400 — location exceeding 255 chars', async () => {
    const res = await get(`?location=${'x'.repeat(256)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location/i);
  });

  it('200 — location exactly 255 chars is accepted', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await get(`?location=${'x'.repeat(255)}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 6. Skills filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?skills', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards a single skill to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?skills=TypeScript');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ skills: 'TypeScript' })
    );
  });

  it('forwards comma-separated skills to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?skills=TypeScript,Node.js,PostgreSQL');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ skills: 'TypeScript,Node.js,PostgreSQL' })
    );
  });

  it('400 — empty skills string', async () => {
    const res = await get('?skills=');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skills/i);
  });

  it('400 — more than 50 skill tokens', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `Skill${i}`).join(',');
    const res = await get(`?skills=${tooMany}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skills/i);
  });

  it('400 — a skill token exceeding 100 chars', async () => {
    const longSkill = 's'.repeat(101);
    const res = await get(`?skills=${longSkill}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skill/i);
  });

  it('200 — exactly 50 skills is accepted', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const maxSkills = Array.from({ length: 50 }, (_, i) => `Skill${i}`).join(',');
    const res = await get(`?skills=${maxSkills}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 7. assigned_to filter
// ---------------------------------------------------------------------------

describe('Candidate search — ?assigned_to', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards numeric assigned_to to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?assigned_to=3');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_to: 3 })
    );
  });

  it('400 — non-integer assigned_to', async () => {
    const res = await get('?assigned_to=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assigned_to/i);
  });

  it('400 — zero assigned_to (must be positive)', async () => {
    const res = await get('?assigned_to=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assigned_to/i);
  });

  it('400 — negative assigned_to', async () => {
    const res = await get('?assigned_to=-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assigned_to/i);
  });
});

// ---------------------------------------------------------------------------
// 8. experience_years range filters
// ---------------------------------------------------------------------------

describe('Candidate search — ?experience_years_min / max', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards experience_years_min to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?experience_years_min=3');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ experience_years_min: 3 })
    );
  });

  it('forwards experience_years_max to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?experience_years_max=10');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ experience_years_max: 10 })
    );
  });

  it('forwards both range bounds to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?experience_years_min=2&experience_years_max=8');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ experience_years_min: 2, experience_years_max: 8 })
    );
  });

  it('200 — zero is a valid minimum (fresh graduates)', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await get('?experience_years_min=0');
    expect(res.status).toBe(200);
  });

  it('400 — negative experience_years_min', async () => {
    const res = await get('?experience_years_min=-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/experience_years_min/i);
  });

  it('400 — non-integer experience_years_min', async () => {
    const res = await get('?experience_years_min=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/experience_years_min/i);
  });

  it('400 — non-integer experience_years_max', async () => {
    const res = await get('?experience_years_max=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/experience_years_max/i);
  });

  it('400 — min greater than max', async () => {
    const res = await get('?experience_years_min=10&experience_years_max=5');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/experience_years_min/i);
  });

  it('200 — equal min and max is valid (exact match)', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await get('?experience_years_min=5&experience_years_max=5');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 9. Pagination params
// ---------------------------------------------------------------------------

describe('Candidate search — pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards page and limit to service', async () => {
    mockService.findAll.mockResolvedValue(paginated({ page: 3, limit: 10, totalPages: 5 }));
    await get('?page=3&limit=10');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 10 })
    );
  });

  it('response includes pagination metadata', async () => {
    const meta = paginated({ page: 2, limit: 5, total: 25, totalPages: 5 });
    mockService.findAll.mockResolvedValue(meta);

    const res = await get('?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(5);
  });

  it('400 — page=0', async () => {
    const res = await get('?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/page/i);
  });

  it('400 — page=abc', async () => {
    const res = await get('?page=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/page/i);
  });

  it('400 — negative limit', async () => {
    const res = await get('?limit=-5');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/i);
  });

  it('400 — limit=0', async () => {
    const res = await get('?limit=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/i);
  });
});

// ---------------------------------------------------------------------------
// 10. Combined / compound filters
// ---------------------------------------------------------------------------

describe('Candidate search — combined filters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards all filters together to service', async () => {
    mockService.findAll.mockResolvedValue(paginated());

    await get(
      '?search=alice&status=interview&source=linkedin&position=Engineer' +
        '&location=Berlin&skills=TypeScript,React&assigned_to=2' +
        '&experience_years_min=3&experience_years_max=10&page=1&limit=10'
    );

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'alice',
        status: 'interview',
        source: 'linkedin',
        position: 'Engineer',
        location: 'Berlin',
        skills: 'TypeScript,React',
        assigned_to: 2,
        experience_years_min: 3,
        experience_years_max: 10,
        page: 1,
        limit: 10,
      })
    );
  });

  it('status + search combination — forwards both', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?status=screening&search=john');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'screening', search: 'john' })
    );
  });

  it('skills + experience range — forwards both', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    await get('?skills=Python&experience_years_min=5');
    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ skills: 'Python', experience_years_min: 5 })
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Response shape
// ---------------------------------------------------------------------------

describe('Candidate search — response shape', () => {
  beforeEach(() => jest.clearAllMocks());

  it('response contains data array with correct applicant shape', async () => {
    const applicant = makeApplicant({ id: 7, status: 'hired' });
    mockService.findAll.mockResolvedValue(
      paginated({ data: [applicant], total: 1 })
    );

    const res = await get();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ id: 7, status: 'hired' });
  });

  it('empty results are returned as an empty data array', async () => {
    mockService.findAll.mockResolvedValue(
      paginated({ data: [], total: 0, totalPages: 0 })
    );

    const res = await get('?search=nobody');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Role-based access
// ---------------------------------------------------------------------------

describe('Candidate search — role-based access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — admin can search', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await request(app)
      .get('/api/applicants?search=alice')
      .set(authHeader(adminToken()));
    expect(res.status).toBe(200);
  });

  it('200 — recruiter can search', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await request(app)
      .get('/api/applicants?status=applied')
      .set(authHeader(recruiterToken()));
    expect(res.status).toBe(200);
  });

  it('200 — viewer can search', async () => {
    mockService.findAll.mockResolvedValue(paginated());
    const res = await request(app)
      .get('/api/applicants?source=linkedin')
      .set(authHeader(viewerToken()));
    expect(res.status).toBe(200);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/applicants?search=alice');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 13. Service layer — findAll filter logic (unit-level, no DB)
// ---------------------------------------------------------------------------

describe('applicantService.findAll — filter forwarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is called with the exact filters parsed from the query string', async () => {
    mockService.findAll.mockResolvedValue(paginated());

    await get('?status=offer&skills=Go,gRPC&experience_years_min=4');

    expect(mockService.findAll).toHaveBeenCalledTimes(1);
    // Extract the first positional argument from the first call
    const calledFilters = mockService.findAll.mock.calls[0][0] as NonNullable<
      (typeof mockService.findAll.mock.calls)[0][0]
    >;

    expect(calledFilters.status).toBe('offer');
    expect(calledFilters.skills).toBe('Go,gRPC');
    expect(calledFilters.experience_years_min).toBe(4);
    // experience_years_max not supplied → should be undefined
    expect(calledFilters.experience_years_max).toBeUndefined();
  });
});
