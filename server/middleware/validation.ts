import { Request, Response, NextFunction } from 'express';

export function validateApplicant(req: Request, res: Response, next: NextFunction): void {
  const { name, email } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  next();
}

export function validateRegister(req: Request, res: Response, next: NextFunction): void {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long' });
    return;
  }

  next();
}

export function validateLogin(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  next();
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
