/**
 * Tests for the Resume Upload feature.
 *
 * Covers:
 *  Unit — resumeUploadService helpers
 *    getUploadDir, saveFileToDisk, extractTextFromBuffer,
 *    createResumeUploadRecord, uploadResume
 *
 *  Validation — resumeUpload multer middleware + validateResumeUpload +
 *               handleUploadError
 *
 *  Integration — POST /api/resume/upload HTTP endpoint
 *    • Auth & RBAC
 *    • Accepted file formats (PDF, DOCX, TXT)
 *    • Rejection of unsupported formats
 *    • File-size limit enforcement
 *    • Missing file / empty file
 *    • Optional applicant_id association
 *    • Response shape validation
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';

// ── Service under test ─────────────────────────────────────────────────────
import {
  getUploadDir,
  saveFileToDisk,
  extractTextFromBuffer,
  uploadResume,
} from '../services/resumeUploadService';

// ── Middleware under test (imported to ensure they are covered by jest) ────
// The middleware functions are exercised indirectly via the HTTP integration
// tests; they do not need to be called directly in unit tests here.
import '../middleware/validation';

// ── Routes ─────────────────────────────────────────────────────────────────
import resumeParserRoutes from '../routes/resumeParserRoutes';
import { errorHandler } from '../middleware/errorHandler';

// ── Test helpers ───────────────────────────────────────────────────────────
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
} from './helpers';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the DB pool so no real database is required
jest.mock('../db/config', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockPool,
    primaryPool: mockPool,
    replicaPool: mockPool,
  };
});

// Mock pdf-parse so tests don't need a real PDF binary
jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: 'Extracted PDF text content' })
);

// Mock mammoth so tests don't need a real DOCX binary
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'Extracted DOCX text content' }),
}));

import pool from '../db/config';

// Cast mocked modules to jest.Mock for type-safe mock access
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as { extractRawText: jest.Mock };

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/resume', resumeParserRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TXT_CONTENT = 'Alice Johnson\nalice@example.com\nSoftware Engineer\n5 years experience';
const TXT_BUFFER = Buffer.from(TXT_CONTENT, 'utf-8');
const PDF_BUFFER = Buffer.from('%PDF-1.4 fake pdf content');
const DOCX_BUFFER = Buffer.from('PK fake docx content'); // DOCX are ZIP archives

const MOCK_UPLOAD_RECORD = {
  id: 1,
  original_filename: 'resume.pdf',
  stored_filename: 'abc123.pdf',
  file_path: '/tmp/uploads/resumes/abc123.pdf',
  mime_type: 'application/pdf',
  file_size: 1024,
  uploaded_by: 1,
  applicant_id: null,
  created_at: new Date('2024-01-01T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a temp directory that is cleaned up after each test. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ats-resume-test-'));
}

// ---------------------------------------------------------------------------
// Unit tests — getUploadDir()
// ---------------------------------------------------------------------------

describe('getUploadDir()', () => {
  const originalEnv = process.env.RESUME_UPLOAD_DIR;

  afterEach(() => {
    process.env.RESUME_UPLOAD_DIR = originalEnv;
  });

  it('returns the default upload directory when env var is not set', () => {
    delete process.env.RESUME_UPLOAD_DIR;
    const dir = getUploadDir();
    expect(dir).toContain(path.join('uploads', 'resumes'));
  });

  it('uses RESUME_UPLOAD_DIR env var when set', () => {
    const tmpDir = makeTempDir();
    process.env.RESUME_UPLOAD_DIR = tmpDir;
    const dir = getUploadDir();
    expect(dir).toBe(path.resolve(tmpDir));
    fs.rmdirSync(tmpDir, { recursive: true } as fs.RmDirOptions);
  });

  it('creates the directory if it does not exist', () => {
    const tmpBase = makeTempDir();
    const newDir = path.join(tmpBase, 'new-upload-dir');
    process.env.RESUME_UPLOAD_DIR = newDir;
    expect(fs.existsSync(newDir)).toBe(false);
    getUploadDir();
    expect(fs.existsSync(newDir)).toBe(true);
    fs.rmdirSync(tmpBase, { recursive: true } as fs.RmDirOptions);
  });

  it('returns a string', () => {
    expect(typeof getUploadDir()).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — saveFileToDisk()
// ---------------------------------------------------------------------------

describe('saveFileToDisk()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    process.env.RESUME_UPLOAD_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir, { recursive: true } as fs.RmDirOptions);
    delete process.env.RESUME_UPLOAD_DIR;
  });

  it('writes the buffer to disk', () => {
    const { filePath } = saveFileToDisk(TXT_BUFFER, 'resume.txt');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(TXT_BUFFER);
  });

  it('returns a stored filename with the correct extension', () => {
    const { storedFilename } = saveFileToDisk(TXT_BUFFER, 'my-resume.txt');
    expect(storedFilename.endsWith('.txt')).toBe(true);
  });

  it('returns a stored filename that differs from the original', () => {
    const { storedFilename } = saveFileToDisk(TXT_BUFFER, 'resume.txt');
    expect(storedFilename).not.toBe('resume.txt');
  });

  it('generates unique filenames for concurrent saves', () => {
    const { storedFilename: a } = saveFileToDisk(TXT_BUFFER, 'resume.pdf');
    const { storedFilename: b } = saveFileToDisk(TXT_BUFFER, 'resume.pdf');
    expect(a).not.toBe(b);
  });

  it('preserves the .pdf extension', () => {
    const { storedFilename } = saveFileToDisk(PDF_BUFFER, 'cv.pdf');
    expect(storedFilename.endsWith('.pdf')).toBe(true);
  });

  it('preserves the .docx extension', () => {
    const { storedFilename } = saveFileToDisk(DOCX_BUFFER, 'cv.docx');
    expect(storedFilename.endsWith('.docx')).toBe(true);
  });

  it('returns a filePath inside the upload directory', () => {
    const { filePath } = saveFileToDisk(TXT_BUFFER, 'resume.txt');
    expect(filePath.startsWith(tmpDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractTextFromBuffer()
// ---------------------------------------------------------------------------

describe('extractTextFromBuffer()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts text from a TXT buffer directly', async () => {
    const text = await extractTextFromBuffer(TXT_BUFFER, 'text/plain');
    expect(text).toBe(TXT_CONTENT);
  });

  it('calls pdf-parse for PDF buffers and returns its text', async () => {
    const text = await extractTextFromBuffer(PDF_BUFFER, 'application/pdf');
    expect(pdfParse).toHaveBeenCalledWith(PDF_BUFFER);
    expect(text).toBe('Extracted PDF text content');
  });

  it('calls mammoth.extractRawText for DOCX buffers and returns its value', async () => {
    const text = await extractTextFromBuffer(
      DOCX_BUFFER,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer: DOCX_BUFFER });
    expect(text).toBe('Extracted DOCX text content');
  });

  it('returns a string for TXT input', async () => {
    const text = await extractTextFromBuffer(TXT_BUFFER, 'text/plain');
    expect(typeof text).toBe('string');
  });

  it('returns a string for PDF input', async () => {
    const text = await extractTextFromBuffer(PDF_BUFFER, 'application/pdf');
    expect(typeof text).toBe('string');
  });

  it('returns a string for DOCX input', async () => {
    const text = await extractTextFromBuffer(
      DOCX_BUFFER,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(typeof text).toBe('string');
  });

  it('propagates errors thrown by pdf-parse', async () => {
    pdfParse.mockRejectedValueOnce(new Error('Corrupt PDF'));
    await expect(
      extractTextFromBuffer(PDF_BUFFER, 'application/pdf')
    ).rejects.toThrow('Corrupt PDF');
  });

  it('propagates errors thrown by mammoth', async () => {
    mammoth.extractRawText.mockRejectedValueOnce(new Error('Corrupt DOCX'));
    await expect(
      extractTextFromBuffer(
        DOCX_BUFFER,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).rejects.toThrow('Corrupt DOCX');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — uploadResume() service orchestration
// ---------------------------------------------------------------------------

describe('uploadResume()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    process.env.RESUME_UPLOAD_DIR = tmpDir;
    jest.clearAllMocks();

    // Mock the DB insert to return a fake record
    (pool.query as jest.Mock).mockResolvedValue({ rows: [MOCK_UPLOAD_RECORD] });
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir, { recursive: true } as fs.RmDirOptions);
    delete process.env.RESUME_UPLOAD_DIR;
  });

  it('returns the upload DB record and extracted text for a TXT file', async () => {
    const { upload, extractedText } = await uploadResume({
      buffer: TXT_BUFFER,
      originalname: 'resume.txt',
      mimetype: 'text/plain',
      size: TXT_BUFFER.length,
      uploadedBy: 1,
    });

    expect(upload).toEqual(MOCK_UPLOAD_RECORD);
    expect(extractedText).toBe(TXT_CONTENT);
  });

  it('calls pool.query with the correct parameters', async () => {
    await uploadResume({
      buffer: TXT_BUFFER,
      originalname: 'cv.txt',
      mimetype: 'text/plain',
      size: TXT_BUFFER.length,
      uploadedBy: 42,
      applicantId: 7,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO resume_uploads/i);
    expect(params).toContain('cv.txt');         // original_filename
    expect(params).toContain('text/plain');      // mime_type
    expect(params).toContain(42);               // uploaded_by
    expect(params).toContain(7);               // applicant_id
  });

  it('writes the file to disk', async () => {
    await uploadResume({
      buffer: TXT_BUFFER,
      originalname: 'resume.txt',
      mimetype: 'text/plain',
      size: TXT_BUFFER.length,
      uploadedBy: 1,
    });

    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0].endsWith('.txt')).toBe(true);
  });

  it('passes applicantId as null when omitted', async () => {
    await uploadResume({
      buffer: TXT_BUFFER,
      originalname: 'resume.txt',
      mimetype: 'text/plain',
      size: TXT_BUFFER.length,
      uploadedBy: 1,
    });

    const params = (pool.query as jest.Mock).mock.calls[0][1] as unknown[];
    // applicant_id is the 7th parameter (index 6)
    expect(params[6]).toBeNull();
  });

  it('cleans up the disk file and throws when text extraction fails', async () => {
    pdfParse.mockRejectedValueOnce(new Error('Bad PDF'));

    await expect(
      uploadResume({
        buffer: PDF_BUFFER,
        originalname: 'bad.pdf',
        mimetype: 'application/pdf',
        size: PDF_BUFFER.length,
        uploadedBy: 1,
      })
    ).rejects.toThrow('Failed to extract text from resume');

    // File should be cleaned up
    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(0);

    // DB should NOT have been called
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration tests — POST /api/resume/upload
// ---------------------------------------------------------------------------

describe('POST /api/resume/upload', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    process.env.RESUME_UPLOAD_DIR = tmpDir;
    jest.clearAllMocks();

    (pool.query as jest.Mock).mockResolvedValue({ rows: [MOCK_UPLOAD_RECORD] });
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir, { recursive: true } as fs.RmDirOptions);
    delete process.env.RESUME_UPLOAD_DIR;
  });

  // ── Auth / RBAC ─────────────────────────────────────────────────────────

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(401);
  });

  it('403 — viewer cannot upload a resume', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(viewerToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(403);
  });

  it('201 — recruiter can upload a TXT resume', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(recruiterToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
  });

  it('201 — admin can upload a TXT resume', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
  });

  // ── Accepted formats ─────────────────────────────────────────────────────

  it('201 — accepts a PDF file', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', PDF_BUFFER, {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
  });

  it('201 — accepts a DOCX file', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', DOCX_BUFFER, {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(201);
  });

  it('201 — accepts a TXT file', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
  });

  // ── Rejected formats ─────────────────────────────────────────────────────

  it('400 — rejects an image file (PNG)', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', pngBuffer, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
  });

  it('400 — rejects an HTML file', async () => {
    const htmlBuffer = Buffer.from('<html><body>hello</body></html>');
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', htmlBuffer, { filename: 'resume.html', contentType: 'text/html' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
  });

  it('400 — rejects a JSON file', async () => {
    const jsonBuffer = Buffer.from('{"name":"Alice"}');
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', jsonBuffer, {
        filename: 'resume.json',
        contentType: 'application/json',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
  });

  // ── Missing / empty file ─────────────────────────────────────────────────

  it('400 — missing resume field returns descriptive error', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .set('Content-Type', 'multipart/form-data');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume file is required/i);
  });

  it('400 — empty file is rejected', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', emptyBuffer, { filename: 'empty.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must not be empty/i);
  });

  // ── File-size limit ──────────────────────────────────────────────────────

  it('400 — file exceeding 10 MB is rejected', async () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', bigBuffer, {
        filename: 'huge.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file too large/i);
  });

  // ── applicant_id association ─────────────────────────────────────────────

  it('201 — accepts a valid applicant_id in body', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .field('applicant_id', '5')
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);

    // Verify that applicant_id was passed to the DB insert
    const params = (pool.query as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params).toContain(5);
  });

  it('400 — rejects a non-integer applicant_id', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .field('applicant_id', 'abc')
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicant_id/i);
  });

  it('400 — rejects a zero applicant_id', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .field('applicant_id', '0')
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicant_id/i);
  });

  it('400 — rejects a negative applicant_id', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .field('applicant_id', '-3')
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applicant_id/i);
  });

  // ── Response shape ───────────────────────────────────────────────────────

  it('201 — response contains upload record and extractedText', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('upload');
    expect(res.body).toHaveProperty('extractedText');
  });

  it('201 — upload record contains expected fields', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    const { upload } = res.body as {
      upload: Record<string, unknown>;
      extractedText: string;
    };

    expect(typeof upload.id).toBe('number');
    expect(typeof upload.original_filename).toBe('string');
    expect(typeof upload.stored_filename).toBe('string');
    expect(typeof upload.file_path).toBe('string');
    expect(typeof upload.mime_type).toBe('string');
    expect(typeof upload.file_size).toBe('number');
    expect(typeof upload.uploaded_by).toBe('number');
  });

  it('201 — extractedText is a string for TXT uploads', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    expect(typeof res.body.extractedText).toBe('string');
    expect(res.body.extractedText).toBe(TXT_CONTENT);
  });

  it('201 — extractedText from PDF is returned by the mock extractor', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', PDF_BUFFER, {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.extractedText).toBe('Extracted PDF text content');
  });

  it('201 — extractedText from DOCX is returned by the mock extractor', async () => {
    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', DOCX_BUFFER, {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(201);
    expect(res.body.extractedText).toBe('Extracted DOCX text content');
  });

  // ── File stored on disk ──────────────────────────────────────────────────

  it('201 — file is written to the upload directory', async () => {
    await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0].endsWith('.txt')).toBe(true);
  });

  it('201 — stored file content matches the uploaded buffer', async () => {
    await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    const files = fs.readdirSync(tmpDir);
    const storedContent = fs.readFileSync(path.join(tmpDir, files[0]));
    expect(storedContent).toEqual(TXT_BUFFER);
  });

  // ── DB insert ────────────────────────────────────────────────────────────

  it('201 — triggers exactly one DB insert', async () => {
    await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('500 — DB failure surfaces as a server error', async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()))
      .attach('resume', TXT_BUFFER, { filename: 'resume.txt', contentType: 'text/plain' });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Validation middleware unit tests — validateResumeUpload
// ---------------------------------------------------------------------------

describe('validateResumeUpload middleware', () => {
  function makeReq(file?: Partial<Express.Multer.File>, body = {}): request.Test {
    // We test validateResumeUpload through the actual HTTP endpoint
    // since it is tightly coupled to multer's req.file population.
    // These tests exercise specific edge-cases via the integration path.
    void file;
    void body;
    return request(app)
      .post('/api/resume/upload')
      .set(authHeader(adminToken()));
  }

  it('passes when a valid file is present', async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [MOCK_UPLOAD_RECORD] });

    const res = await makeReq().attach('resume', TXT_BUFFER, {
      filename: 'resume.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(201);
  });

  it('rejects when no file field is included', async () => {
    const res = await makeReq().set('Content-Type', 'multipart/form-data');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume file is required/i);
  });
});
