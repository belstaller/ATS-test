import { replicaPool } from '../db/config';
import pool from '../db/config';
import { Note, CreateNoteDTO, UpdateNoteDTO } from '../types/note';

// The author's name is surfaced via a JOIN so callers don't need to perform a
// second query.
const SELECT_NOTE = `
  SELECT
    n.id,
    n.applicant_id,
    n.author_id,
    u.name AS author_name,
    n.body,
    n.created_at,
    n.updated_at
  FROM notes n
  JOIN users u ON u.id = n.author_id
`;

/**
 * Returns all notes for a given applicant, newest first.
 */
export async function findAllByApplicant(applicantId: number): Promise<Note[]> {
  const result = await replicaPool.query<Note>(
    `${SELECT_NOTE} WHERE n.applicant_id = $1 ORDER BY n.created_at DESC`,
    [applicantId]
  );
  return result.rows;
}

/**
 * Returns a single note by its id.
 */
export async function findById(id: number): Promise<Note | null> {
  const result = await replicaPool.query<Note>(
    `${SELECT_NOTE} WHERE n.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Creates a new note for an applicant.
 *
 * @param applicantId  The applicant this note belongs to.
 * @param authorId     The user who is writing the note.
 * @param data         Note payload (body).
 */
export async function create(
  applicantId: number,
  authorId: number,
  data: CreateNoteDTO
): Promise<Note> {
  const insertResult = await pool.query<{ id: number }>(
    `INSERT INTO notes (applicant_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [applicantId, authorId, data.body]
  );
  const note = await findById(insertResult.rows[0].id);
  return note!;
}

/**
 * Updates the body of an existing note.
 * Only the note's author (or an admin) should be permitted to call this —
 * that enforcement is done in the controller/route layer.
 */
export async function update(
  id: number,
  data: UpdateNoteDTO
): Promise<Note | null> {
  const result = await pool.query<{ id: number }>(
    `UPDATE notes SET body = $1 WHERE id = $2 RETURNING id`,
    [data.body, id]
  );
  if (!result.rows[0]) return null;
  return findById(id);
}

/**
 * Deletes a note by id.
 *
 * @returns `true` when a row was deleted, `false` when the id was not found.
 */
export async function remove(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM notes WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
