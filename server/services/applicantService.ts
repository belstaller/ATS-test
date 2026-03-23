import pool from '../db/config';
import { Applicant, CreateApplicantDTO, UpdateApplicantDTO } from '../types/applicant';

export async function findAll(): Promise<Applicant[]> {
  const result = await pool.query(
    'SELECT * FROM applicants ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function findById(id: number): Promise<Applicant | null> {
  const result = await pool.query(
    'SELECT * FROM applicants WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function create(data: CreateApplicantDTO): Promise<Applicant> {
  const { name, email, phone, position, status, resume_url } = data;
  const result = await pool.query(
    `INSERT INTO applicants (name, email, phone, position, status, resume_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, email, phone, position, status || 'applied', resume_url]
  );
  return result.rows[0];
}

export async function update(
  id: number,
  data: UpdateApplicantDTO
): Promise<Applicant | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (data.position !== undefined) {
    fields.push(`position = $${paramCount++}`);
    values.push(data.position);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.resume_url !== undefined) {
    fields.push(`resume_url = $${paramCount++}`);
    values.push(data.resume_url);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE applicants SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

export async function remove(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM applicants WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
