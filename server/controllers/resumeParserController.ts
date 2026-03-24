import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { parseResume } from '../services/resumeParserService';
import { ResumeParseRequest } from '../types/resume';

/**
 * POST /api/resume/parse
 *
 * Parses the plain-text resume content supplied in the request body and
 * returns a structured {@link ParsedResume} object containing all
 * detectable candidate fields (name, email, phone, skills, experience, etc.).
 *
 * Roles allowed: admin, recruiter
 */
export async function parseResumeHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { content } = req.body as ResumeParseRequest;
    const parsed = parseResume(content);
    res.status(200).json(parsed);
  } catch (error) {
    next(error);
  }
}
