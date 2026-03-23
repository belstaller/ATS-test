/**
 * Functional tests for POST /api/auth/register, POST /api/auth/login,
 * and GET /api/auth/me.
 *
 * The database layer is fully mocked so tests run without a real PostgreSQL
 * instance.
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import authRoutes from '../routes/authRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { TEST_JWT_SECRET, adminToken, authHeader, makeUser } from './helpers';

// ---------------------------------------------------------------------------
// Mock env before any module under test reads it
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock the user service
// ---------------------------------------------------------------------------
jest.mock('../services/userService');
import * as userService from '../services/userService';
const mockUserService = userService as jest.Mocked<typeof userService>;

// Mock bcryptjs so hashing/comparison is instant in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));
import bcrypt from 'bcryptjs';
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// ---------------------------------------------------------------------------
// Build a minimal Express app
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  const app = buildApp();

  const validBody = {
    name: 'Alice Example',
    email: 'alice@example.com',
    password: 'password123',
  };

  beforeEach(() => jest.clearAllMocks());

  it('201 — creates a new user and returns user + token', async () => {
    mockUserService.findByEmailWithPassword.mockResolvedValue(null);
    const createdUser = makeUser({ id: 5, name: validBody.name, email: validBody.email, role: 'viewer' });
    mockUserService.create.mockResolvedValue(createdUser);

    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: validBody.email });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('409 — returns conflict when email already registered', async () => {
    const existingUser = {
      ...makeUser(),
      password_hash: 'hashed_password',
    };
    mockUserService.findByEmailWithPassword.mockResolvedValue(existingUser);

    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email is already registered');
  });

  it('400 — missing name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: validBody.email, password: validBody.password });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('400 — invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('400 — password too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('400 — invalid role value', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, role: 'superuser' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('201 — accepts an explicit valid role', async () => {
    mockUserService.findByEmailWithPassword.mockResolvedValue(null);
    const createdUser = makeUser({ id: 6, role: 'recruiter' });
    mockUserService.create.mockResolvedValue(createdUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, role: 'recruiter' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('recruiter');
  });
});

describe('POST /api/auth/login', () => {
  const app = buildApp();

  const validBody = { email: 'alice@example.com', password: 'password123' };

  beforeEach(() => jest.clearAllMocks());

  it('200 — returns user (no password_hash) and token on valid credentials', async () => {
    const dbUser = { ...makeUser(), password_hash: 'hashed_password' };
    mockUserService.findByEmailWithPassword.mockResolvedValue(dbUser);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('401 — unknown email', async () => {
    mockUserService.findByEmailWithPassword.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('401 — wrong password', async () => {
    const dbUser = { ...makeUser(), password_hash: 'hashed_password' };
    mockUserService.findByEmailWithPassword.mockResolvedValue(dbUser);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

    const res = await request(app).post('/api/auth/login').send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: validBody.password });

    expect(res.status).toBe(400);
  });

  it('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validBody.email });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  const app = buildApp();

  beforeEach(() => jest.clearAllMocks());

  it('200 — returns the authenticated user', async () => {
    const user = makeUser({ id: 1 });
    mockUserService.findById.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1 });
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 — invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer invalid.token.here' });

    expect(res.status).toBe(401);
  });

  it('404 — user deleted between login and request', async () => {
    mockUserService.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
  });
});
