/**
 * User Management Routes
 * ----------------------
 * Base path: /api/users
 *
 * All routes require authentication + admin role.
 *
 * GET    /          — List users (paginated, filterable by role, searchable)
 * GET    /:id       — Get a single user by id
 * PATCH  /:id/role  — Change a user's role
 * DELETE /:id       — Remove a user
 */

import { Router } from 'express';
import { getAllUsers, getUserById, updateUserRole, deleteUser } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam, validateUserQuery } from '../middleware/validation';

const router = Router();

// All user management routes require authentication + admin role
router.use(authenticate, authorize('admin'));

router.get('/', validateUserQuery, getAllUsers);
router.get('/:id', validateIdParam, getUserById);
router.patch('/:id/role', validateIdParam, updateUserRole);
router.delete('/:id', validateIdParam, deleteUser);

export default router;
