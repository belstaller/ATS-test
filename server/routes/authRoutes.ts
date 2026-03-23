import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validateRegister, validateLogin } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/auth/register  — stricter rate limit to prevent account enumeration
router.post('/register', authLimiter, validateRegister, register);

// POST /api/auth/login  — stricter rate limit to prevent brute-force attacks
router.post('/login', authLimiter, validateLogin, login);

// GET /api/auth/me  — returns the currently authenticated user
router.get('/me', authenticate, getMe);

export default router;
