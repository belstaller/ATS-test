/**
 * Functional tests for infrastructure endpoints.
 *
 * Covers:
 *  GET /api/health            — application liveness check (unauthenticated)
 *  GET /api/docs/openapi.json — OpenAPI specification (unauthenticated)
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import docsRoutes from '../routes/docsRoutes';
import { openApiSpec } from '../openapi';

// ---------------------------------------------------------------------------
// Minimal test app
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());

  // Health endpoint (mirrors server/index.ts)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Docs endpoint
  app.use('/api/docs', docsRoutes);

  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('200 — returns status ok without authentication', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('200 — response includes an ISO-8601 timestamp', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.timestamp).toBe('string');
    expect(() => new Date(res.body.timestamp)).not.toThrow();
    // Validate it is a real ISO date
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('200 — response includes process uptime as a number', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/docs/openapi.json
// ---------------------------------------------------------------------------

describe('GET /api/docs/openapi.json', () => {
  it('200 — returns the OpenAPI specification as JSON without authentication', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('200 — spec declares openapi 3.0.x', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.0\./);
  });

  it('200 — spec includes info with title and version', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.body.info).toMatchObject({
      title: expect.any(String),
      version: expect.any(String),
    });
  });

  it('200 — spec declares bearerAuth security scheme', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.body.components.securitySchemes).toHaveProperty('bearerAuth');
    expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('200 — spec contains applicant, note, user and db paths', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    const paths = Object.keys(res.body.paths);
    expect(paths).toContain('/applicants');
    expect(paths).toContain('/applicants/{id}');
    expect(paths).toContain('/applicants/{id}/notes');
    expect(paths).toContain('/applicants/{id}/notes/{noteId}');
    expect(paths).toContain('/users');
    expect(paths).toContain('/auth/login');
    expect(paths).toContain('/auth/register');
    expect(paths).toContain('/db/health');
    expect(paths).toContain('/db/backups');
  });

  it('200 — spec body matches the exported openApiSpec object', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    // Deep equality check (JSON round-trip safe)
    expect(res.body).toEqual(JSON.parse(JSON.stringify(openApiSpec)));
  });

  it('200 — all defined tags are documented', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    const tagNames = (res.body.tags as Array<{ name: string }>).map((t) => t.name);
    expect(tagNames).toContain('Health');
    expect(tagNames).toContain('Auth');
    expect(tagNames).toContain('Applicants');
    expect(tagNames).toContain('Notes');
    expect(tagNames).toContain('Users');
    expect(tagNames).toContain('Database');
  });
});
