import { Router } from 'express';
import { getAllUsers, getUserById, updateUserRole, deleteUser } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All user management routes require authentication + admin role
router.use(authenticate, authorize('admin'));

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.patch('/:id/role', updateUserRole);
router.delete('/:id', deleteUser);

export default router;
