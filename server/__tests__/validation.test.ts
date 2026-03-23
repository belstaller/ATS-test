/**
 * Unit tests for the validation middleware.
 *
 * Each validator is exercised directly by creating minimal Express apps,
 * keeping the tests fast and free of any external dependencies.
 */

import request from 'supertest';
import express, { Application, Request, Response, RequestHandler } from 'express';
import {
  validateIdParam,
  validateRegister,
  validateLogin,
  validateCreateApplicant,
  validateUpdateApplicant,
  validateApplicantStatus,
  validateApplicantQuery,
  validateUserQuery,
  validateCreateNote,
  validateUpdateNote,
  validateNoteIdParam,
} from '../middleware/validation';

// ---------------------------------------------------------------------------
// Helper: creates a minimal app that runs the given middleware then echoes 200
// ---------------------------------------------------------------------------
function makeApp(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  ...middleware: RequestHandler[]
): Application {
  const app = express();
  app.use(express.json());
  app[method](path, ...middleware, (_req: Request, res: Response) =>
    res.json({ ok: true })
  );
  return app;
}

// ---------------------------------------------------------------------------
// validateIdParam
// ---------------------------------------------------------------------------

describe('validateIdParam', () => {
  const app = makeApp('get', '/:id', validateIdParam);

  it('passes for a positive integer', async () => {
    const res = await request(app).get('/42');
    expect(res.status).toBe(200);
  });

  it('rejects zero', async () => {
    const res = await request(app).get('/0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });

  it('rejects a negative number', async () => {
    const res = await request(app).get('/-1');
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric string', async () => {
    const res = await request(app).get('/abc');
    expect(res.status).toBe(400);
  });

  it('rejects a float', async () => {
    const res = await request(app).get('/1.5');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateRegister
// ---------------------------------------------------------------------------

describe('validateRegister', () => {
  const app = makeApp('post', '/', validateRegister);
  const base = { name: 'Alice', email: 'alice@test.com', password: 'secret123' };

  it('passes valid registration data', async () => {
    expect((await request(app).post('/').send(base)).status).toBe(200);
  });

  it('rejects empty name', async () => {
    expect(
      (await request(app).post('/').send({ ...base, name: '' })).status
    ).toBe(400);
  });

  it('rejects name longer than 255 chars', async () => {
    expect(
      (await request(app).post('/').send({ ...base, name: 'a'.repeat(256) })).status
    ).toBe(400);
  });

  it('rejects invalid email', async () => {
    expect(
      (await request(app).post('/').send({ ...base, email: 'not-email' })).status
    ).toBe(400);
  });

  it('rejects short password', async () => {
    expect(
      (await request(app).post('/').send({ ...base, password: 'hi' })).status
    ).toBe(400);
  });

  it('rejects invalid role', async () => {
    const res = await request(app).post('/').send({ ...base, role: 'god' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('accepts valid role values', async () => {
    for (const role of ['admin', 'recruiter', 'viewer']) {
      expect(
        (await request(app).post('/').send({ ...base, role })).status
      ).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// validateLogin
// ---------------------------------------------------------------------------

describe('validateLogin', () => {
  const app = makeApp('post', '/', validateLogin);

  it('passes valid login data', async () => {
    const res = await request(app)
      .post('/')
      .send({ email: 'alice@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
  });

  it('rejects missing email', async () => {
    const res = await request(app).post('/').send({ password: 'secret123' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/')
      .send({ email: 'bad', password: 'secret123' });
    expect(res.status).toBe(400);
  });

  it('rejects missing password', async () => {
    const res = await request(app).post('/').send({ email: 'alice@test.com' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateCreateApplicant
// ---------------------------------------------------------------------------

describe('validateCreateApplicant', () => {
  const app = makeApp('post', '/', validateCreateApplicant);
  const base = { name: 'Bob', email: 'bob@test.com' };

  it('passes minimal valid body', async () => {
    expect((await request(app).post('/').send(base)).status).toBe(200);
  });

  it('passes full valid body', async () => {
    const res = await request(app)
      .post('/')
      .send({
        ...base,
        phone: '+1 555-0100',
        position: 'Dev',
        status: 'applied',
        resume_url: 'https://example.com/cv.pdf',
      });
    expect(res.status).toBe(200);
  });

  it('rejects missing name', async () => {
    const res = await request(app).post('/').send({ email: base.email });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/').send({ ...base, email: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rejects invalid phone', async () => {
    const res = await request(app).post('/').send({ ...base, phone: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it('rejects empty position string', async () => {
    const res = await request(app).post('/').send({ ...base, position: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it('rejects invalid status', async () => {
    const res = await request(app).post('/').send({ ...base, status: 'pending' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('rejects non-http resume_url', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...base, resume_url: 'ftp://files.example.com/cv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume_url/i);
  });

  it('accepts null phone (explicit nullability)', async () => {
    const res = await request(app).post('/').send({ ...base, phone: null });
    expect(res.status).toBe(200);
  });

  it('accepts null resume_url', async () => {
    const res = await request(app).post('/').send({ ...base, resume_url: null });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// validateUpdateApplicant
// ---------------------------------------------------------------------------

describe('validateUpdateApplicant', () => {
  const app = makeApp('patch', '/', validateUpdateApplicant);

  it('passes a single valid field', async () => {
    expect(
      (await request(app).patch('/').send({ name: 'New Name' })).status
    ).toBe(200);
  });

  it('rejects empty body', async () => {
    const res = await request(app).patch('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one field/i);
  });

  it('rejects invalid email in update', async () => {
    const res = await request(app).patch('/').send({ email: 'bad-format' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid status in update', async () => {
    const res = await request(app).patch('/').send({ status: 'alien' });
    expect(res.status).toBe(400);
  });

  it('passes all valid statuses', async () => {
    for (const status of ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']) {
      expect(
        (await request(app).patch('/').send({ status })).status
      ).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// validateApplicantStatus
// ---------------------------------------------------------------------------

describe('validateApplicantStatus', () => {
  const app = makeApp('patch', '/', validateApplicantStatus);

  it('passes for each valid status', async () => {
    for (const status of ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']) {
      expect(
        (await request(app).patch('/').send({ status })).status
      ).toBe(200);
    }
  });

  it('rejects an unknown status', async () => {
    const res = await request(app).patch('/').send({ status: 'processing' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('rejects missing status field', async () => {
    const res = await request(app).patch('/').send({});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateApplicantQuery
// ---------------------------------------------------------------------------

describe('validateApplicantQuery', () => {
  const app = makeApp('get', '/', validateApplicantQuery);

  it('passes with no query params', async () => {
    expect((await request(app).get('/')).status).toBe(200);
  });

  it('passes with valid status filter', async () => {
    expect((await request(app).get('/?status=hired')).status).toBe(200);
  });

  it('passes with pagination params', async () => {
    expect((await request(app).get('/?page=1&limit=10')).status).toBe(200);
  });

  it('rejects invalid status value', async () => {
    const res = await request(app).get('/?status=unknown');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('rejects non-positive page', async () => {
    const res = await request(app).get('/?page=0');
    expect(res.status).toBe(400);
  });

  it('rejects string limit', async () => {
    const res = await request(app).get('/?limit=many');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateUserQuery
// ---------------------------------------------------------------------------

describe('validateUserQuery', () => {
  const app = makeApp('get', '/', validateUserQuery);

  it('passes with no query params', async () => {
    expect((await request(app).get('/')).status).toBe(200);
  });

  it('passes with valid role', async () => {
    for (const role of ['admin', 'recruiter', 'viewer']) {
      expect((await request(app).get(`/?role=${role}`)).status).toBe(200);
    }
  });

  it('rejects invalid role value', async () => {
    const res = await request(app).get('/?role=superuser');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('rejects non-integer page', async () => {
    expect((await request(app).get('/?page=abc')).status).toBe(400);
  });

  it('rejects non-positive limit', async () => {
    expect((await request(app).get('/?limit=-10')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateNoteIdParam
// ---------------------------------------------------------------------------

describe('validateNoteIdParam', () => {
  const app = makeApp('get', '/:noteId', validateNoteIdParam);

  it('passes for a positive integer', async () => {
    const res = await request(app).get('/7');
    expect(res.status).toBe(200);
  });

  it('rejects zero', async () => {
    const res = await request(app).get('/0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/noteId/i);
  });

  it('rejects a non-numeric string', async () => {
    const res = await request(app).get('/abc');
    expect(res.status).toBe(400);
  });

  it('rejects a negative integer', async () => {
    const res = await request(app).get('/-3');
    expect(res.status).toBe(400);
  });

  it('rejects a float', async () => {
    const res = await request(app).get('/2.5');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateCreateNote
// ---------------------------------------------------------------------------

describe('validateCreateNote', () => {
  const app = makeApp('post', '/', validateCreateNote);

  it('passes a valid note body', async () => {
    const res = await request(app).post('/').send({ body: 'Great candidate.' });
    expect(res.status).toBe(200);
  });

  it('rejects missing body field', async () => {
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('rejects empty string body', async () => {
    const res = await request(app).post('/').send({ body: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('rejects whitespace-only body', async () => {
    const res = await request(app).post('/').send({ body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('rejects body exceeding 10,000 characters', async () => {
    const res = await request(app).post('/').send({ body: 'x'.repeat(10_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10,000/i);
  });

  it('accepts a body of exactly 10,000 characters', async () => {
    const res = await request(app).post('/').send({ body: 'x'.repeat(10_000) });
    expect(res.status).toBe(200);
  });

  it('rejects a non-string body', async () => {
    const res = await request(app).post('/').send({ body: 42 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// validateUpdateNote
// ---------------------------------------------------------------------------

describe('validateUpdateNote', () => {
  const app = makeApp('patch', '/', validateUpdateNote);

  it('passes a valid body', async () => {
    const res = await request(app).patch('/').send({ body: 'Updated content.' });
    expect(res.status).toBe(200);
  });

  it('rejects missing body field', async () => {
    const res = await request(app).patch('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('rejects empty string', async () => {
    const res = await request(app).patch('/').send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('rejects body exceeding 10,000 characters', async () => {
    const res = await request(app).patch('/').send({ body: 'y'.repeat(10_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10,000/i);
  });

  it('accepts a body of exactly 10,000 characters', async () => {
    const res = await request(app).patch('/').send({ body: 'y'.repeat(10_000) });
    expect(res.status).toBe(200);
  });
});
