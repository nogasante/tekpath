import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

test('mobility needs stay private and auth emails are not readable', async (t) => {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
      t.skip(`Postgres is not available (${code})`);
      return;
    }
    throw error;
  }
  try {
    await client.query('begin');
    await client.query(readFileSync(new URL('./privacy.sql', import.meta.url), 'utf8'));
    await client.query('rollback');
  } finally {
    await client.end();
  }
});
