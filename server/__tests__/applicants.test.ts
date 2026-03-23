/**
 * Functional tests for /api/applicants endpoints.
 *
 * Covers:
 *  GET    /api/applicants             — list (paginated, filtered, searched)
 *  GET    /api/applicants/:id         — single record
 *  POST   /api/applicants             — create
 *  PUT    /api/applicants/:id         — full update
 *  PATCH  /api/applicants/:id         — partial update
 *  PATCH  /api/applicants/:id/status  — status-only update
 *  DELETE /api/applicants/:id         — delete
 *
 * Role-based access control is also tested.
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

function paginatedResult(applicants = [makeApplicant()]): PaginatedApplicants {
  return {
    data: applicants,
    total: applicants.length,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

// ---------------------------------------------------------------------------
// GET /api/applicants
// ---------------------------------------------------------------------------

describe('GET /api/applicants', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns paginated list for admin', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    const res = await request(app)
      .get('/api/applicants')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('totalPages');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — viewer can read the list', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    const res = await request(app)
      .get('/api/applicants')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(200);
  });

  it('200 — forwards status filter to service', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    await request(app)
      .get('/api/applicants?status=interview')
      .set(authHeader(adminToken()));

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'interview' })
    );
  });

  it('200 — forwards search and pagination params to service', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    await request(app)
      .get('/api/applicants?search=alice&page=2&limit=5')
      .set(authHeader(adminToken()));

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice', page: 2, limit: 5 })
    );
  });

  it('400 — invalid status filter', async () => {
    const res = await request(app)
      .get('/api/applicants?status=unicorn')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('400 — non-integer page', async () => {
    const res = await request(app)
      .get('/api/applicants?page=abc')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/page/i);
  });

  it('400 — non-integer limit', async () => {
    const res = await request(app)
      .get('/api/applicants?limit=-5')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/i);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/applicants');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/applicants/:id
// ---------------------------------------------------------------------------

describe('GET /api/applicants/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns the applicant for a valid id', async () => {
    const applicant = makeApplicant({ id: 42 });
    mockService.findById.mockResolvedValue(applicant);

    const res = await request(app)
      .get('/api/applicants/42')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 42, name: applicant.name });
  });

  it('404 — applicant does not exist', async () => {
    mockService.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/applicants/999')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .get('/api/applicants/abc')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('403 — viewer cannot …actually viewer CAN read single applicant', async () => {
    const applicant = makeApplicant();
    mockService.findById.mockResolvedValue(applicant);

    const res = await request(app)
      .get('/api/applicants/1')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/applicants
// ---------------------------------------------------------------------------

describe('POST /api/applicants', () => {
  const validBody = {
    name: 'Carol Candidate',
    email: 'carol@example.com',
    phone: '555-0199',
    position: 'QA Engineer',
  };

  beforeEach(() => jest.clearAllMocks());

  it('201 — recruiter creates an applicant', async () => {
    const created = makeApplicant({ ...validBody, id: 7 });
    mockService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: validBody.name, email: validBody.email });
  });

  it('201 — admin creates an applicant with explicit status', async () => {
    const created = makeApplicant({ ...validBody, status: 'screening' });
    mockService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(adminToken()))
      .send({ ...validBody, status: 'screening' });

    expect(res.status).toBe(201);
  });

  it('201 — admin creates an applicant with resume_url', async () => {
    const withResume = { ...validBody, resume_url: 'https://cdn.example.com/alice.pdf' };
    const created = makeApplicant(withResume);
    mockService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(adminToken()))
      .send(withResume);

    expect(res.status).toBe(201);
  });

  it('403 — viewer cannot create an applicant', async () => {
    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(viewerToken()))
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('400 — missing name', async () => {
    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(recruiterToken()))
      .send({ email: validBody.email });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('400 — invalid email', async () => {
    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(recruiterToken()))
      .send({ ...validBody, email: 'bad-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('400 — invalid status value', async () => {
    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(recruiterToken()))
      .send({ ...validBody, status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('400 — invalid resume_url', async () => {
    const res = await request(app)
      .post('/api/applicants')
      .set(authHeader(recruiterToken()))
      .send({ ...validBody, resume_url: 'ftp://bad-scheme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume_url/i);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/applicants').send(validBody);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/applicants/:id (full update)
// ---------------------------------------------------------------------------

describe('PUT /api/applicants/:id', () => {
  const updateBody = {
    name: 'Updated Name',
    email: 'updated@example.com',
    status: 'screening' as const,
  };

  beforeEach(() => jest.clearAllMocks());

  it('200 — admin fully updates an applicant', async () => {
    const updated = makeApplicant({ ...updateBody, id: 1 });
    mockService.update.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/applicants/1')
      .set(authHeader(adminToken()))
      .send(updateBody);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: updateBody.name, status: updateBody.status });
  });

  it('404 — applicant not found', async () => {
    mockService.update.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/applicants/999')
      .set(authHeader(adminToken()))
      .send(updateBody);

    expect(res.status).toBe(404);
  });

  it('400 — empty body (no fields to update)', async () => {
    const res = await request(app)
      .put('/api/applicants/1')
      .set(authHeader(adminToken()))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one field/i);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .put('/api/applicants/xyz')
      .set(authHeader(adminToken()))
      .send(updateBody);

    expect(res.status).toBe(400);
  });

  it('403 — viewer cannot update', async () => {
    const res = await request(app)
      .put('/api/applicants/1')
      .set(authHeader(viewerToken()))
      .send(updateBody);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/applicants/:id (partial update)
// ---------------------------------------------------------------------------

describe('PATCH /api/applicants/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — recruiter partially updates phone only', async () => {
    const updated = makeApplicant({ phone: '555-9999' });
    mockService.update.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/applicants/1')
      .set(authHeader(recruiterToken()))
      .send({ phone: '555-9999' });

    expect(res.status).toBe(200);
    expect(mockService.update).toHaveBeenCalledWith(1, { phone: '555-9999' });
  });

  it('400 — empty body', async () => {
    const res = await request(app)
      .patch('/api/applicants/1')
      .set(authHeader(recruiterToken()))
      .send({});

    expect(res.status).toBe(400);
  });

  it('400 — invalid email in partial update', async () => {
    const res = await request(app)
      .patch('/api/applicants/1')
      .set(authHeader(recruiterToken()))
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('403 — viewer cannot patch', async () => {
    const res = await request(app)
      .patch('/api/applicants/1')
      .set(authHeader(viewerToken()))
      .send({ phone: '555-0001' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/applicants/:id/status
// ---------------------------------------------------------------------------

describe('PATCH /api/applicants/:id/status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — advances status to interview', async () => {
    const updated = makeApplicant({ status: 'interview' });
    mockService.updateStatus.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/applicants/1/status')
      .set(authHeader(recruiterToken()))
      .send({ status: 'interview' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('interview');
    expect(mockService.updateStatus).toHaveBeenCalledWith(1, 'interview');
  });

  it('200 — marks applicant as hired', async () => {
    const updated = makeApplicant({ status: 'hired' });
    mockService.updateStatus.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/applicants/1/status')
      .set(authHeader(adminToken()))
      .send({ status: 'hired' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hired');
  });

  it('404 — applicant not found', async () => {
    mockService.updateStatus.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/applicants/999/status')
      .set(authHeader(adminToken()))
      .send({ status: 'offer' });

    expect(res.status).toBe(404);
  });

  it('400 — invalid status value', async () => {
    const res = await request(app)
      .patch('/api/applicants/1/status')
      .set(authHeader(adminToken()))
      .send({ status: 'promoted' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('400 — missing status field', async () => {
    const res = await request(app)
      .patch('/api/applicants/1/status')
      .set(authHeader(adminToken()))
      .send({});

    expect(res.status).toBe(400);
  });

  it('403 — viewer cannot update status', async () => {
    const res = await request(app)
      .patch('/api/applicants/1/status')
      .set(authHeader(viewerToken()))
      .send({ status: 'screening' });

    expect(res.status).toBe(403);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .patch('/api/applicants/abc/status')
      .set(authHeader(adminToken()))
      .send({ status: 'screening' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/applicants/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/applicants/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('204 — admin deletes an applicant', async () => {
    mockService.remove.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/applicants/1')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('404 — applicant does not exist', async () => {
    mockService.remove.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/applicants/999')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('403 — recruiter cannot delete', async () => {
    const res = await request(app)
      .delete('/api/applicants/1')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });

  it('403 — viewer cannot delete', async () => {
    const res = await request(app)
      .delete('/api/applicants/1')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(403);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .delete('/api/applicants/nope')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).delete('/api/applicants/1');
    expect(res.status).toBe(401);
  });
});
