import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter — applied to every /api/* route.
 *
 * Allows up to 200 requests per IP per minute in production and is disabled
 * (very high ceiling) in test environments so functional tests are not
 * affected.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 10_000 : 200,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests, please try again later.' },
  skipSuccessfulRequests: false,
});

/**
 * Strict rate limiter for authentication endpoints — prevents brute-force
 * attacks against /api/auth/login and /api/auth/register.
 *
 * Allows up to 20 attempts per IP per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skipSuccessfulRequests: true, // Successful logins/registrations do not count
});
