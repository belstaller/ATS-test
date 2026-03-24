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
  const values: (string | number | string[])[] = [];
  let paramCount = 1;

  if (filters.status) {
    conditions.push(`status = $${paramCount++}`);
    values.push(filters.status);
  }

  if (filters.source) {
    conditions.push(`source = $${paramCount++}`);
    values.push(filters.source);
  }

  if (filters.position) {
    conditions.push(`position ILIKE $${paramCount++}`);
    values.push(`%${filters.position}%`);
  }

  if (filters.location) {
    conditions.push(`location ILIKE $${paramCount++}`);
    values.push(`%${filters.location}%`);
  }

  if (filters.assigned_to) {
    conditions.push(`assigned_to = $${paramCount++}`);
    values.push(filters.assigned_to);
  }

  // Skill filter — the array column must contain ALL of the requested skills.
  // The query parameter is a comma-separated string, e.g. "TypeScript,Node.js".
  if (filters.skills) {
    const skillList = filters.skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillList.length > 0) {
      // skills @> $n  — array containment: stored skills contain all requested
      conditions.push(`skills @> $${paramCount++}`);
      values.push(skillList);
    }
  }

  if (filters.search) {
    conditions.push(
      `(name ILIKE $${paramCount} OR email ILIKE $${paramCount + 1} OR position ILIKE $${paramCount + 2} OR location ILIKE $${paramCount + 3})`
    );
    const term = `%${filters.search}%`;
    values.push(term, term, term, term);
    paramCount += 4;
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
  const {
    name,
    email,
    phone,
    location,
    position,
    experience_years,
    education,
    skills,
    resume_url,
    linkedin_url,
    github_url,
    portfolio_url,
    status,
    salary_expected,
    availability_date,
    source,
    assigned_to,
  } = data;

  const result = await pool.query<Applicant>(
    `INSERT INTO applicants (
        name, email, phone, location,
        position, experience_years, education, skills,
        resume_url, linkedin_url, github_url, portfolio_url,
        status, salary_expected, availability_date, source, assigned_to
      )
      VALUES (
        $1,  $2,  $3,  $4,
        $5,  $6,  $7,  $8,
        $9,  $10, $11, $12,
        $13, $14, $15, $16, $17
      )
      RETURNING *`,
    [
      name,
      email,
      phone ?? null,
      location ?? null,
      position ?? null,
      experience_years ?? null,
      education ?? null,
      skills ?? [],
      resume_url ?? null,
      linkedin_url ?? null,
      github_url ?? null,
      portfolio_url ?? null,
      status ?? 'applied',
      salary_expected ?? null,
      availability_date ?? null,
      source ?? null,
      assigned_to ?? null,
    ]
  );
  return result.rows[0];
}

export async function update(
  id: number,
  data: UpdateApplicantDTO
): Promise<Applicant | null> {
  const fields: string[] = [];
  const values: (string | number | string[] | null)[] = [];
  let paramCount = 1;

  const fieldMap: Array<[keyof UpdateApplicantDTO, string]> = [
    ['name', 'name'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['location', 'location'],
    ['position', 'position'],
    ['experience_years', 'experience_years'],
    ['education', 'education'],
    ['skills', 'skills'],
    ['resume_url', 'resume_url'],
    ['linkedin_url', 'linkedin_url'],
    ['github_url', 'github_url'],
    ['portfolio_url', 'portfolio_url'],
    ['status', 'status'],
    ['salary_expected', 'salary_expected'],
    ['availability_date', 'availability_date'],
    ['source', 'source'],
    ['assigned_to', 'assigned_to'],
  ];

  for (const [dtoKey, column] of fieldMap) {
    if (data[dtoKey] !== undefined) {
      fields.push(`${column} = $${paramCount++}`);
      values.push(data[dtoKey] as string | number | string[] | null);
    }
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
