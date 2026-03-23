export interface Note {
  id: number;
  applicant_id: number;
  author_id: number;
  /** Name of the user who wrote the note (joined from users table). */
  author_name: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNoteDTO {
  body: string;
}

export interface UpdateNoteDTO {
  body: string;
}
