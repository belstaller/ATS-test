import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userService from '../services/userService';
import { AuthRequest } from '../middleware/auth';
import { LoginDTO, RegisterDTO, JwtPayload } from '../types/user';

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '8h';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, role }: RegisterDTO = req.body;

    const existing = await userService.findByEmailWithPassword(email);
    if (existing) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userService.create({ name, email, password_hash, role: role });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password }: LoginDTO = req.body;

    const user = await userService.findByEmailWithPassword(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const { password_hash: _omit, ...userPublic } = user;
    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.json({ user: userPublic, token });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
}
