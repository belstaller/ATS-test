import { Request, Response, NextFunction } from 'express';
import * as applicantService from '../services/applicantService';

export async function getAllApplicants(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const applicants = await applicantService.findAll();
    res.json(applicants);
  } catch (error) {
    next(error);
  }
}

export async function getApplicantById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const applicant = await applicantService.findById(parseInt(id));

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
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const applicantData = req.body;
    const newApplicant = await applicantService.create(applicantData);
    res.status(201).json(newApplicant);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const applicantData = req.body;
    const updatedApplicant = await applicantService.update(parseInt(id), applicantData);

    if (!updatedApplicant) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.json(updatedApplicant);
  } catch (error) {
    next(error);
  }
}

export async function deleteApplicant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await applicantService.remove(parseInt(id));

    if (!deleted) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
