import { apiService } from './api';
import { Note, CreateNoteDTO, UpdateNoteDTO } from '../types/note';

interface NotesResponse {
  data: Note[];
  total: number;
}

class NoteService {
  /**
   * Returns all notes for a given applicant, newest first.
   */
  async getByApplicant(applicantId: string): Promise<Note[]> {
    const result = await apiService.get<NotesResponse>(`/applicants/${applicantId}/notes`);
    return result.data;
  }

  /**
   * Creates a new note for the given applicant.
   * The authenticated user becomes the author automatically.
   */
  async create(applicantId: string, data: CreateNoteDTO): Promise<Note> {
    return apiService.post<Note>(`/applicants/${applicantId}/notes`, data);
  }

  /**
   * Updates the body of an existing note.
   * Only the note's author or an admin may call this successfully.
   */
  async update(applicantId: string, noteId: number, data: UpdateNoteDTO): Promise<Note> {
    return apiService.patch<Note>(`/applicants/${applicantId}/notes/${noteId}`, data);
  }

  /**
   * Deletes a note.
   * Only the note's author or an admin may call this successfully.
   */
  async remove(applicantId: string, noteId: number): Promise<void> {
    return apiService.delete<void>(`/applicants/${applicantId}/notes/${noteId}`);
  }
}

export const noteService = new NoteService();
