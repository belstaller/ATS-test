import { Response, NextFunction } from 'express';
import * as applicantService from '../services/applicantService';
import { AuthRequest } from '../middleware/auth';
import { ApplicantFilters } from '../types/applicant';

export async function getAllApplicants(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, position, search, page, limit } = req.query as Record<
      string,
      string | undefined
    >;

    const filters: ApplicantFilters = {
      status: status as ApplicantFilters['status'],
      position,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    const result = await applicantService.findAll(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getApplicantById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const applicant = await applicantService.findById(parseInt(req.params.id, 10));

    if (!applicant) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.json(applicant);
  } catch (error) {
    next(error);
  }
}

export async function createApplicant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const newApplicant = await applicantService.create(req.body);
    res.status(201).json(newApplicant);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const updated = await applicantService.update(parseInt(req.params.id, 10), req.body);

    if (!updated) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/applicants/:id/status
 * Convenience endpoint to advance an applicant through the hiring pipeline.
 * Only the `status` field is changed; all other fields remain untouched.
 */
export async function updateApplicantStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status } = req.body as { status: string };
    const updated = await applicantService.updateStatus(
      parseInt(req.params.id, 10),
      status as Parameters<typeof applicantService.updateStatus>[1]
    );

    if (!updated) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteApplicant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const deleted = await applicantService.remove(parseInt(req.params.id, 10));

    if (!deleted) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
