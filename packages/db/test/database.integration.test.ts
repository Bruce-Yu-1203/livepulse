import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });

describe('authentication database constraints', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterEach(async () => {
    await pool.query('TRUNCATE TABLE users CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enforces unique user emails', async () => {
    const email = 'viewer@example.com';

    await pool.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [randomUUID(), email, 'first-password-hash'],
    );

    await expect(
      pool.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [randomUUID(), email, 'second-password-hash'],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('cascades refresh-session deletion with its user', async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();

    await pool.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [userId, 'host@example.com', 'password-hash'],
    );
    await pool.query(
      `INSERT INTO refresh_sessions
        (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [sessionId, userId, 'a'.repeat(64)],
    );

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM refresh_sessions WHERE id = $1',
      [sessionId],
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('rejects a refresh session without an existing user', async () => {
    await expect(
      pool.query(
        `INSERT INTO refresh_sessions
          (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
        [randomUUID(), randomUUID(), 'b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
