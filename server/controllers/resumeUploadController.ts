import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { uploadResume } from '../services/resumeUploadService';
import { ResumeMimeType } from '../types/resume';

/**
 * POST /api/resume/upload
 *
 * Accepts a multipart/form-data request containing a single `resume` file
 * (PDF, DOCX, or TXT).  Saves the file to disk, extracts its plain-text
 * content, persists the upload metadata to the database, and returns the
 * stored record together with the extracted text so the caller can
 * immediately feed it into the resume parser if desired.
 *
 * Roles allowed: admin, recruiter
 */
export async function uploadResumeHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // req.file is guaranteed by validateResumeUpload (runs before this handler)
    const file = req.file!;

    const rawApplicantId =
      (req.body as Record<string, unknown>).applicant_id;
    const applicantId =
      rawApplicantId !== undefined &&
      rawApplicantId !== null &&
      rawApplicantId !== ''
        ? Number(rawApplicantId)
        : undefined;

    const { upload, extractedText } = await uploadResume({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype as ResumeMimeType,
      size: file.size,
      uploadedBy: req.user!.userId,
      applicantId,
    });

    res.status(201).json({
      upload,
      extractedText,
    });
  } catch (error) {
    next(error);
  }
}
