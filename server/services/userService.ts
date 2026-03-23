import { replicaPool } from '../db/config';
import pool from '../db/config';
import { User, UserPublic, RegisterDTO } from '../types/user';

const PUBLIC_FIELDS = 'id, name, email, role, created_at, updated_at';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface UserFilters {
  role?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedUsers {
  data: UserPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function findAll(filters: UserFilters = {}): Promise<PaginatedUsers> {
  const page = Math.max(1, filters.page ?? DEFAULT_PAGE);
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramCount = 1;

  if (filters.role) {
    conditions.push(`role = $${paramCount++}`);
    values.push(filters.role);
  }

  if (filters.search) {
    conditions.push(
      `(name ILIKE $${paramCount} OR email ILIKE $${paramCount + 1})`
    );
    const term = `%${filters.search}%`;
    values.push(term, term);
    paramCount += 2;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await replicaPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await replicaPool.query<UserPublic>(
    `SELECT ${PUBLIC_FIELDS} FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
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

export async function findById(id: number): Promise<UserPublic | null> {
  const result = await replicaPool.query<UserPublic>(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByEmailWithPassword(email: string): Promise<User | null> {
  const result = await replicaPool.query<User>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] ?? null;
}

export async function create(
  data: Omit<RegisterDTO, 'password'> & { password_hash: string }
): Promise<UserPublic> {
  const { name, email, password_hash, role } = data;
  const result = await pool.query<UserPublic>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_FIELDS}`,
    [name, email, password_hash, role ?? 'viewer']
  );
  return result.rows[0];
}

export async function updateRole(id: number, role: string): Promise<UserPublic | null> {
  const result = await pool.query<UserPublic>(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING ${PUBLIC_FIELDS}`,
    [role, id]
  );
  return result.rows[0] ?? null;
}

export async function remove(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
