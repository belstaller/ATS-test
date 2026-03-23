import { Response, NextFunction } from 'express';
import * as noteService from '../services/noteService';
import * as applicantService from '../services/applicantService';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/applicants/:id/notes
 * Returns all notes for the specified applicant.
 */
export async function getNotesByApplicant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const applicantId = parseInt(req.params.id, 10);

    // Confirm the applicant exists before listing its notes.
    const applicant = await applicantService.findById(applicantId);
    if (!applicant) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    const notes = await noteService.findAllByApplicant(applicantId);
    res.json({ data: notes, total: notes.length });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/applicants/:id/notes
 * Creates a new note for the specified applicant.
 * The authenticated user becomes the note author.
 */
export async function createNote(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const applicantId = parseInt(req.params.id, 10);
    const authorId = req.user!.userId;

    // Confirm the applicant exists.
    const applicant = await applicantService.findById(applicantId);
    if (!applicant) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    const note = await noteService.create(applicantId, authorId, {
      body: (req.body as { body: string }).body,
    });
    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/applicants/:id/notes/:noteId
 * Updates the body of an existing note.
 *
 * Only the note's original author or an admin may update it.
 */
export async function updateNote(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const noteId = parseInt(req.params.noteId, 10);

    const existing = await noteService.findById(noteId);
    if (!existing) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    // Only the author or an admin can edit a note.
    if (req.user!.role !== 'admin' && existing.author_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not have permission to edit this note' });
      return;
    }

    const updated = await noteService.update(noteId, {
      body: (req.body as { body: string }).body,
    });

    if (!updated) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/applicants/:id/notes/:noteId
 * Deletes a note.
 *
 * Only the note's original author or an admin may delete it.
 */
export async function deleteNote(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const noteId = parseInt(req.params.noteId, 10);

    const existing = await noteService.findById(noteId);
    if (!existing) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    // Only the author or an admin can delete a note.
    if (req.user!.role !== 'admin' && existing.author_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not have permission to delete this note' });
      return;
    }

    await noteService.remove(noteId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
