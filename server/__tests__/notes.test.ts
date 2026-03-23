/**
 * Functional tests for applicant note endpoints.
 *
 * Covers:
 *  GET    /api/applicants/:id/notes           — list notes
 *  POST   /api/applicants/:id/notes           — create note
 *  PATCH  /api/applicants/:id/notes/:noteId   — update note
 *  DELETE /api/applicants/:id/notes/:noteId   — delete note
 *
 * Both role-based access control and author-level ownership are tested.
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import applicantRoutes from '../routes/applicantRoutes';
import { errorHandler } from '../middleware/errorHandler';
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
  makeApplicant,
} from './helpers';
import { Note } from '../types/note';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------
jest.mock('../services/applicantService');
import * as applicantService from '../services/applicantService';
const mockApplicantService = applicantService as jest.Mocked<typeof applicantService>;

jest.mock('../services/noteService');
import * as noteService from '../services/noteService';
const mockNoteService = noteService as jest.Mocked<typeof noteService>;

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/applicants', applicantRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    applicant_id: 10,
    author_id: 2, // recruiterToken userId = 2
    author_name: 'Test Recruiter',
    body: 'Strong technical skills.',
    created_at: new Date('2024-06-01T00:00:00Z'),
    updated_at: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/applicants/:id/notes
// ---------------------------------------------------------------------------

describe('GET /api/applicants/:id/notes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — admin gets the note list', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    mockNoteService.findAllByApplicant.mockResolvedValue([makeNote()]);

    const res = await request(app)
      .get('/api/applicants/10/notes')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 1);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ id: 1, body: 'Strong technical skills.' });
  });

  it('200 — recruiter can list notes', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    mockNoteService.findAllByApplicant.mockResolvedValue([makeNote()]);

    const res = await request(app)
      .get('/api/applicants/10/notes')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(200);
  });

  it('200 — viewer can list notes', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    mockNoteService.findAllByApplicant.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/applicants/10/notes')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('200 — returns empty list when applicant has no notes', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    mockNoteService.findAllByApplicant.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/applicants/10/notes')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('404 — applicant does not exist', async () => {
    mockApplicantService.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/applicants/999/notes')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/applicant not found/i);
  });

  it('400 — non-integer applicant id', async () => {
    const res = await request(app)
      .get('/api/applicants/abc/notes')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/applicants/10/notes');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/applicants/:id/notes
// ---------------------------------------------------------------------------

describe('POST /api/applicants/:id/notes', () => {
  const validBody = { body: 'Excellent communication skills.' };

  beforeEach(() => jest.clearAllMocks());

  it('201 — recruiter creates a note', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    const created = makeNote({ body: validBody.body });
    mockNoteService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: validBody.body });
    // author_id comes from the token (userId=2 for recruiterToken)
    expect(mockNoteService.create).toHaveBeenCalledWith(10, 2, { body: validBody.body });
  });

  it('201 — admin creates a note', async () => {
    mockApplicantService.findById.mockResolvedValue(makeApplicant({ id: 10 }));
    const created = makeNote({ author_id: 1 });
    mockNoteService.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(201);
    // admin userId = 1
    expect(mockNoteService.create).toHaveBeenCalledWith(10, 1, { body: validBody.body });
  });

  it('404 — applicant does not exist', async () => {
    mockApplicantService.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/applicants/999/notes')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/applicant not found/i);
  });

  it('400 — missing body field', async () => {
    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(recruiterToken()))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('400 — empty body string', async () => {
    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(recruiterToken()))
      .send({ body: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('400 — body exceeds 10,000 characters', async () => {
    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(recruiterToken()))
      .send({ body: 'x'.repeat(10_001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10,000/i);
  });

  it('403 — viewer cannot create a note', async () => {
    const res = await request(app)
      .post('/api/applicants/10/notes')
      .set(authHeader(viewerToken()))
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app)
      .post('/api/applicants/10/notes')
      .send(validBody);

    expect(res.status).toBe(401);
  });

  it('400 — non-integer applicant id', async () => {
    const res = await request(app)
      .post('/api/applicants/abc/notes')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/applicants/:id/notes/:noteId
// ---------------------------------------------------------------------------

describe('PATCH /api/applicants/:id/notes/:noteId', () => {
  const validBody = { body: 'Updated note content.' };

  beforeEach(() => jest.clearAllMocks());

  it('200 — author (recruiter) can update their own note', async () => {
    // recruiterToken userId = 2
    const existingNote = makeNote({ id: 5, author_id: 2 });
    mockNoteService.findById.mockResolvedValue(existingNote);
    mockNoteService.update.mockResolvedValue({ ...existingNote, body: validBody.body });

    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.body).toBe(validBody.body);
    expect(mockNoteService.update).toHaveBeenCalledWith(5, { body: validBody.body });
  });

  it('200 — admin can update any note', async () => {
    // Note authored by recruiter (author_id=2), but admin (userId=1) edits it.
    const existingNote = makeNote({ id: 5, author_id: 2 });
    mockNoteService.findById.mockResolvedValue(existingNote);
    mockNoteService.update.mockResolvedValue({ ...existingNote, body: validBody.body });

    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(200);
  });

  it('403 — recruiter cannot edit another recruiter\'s note', async () => {
    // Note authored by viewerToken user (userId=3), recruiter (userId=2) tries to edit.
    const existingNote = makeNote({ id: 5, author_id: 3 });
    mockNoteService.findById.mockResolvedValue(existingNote);

    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .set(authHeader(recruiterToken()))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it('404 — note does not exist', async () => {
    mockNoteService.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/applicants/10/notes/999')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('400 — missing body field', async () => {
    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .set(authHeader(recruiterToken()))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('400 — non-integer noteId', async () => {
    const res = await request(app)
      .patch('/api/applicants/10/notes/xyz')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(400);
  });

  it('400 — non-integer applicant id', async () => {
    const res = await request(app)
      .patch('/api/applicants/abc/notes/5')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(400);
  });

  it('403 — viewer cannot update a note', async () => {
    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .set(authHeader(viewerToken()))
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app)
      .patch('/api/applicants/10/notes/5')
      .send(validBody);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/applicants/:id/notes/:noteId
// ---------------------------------------------------------------------------

describe('DELETE /api/applicants/:id/notes/:noteId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('204 — author (recruiter) can delete their own note', async () => {
    // recruiterToken userId = 2
    const existingNote = makeNote({ id: 5, author_id: 2 });
    mockNoteService.findById.mockResolvedValue(existingNote);
    mockNoteService.remove.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/applicants/10/notes/5')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(204);
    expect(mockNoteService.remove).toHaveBeenCalledWith(5);
  });

  it('204 — admin can delete any note', async () => {
    const existingNote = makeNote({ id: 5, author_id: 2 });
    mockNoteService.findById.mockResolvedValue(existingNote);
    mockNoteService.remove.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/applicants/10/notes/5')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(204);
  });

  it('403 — recruiter cannot delete another user\'s note', async () => {
    // Note authored by userId=3, recruiter (userId=2) tries to delete.
    const existingNote = makeNote({ id: 5, author_id: 3 });
    mockNoteService.findById.mockResolvedValue(existingNote);

    const res = await request(app)
      .delete('/api/applicants/10/notes/5')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it('404 — note does not exist', async () => {
    mockNoteService.findById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/applicants/10/notes/999')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('400 — non-integer noteId', async () => {
    const res = await request(app)
      .delete('/api/applicants/10/notes/xyz')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('400 — non-integer applicant id', async () => {
    const res = await request(app)
      .delete('/api/applicants/abc/notes/5')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(400);
  });

  it('403 — viewer cannot delete a note', async () => {
    const res = await request(app)
      .delete('/api/applicants/10/notes/5')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app).delete('/api/applicants/10/notes/5');
    expect(res.status).toBe(401);
  });
});
