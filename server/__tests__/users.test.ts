/**
 * Functional tests for /api/users endpoints.
 *
 * Covers:
 *  GET    /api/users          — list (paginated, filterable, searchable)
 *  GET    /api/users/:id      — single user
 *  PATCH  /api/users/:id/role — change role
 *  DELETE /api/users/:id      — delete user
 *
 * All routes are admin-only.
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import userRoutes from '../routes/userRoutes';
import { errorHandler } from '../middleware/errorHandler';
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
  makeUser,
} from './helpers';
import { PaginatedUsers } from '../services/userService';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock the user service
// ---------------------------------------------------------------------------
jest.mock('../services/userService');
import * as userService from '../services/userService';
const mockService = userService as jest.Mocked<typeof userService>;

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function paginatedResult(users = [makeUser()]): PaginatedUsers {
  return {
    data: users,
    total: users.length,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — admin gets a paginated list', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    const res = await request(app)
      .get('/api/users')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — forwards role filter', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    await request(app)
      .get('/api/users?role=recruiter')
      .set(authHeader(adminToken()));

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'recruiter' })
    );
  });

  it('200 — forwards search and pagination', async () => {
    mockService.findAll.mockResolvedValue(paginatedResult());

    await request(app)
      .get('/api/users?search=bob&page=2&limit=10')
      .set(authHeader(adminToken()));

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'bob', page: 2, limit: 10 })
    );
  });

  it('400 — invalid role query param', async () => {
    const res = await request(app)
      .get('/api/users?role=superadmin')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('400 — non-integer page', async () => {
    const res = await request(app)
      .get('/api/users?page=zero')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('403 — recruiter is forbidden', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });

  it('403 — viewer is forbidden', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------

describe('GET /api/users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns a user', async () => {
    const user = makeUser({ id: 5 });
    mockService.findById.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/users/5')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5 });
  });

  it('404 — user not found', async () => {
    mockService.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/users/999')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .get('/api/users/abc')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('403 — non-admin forbidden', async () => {
    const res = await request(app)
      .get('/api/users/1')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/role
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id/role', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — admin promotes a user to recruiter', async () => {
    const updated = makeUser({ id: 5, role: 'recruiter' });
    mockService.updateRole.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/users/5/role')
      .set(authHeader(adminToken()))
      .send({ role: 'recruiter' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('recruiter');
    expect(mockService.updateRole).toHaveBeenCalledWith(5, 'recruiter');
  });

  it('200 — admin changes a user to viewer', async () => {
    const updated = makeUser({ id: 5, role: 'viewer' });
    mockService.updateRole.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/users/5/role')
      .set(authHeader(adminToken()))
      .send({ role: 'viewer' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });

  it('404 — user not found', async () => {
    mockService.updateRole.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/users/999/role')
      .set(authHeader(adminToken()))
      .send({ role: 'viewer' });

    expect(res.status).toBe(404);
  });

  it('400 — invalid role value', async () => {
    const res = await request(app)
      .patch('/api/users/5/role')
      .set(authHeader(adminToken()))
      .send({ role: 'god' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('400 — admin cannot demote themselves', async () => {
    // adminToken userId = 1
    const res = await request(app)
      .patch('/api/users/1/role')
      .set(authHeader(adminToken()))
      .send({ role: 'viewer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own role/i);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .patch('/api/users/xyz/role')
      .set(authHeader(adminToken()))
      .send({ role: 'viewer' });

    expect(res.status).toBe(400);
  });

  it('403 — non-admin forbidden', async () => {
    const res = await request(app)
      .patch('/api/users/5/role')
      .set(authHeader(recruiterToken()))
      .send({ role: 'viewer' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('204 — admin deletes a user', async () => {
    mockService.remove.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/users/5')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(204);
    expect(mockService.remove).toHaveBeenCalledWith(5);
  });

  it('404 — user not found', async () => {
    mockService.remove.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/users/999')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
  });

  it('400 — admin cannot delete their own account', async () => {
    // adminToken userId = 1
    const res = await request(app)
      .delete('/api/users/1')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  it('400 — non-integer id', async () => {
    const res = await request(app)
      .delete('/api/users/nope')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('403 — recruiter forbidden', async () => {
    const res = await request(app)
      .delete('/api/users/5')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).delete('/api/users/5');
    expect(res.status).toBe(401);
  });
});
