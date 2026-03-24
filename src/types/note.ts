export interface Note {
  id: number;
  applicant_id: number;
  author_id: number;
  /** Name of the user who wrote the note (joined from the users table). */
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteDTO {
  body: string;
}

export interface UpdateNoteDTO {
  body: string;
}
