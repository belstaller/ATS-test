import { replicaPool } from '../db/config';
import pool from '../db/config';
import {
  Applicant,
  ApplicantFilters,
  CreateApplicantDTO,
  PaginatedApplicants,
  UpdateApplicantDTO,
} from '../types/applicant';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function findAll(filters: ApplicantFilters = {}): Promise<PaginatedApplicants> {
  const page = Math.max(1, filters.page ?? DEFAULT_PAGE);
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramCount = 1;

  if (filters.status) {
    conditions.push(`status = $${paramCount++}`);
    values.push(filters.status);
  }

  if (filters.position) {
    conditions.push(`position ILIKE $${paramCount++}`);
    values.push(`%${filters.position}%`);
  }

  if (filters.search) {
    conditions.push(
      `(name ILIKE $${paramCount} OR email ILIKE $${paramCount + 1} OR position ILIKE $${paramCount + 2})`
    );
    const term = `%${filters.search}%`;
    values.push(term, term, term);
    paramCount += 3;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Use the replica for read queries
  const countResult = await replicaPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM applicants ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await replicaPool.query<Applicant>(
    `SELECT * FROM applicants ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function findById(id: number): Promise<Applicant | null> {
  const result = await replicaPool.query<Applicant>(
    'SELECT * FROM applicants WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function create(data: CreateApplicantDTO): Promise<Applicant> {
  const { name, email, phone, position, status, resume_url } = data;
  const result = await pool.query<Applicant>(
    `INSERT INTO applicants (name, email, phone, position, status, resume_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, email, phone ?? null, position ?? null, status ?? 'applied', resume_url ?? null]
  );
  return result.rows[0];
}

export async function update(
  id: number,
  data: UpdateApplicantDTO
): Promise<Applicant | null> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
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
  const result = await pool.query<Applicant>(
    `UPDATE applicants SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  return result.rows[0] ?? null;
}

export async function updateStatus(
  id: number,
  status: Applicant['status']
): Promise<Applicant | null> {
  const result = await pool.query<Applicant>(
    `UPDATE applicants SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0] ?? null;
}

export async function remove(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM applicants WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
