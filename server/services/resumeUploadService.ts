/**
 * Resume Upload Service
 * ---------------------
 * Handles the storage and text-extraction pipeline for uploaded resume files.
 *
 * Supported formats
 * ─────────────────
 * • PDF  — extracted via pdf-parse
 * • DOCX — extracted via mammoth (raw-text mode)
 * • TXT  — read directly from the stored buffer / path
 *
 * Design goals
 * ─────────────
 * • Files are written to an isolated upload directory
 *   (`RESUME_UPLOAD_DIR` env var, default: `./uploads/resumes`).
 * • Stored filenames are UUID-based to prevent collisions and to avoid
 *   exposing original names on disk.
 * • The DB record (resume_uploads) persists metadata independently of the
 *   file so it survives moves/restores without losing audit history.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mammoth from 'mammoth';
// pdf-parse uses `export =` (CommonJS-style); this import syntax is required
// when `esModuleInterop` is enabled and `allowSyntheticDefaultImports` is true.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import pool from '../db/config';
import { ResumeUpload, ResumeMimeType } from '../types/resume';

// ---------------------------------------------------------------------------
// Upload directory
// ---------------------------------------------------------------------------

/**
 * Resolves and ensures the resume upload directory exists.
 * Uses the `RESUME_UPLOAD_DIR` environment variable when set;
 * defaults to `<project-root>/uploads/resumes`.
 */
export function getUploadDir(): string {
  const dir = process.env.RESUME_UPLOAD_DIR
    ? path.resolve(process.env.RESUME_UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads', 'resumes');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a resume file buffer based on its MIME type.
 *
 * @param buffer   Raw file bytes.
 * @param mimeType One of the three accepted MIME types.
 * @returns        Extracted plain text (may be empty for blank documents).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: ResumeMimeType
): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      const data = await pdfParse(buffer);
      return data.text;
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case 'text/plain': {
      return buffer.toString('utf-8');
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Writes the upload buffer to disk under a collision-safe UUID filename,
 * preserving the correct file extension.
 *
 * @param buffer        Raw file bytes.
 * @param originalName  Original filename (used only to derive the extension).
 * @returns             `{ storedFilename, filePath }` for the saved file.
 */
export function saveFileToDisk(
  buffer: Buffer,
  originalName: string
): { storedFilename: string; filePath: string } {
  const ext = path.extname(originalName).toLowerCase();
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  const uploadDir = getUploadDir();
  const filePath = path.join(uploadDir, storedFilename);

  fs.writeFileSync(filePath, buffer);

  return { storedFilename, filePath };
}

/**
 * Inserts a resume upload record into the `resume_uploads` table and returns
 * the newly created row.
 */
export async function createResumeUploadRecord(params: {
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  mimeType: ResumeMimeType;
  fileSize: number;
  uploadedBy: number;
  applicantId?: number;
}): Promise<ResumeUpload> {
  const {
    originalFilename,
    storedFilename,
    filePath,
    mimeType,
    fileSize,
    uploadedBy,
    applicantId,
  } = params;

  const result = await pool.query<ResumeUpload>(
    `INSERT INTO resume_uploads
       (original_filename, stored_filename, file_path, mime_type,
        file_size, uploaded_by, applicant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      originalFilename,
      storedFilename,
      filePath,
      mimeType,
      fileSize,
      uploadedBy,
      applicantId ?? null,
    ]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// High-level upload orchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full resume upload pipeline:
 *   1. Save the file buffer to disk.
 *   2. Extract plain text for downstream parsing.
 *   3. Persist the upload metadata to the database.
 *
 * @param params.buffer          Raw file bytes from multer's memory storage.
 * @param params.originalname    Original filename from the client.
 * @param params.mimetype        Validated MIME type.
 * @param params.size            File size in bytes.
 * @param params.uploadedBy      Authenticated user id.
 * @param params.applicantId     Optional applicant to associate the upload with.
 *
 * @returns  The persisted {@link ResumeUpload} record and the extracted text.
 */
export async function uploadResume(params: {
  buffer: Buffer;
  originalname: string;
  mimetype: ResumeMimeType;
  size: number;
  uploadedBy: number;
  applicantId?: number;
}): Promise<{ upload: ResumeUpload; extractedText: string }> {
  const { buffer, originalname, mimetype, size, uploadedBy, applicantId } = params;

  // 1. Persist to disk
  const { storedFilename, filePath } = saveFileToDisk(buffer, originalname);

  // 2. Extract text — if extraction fails we still keep the stored file
  //    but surface a meaningful error to the caller.
  let extractedText: string;
  try {
    extractedText = await extractTextFromBuffer(buffer, mimetype);
  } catch (extractErr) {
    // Best-effort cleanup: remove the file if we can't extract text
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
    const message =
      extractErr instanceof Error ? extractErr.message : String(extractErr);
    throw new Error(`Failed to extract text from resume: ${message}`);
  }

  // 3. Persist metadata to DB
  const upload = await createResumeUploadRecord({
    originalFilename: originalname,
    storedFilename,
    filePath,
    mimeType: mimetype,
    fileSize: size,
    uploadedBy,
    applicantId,
  });

  return { upload, extractedText };
}
