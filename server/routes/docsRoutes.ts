/**
 * Documentation Routes
 * --------------------
 * GET /api/docs/openapi.json  — Serves the OpenAPI 3.0 specification.
 *
 * This endpoint is intentionally unauthenticated so that developer tooling
 * (Swagger UI, Redoc, Postman, etc.) can fetch the spec without credentials.
 */

import { Router, Request, Response } from 'express';
import { openApiSpec } from '../openapi';

const router = Router();

router.get('/openapi.json', (_req: Request, res: Response): void => {
  res.json(openApiSpec);
});

export default router;
