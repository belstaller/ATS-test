import pool from '../db/config';
import { User, UserPublic, RegisterDTO } from '../types/user';

const PUBLIC_FIELDS = 'id, name, email, role, created_at, updated_at';

export async function findAll(): Promise<UserPublic[]> {
  const result = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function findById(id: number): Promise<UserPublic | null> {
  const result = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function findByEmailWithPassword(email: string): Promise<User | null> {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function create(data: Omit<RegisterDTO, 'password'> & { password_hash: string }): Promise<UserPublic> {
  const { name, email, password_hash, role } = data;
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_FIELDS}`,
    [name, email, password_hash, role || 'viewer']
  );
  return result.rows[0];
}

export async function updateRole(id: number, role: string): Promise<UserPublic | null> {
  const result = await pool.query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING ${PUBLIC_FIELDS}`,
    [role, id]
  );
  return result.rows[0] || null;
}

export async function remove(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
