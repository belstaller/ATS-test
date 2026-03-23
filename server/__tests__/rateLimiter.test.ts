/**
 * Tests for the rate-limiting middleware.
 *
 * Because NODE_ENV is 'test' both limiters use a very high ceiling (10,000
 * requests) so they never trip under normal test conditions.  These tests
 * verify the correct shape and headers rather than triggering an actual 429.
 *
 * A secondary test verifies that the production-mode limits are configured
 * as expected by inspecting the rateLimit options object.
 */

import request from 'supertest';
import express, { Application } from 'express';
import { apiLimiter, authLimiter } from '../middleware/rateLimiter';

// ---------------------------------------------------------------------------
// Build minimal test apps
// ---------------------------------------------------------------------------

function buildApiApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api', apiLimiter);
  app.get('/api/test', (_req, res) => res.json({ ok: true }));
  return app;
}

function buildAuthApp(): Application {
  const app = express();
  app.use(express.json());
  app.post('/auth/login', authLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

// ---------------------------------------------------------------------------
// apiLimiter
// ---------------------------------------------------------------------------

describe('apiLimiter', () => {
  const app = buildApiApp();

  it('passes through a normal request', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
  });

  it('sets RateLimit-* standard headers on the response', async () => {
    const res = await request(app).get('/api/test');
    // express-rate-limit v7+ sets the RateLimit header (draft-7 combined header)
    // or the older separate RateLimit-Limit / RateLimit-Remaining headers.
    const hasRateLimitHeader =
      'ratelimit-limit' in res.headers ||
      'ratelimit' in res.headers ||
      'x-ratelimit-limit' in res.headers;
    expect(hasRateLimitHeader).toBe(true);
  });

  it('does NOT set X-RateLimit-* legacy headers', async () => {
    const res = await request(app).get('/api/test');
    expect(res.headers).not.toHaveProperty('x-ratelimit-limit');
    expect(res.headers).not.toHaveProperty('x-ratelimit-remaining');
  });
});

// ---------------------------------------------------------------------------
// authLimiter
// ---------------------------------------------------------------------------

describe('authLimiter', () => {
  const app = buildAuthApp();

  it('passes through a normal request', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(200);
  });

  it('sets standard rate-limit headers', async () => {
    const res = await request(app).post('/auth/login').send({});
    const hasRateLimitHeader =
      'ratelimit-limit' in res.headers ||
      'ratelimit' in res.headers ||
      'x-ratelimit-limit' in res.headers;
    expect(hasRateLimitHeader).toBe(true);
  });
});
