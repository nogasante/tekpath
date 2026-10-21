import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

test('mobility needs stay private and auth emails are not readable', async () => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(readFileSync(new URL('./privacy.sql', import.meta.url), 'utf8'));
    await client.query('rollback');
  } finally {
    await client.end();
  }
});
