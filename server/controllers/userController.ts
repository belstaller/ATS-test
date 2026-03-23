import { Response, NextFunction } from 'express';
import * as userService from '../services/userService';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../types/user';

const VALID_ROLES: UserRole[] = ['admin', 'recruiter', 'viewer'];

export async function getAllUsers(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await userService.findAll();
    res.json(users);
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
    const { id } = req.params;
    const user = await userService.findById(parseInt(id));
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
    const { role } = req.body;

    if (!role || !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    // Prevent admins from demoting themselves
    if (req.user!.userId === parseInt(id) && role !== 'admin') {
      res.status(400).json({ error: 'Admins cannot change their own role' });
      return;
    }

    const user = await userService.updateRole(parseInt(id), role);
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

    if (req.user!.userId === parseInt(id)) {
      res.status(400).json({ error: 'Admins cannot delete their own account' });
      return;
    }

    const deleted = await userService.remove(parseInt(id));
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
