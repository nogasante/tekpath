import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import QRCode from 'qrcode';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const client = new pg.Client({ connectionString });
await client.connect();
const { rows } = await client.query(`
  select n.name, n.qr_code, n.type, b.name as building
  from public.nodes n
  left join public.buildings b on b.id = n.building_id
  where n.qr_code is not null
  order by n.qr_code
`);
await client.end();

if (rows.length === 0) {
  console.error('No QR codes found. Run supabase db reset first.');
  process.exit(1);
}

mkdirSync('qr-print', { recursive: true });
const cards = [];
for (const row of rows) {
  const svg = await QRCode.toString(row.qr_code, { type: 'svg', margin: 1, width: 180 });
  cards.push(`<article><div class="code">${svg}</div><h2>${escapeHtml(row.name)}</h2><p>${escapeHtml(row.building || 'Campus')}</p><strong>${escapeHtml(row.qr_code)}</strong></article>`);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TekPath QR checkpoints</title>
  <style>
    body { font-family: sans-serif; color: #102017; }
    h1 { font-size: 1.4rem; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; }
    article { width: 220px; border: 2px solid #102017; border-radius: 12px; padding: 12px; text-align: center; break-inside: avoid; }
    h2 { font-size: 1rem; margin: 8px 0 4px; }
    p, strong { margin: 0; }
  </style>
</head>
<body>
  <h1>TekPath checkpoints for KNUST</h1>
  <p>Stick each card at the landmark. Scanning sets a student's exact start. Coordinates in the app are approximate.</p>
  <div class="grid">${cards.join('\n')}</div>
</body>
</html>`;

writeFileSync('qr-print/index.html', html);
console.log(`Wrote qr-print/index.html with ${rows.length} codes.`);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
