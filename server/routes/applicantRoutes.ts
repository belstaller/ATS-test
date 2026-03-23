import { Router } from 'express';
import {
  getAllApplicants,
  getApplicantById,
  createApplicant,
  updateApplicant,
  deleteApplicant,
} from '../controllers/applicantController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All applicant routes require authentication
router.use(authenticate);

// Viewers, recruiters and admins can read
router.get('/', authorize('admin', 'recruiter', 'viewer'), getAllApplicants);
router.get('/:id', authorize('admin', 'recruiter', 'viewer'), getApplicantById);

// Only recruiters and admins can create / update
router.post('/', authorize('admin', 'recruiter'), createApplicant);
router.put('/:id', authorize('admin', 'recruiter'), updateApplicant);

// Only admins can delete
router.delete('/:id', authorize('admin'), deleteApplicant);

export default router;
