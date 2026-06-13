import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Please set it in .env or the server environment.');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 2,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000),
  });
}

async function main() {
  loadLocalEnv();
  const pool = createPool();

  try {
    const { rows } = await pool.query(`
      WITH ranked AS (
        SELECT
          id::text AS sku_id,
          product_id::text AS product_id,
          sku_code,
          LOWER(TRIM(sku_code)) AS normalized_sku,
          created_at,
          updated_at,
          COUNT(*) OVER (PARTITION BY LOWER(TRIM(sku_code)))::int AS duplicate_count
        FROM "1688_product_skus"
        WHERE COALESCE(TRIM(sku_code), '') <> ''
      )
      SELECT
        normalized_sku,
        duplicate_count,
        sku_code,
        product_id,
        sku_id,
        created_at,
        updated_at
      FROM ranked
      WHERE duplicate_count > 1
      ORDER BY normalized_sku, created_at NULLS FIRST, sku_id;
    `);

    if (rows.length === 0) {
      console.log('No duplicate 1688 SKU codes found.');
      return;
    }

    console.log(`Found ${rows.length} duplicate SKU rows across ${new Set(rows.map((row) => row.normalized_sku)).size} SKU code groups.`);
    console.table(rows.map((row) => ({
      normalizedSku: row.normalized_sku,
      skuCode: row.sku_code,
      duplicateCount: row.duplicate_count,
      productId: row.product_id,
      skuId: row.sku_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Duplicate SKU diagnosis failed: ${error.message}`);
  process.exitCode = 1;
});
