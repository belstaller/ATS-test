import { Response, NextFunction } from 'express';
import * as userService from '../services/userService';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../types/user';

const VALID_ROLES: UserRole[] = ['admin', 'recruiter', 'viewer'];

export async function getAllUsers(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { role, search, page, limit } = req.query as Record<string, string | undefined>;

    const filters: userService.UserFilters = {
      role,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    const result = await userService.findAll(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getUserById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await userService.findById(parseInt(req.params.id, 10));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateUserRole(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body as { role?: unknown };

    if (!role || !VALID_ROLES.includes(role as UserRole)) {
      res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    // Prevent admins from demoting themselves
    if (req.user!.userId === parseInt(id, 10) && role !== 'admin') {
      res.status(400).json({ error: 'Admins cannot change their own role' });
      return;
    }

    const user = await userService.updateRole(parseInt(id, 10), role as string);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (req.user!.userId === parseInt(id, 10)) {
      res.status(400).json({ error: 'Admins cannot delete their own account' });
      return;
    }

    const deleted = await userService.remove(parseInt(id, 10));
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
