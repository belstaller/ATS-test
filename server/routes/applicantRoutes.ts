import { Router } from 'express';
import {
  getAllApplicants,
  getApplicantById,
  createApplicant,
  updateApplicant,
  deleteApplicant,
} from '../controllers/applicantController';

const router = Router();

router.get('/', getAllApplicants);
router.get('/:id', getApplicantById);
router.post('/', createApplicant);
router.put('/:id', updateApplicant);
router.delete('/:id', deleteApplicant);

export default router;
