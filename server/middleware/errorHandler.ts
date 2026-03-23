import { Request, Response, NextFunction } from 'express';

interface ErrorWithStatus extends Error {
  status?: number;
}

/**
 * Centralised Express error handler.
 *
 * Produces a flat, consistent error envelope:
 *   { "error": "<message>", "status": <http-status-code> }
 *
 * In development mode the `stack` field is also included.
 */
export function errorHandler(
  err: ErrorWithStatus,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    status,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
