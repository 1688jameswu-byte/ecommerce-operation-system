import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const uniqueIndexName = 'idx_1688_product_skus_code_unique_ci';

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

function runBackup() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['run', 'backup:1688-db'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start database backup: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Database backup failed with exit code ${code}. Duplicate SKU repair was not started.`));
    });
  });
}

function normalizeSku(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildCandidateSku(baseSku, duplicateIndex, skuId, usedSkus) {
  const trimmedBase = String(baseSku ?? '').trim();
  const fallbackBase = trimmedBase || `SKU-${String(skuId).slice(0, 8)}`;
  const preferred = `${fallbackBase}-DUP-${duplicateIndex}`;
  if (!usedSkus.has(normalizeSku(preferred))) {
    return preferred;
  }

  let counter = 2;
  while (counter < 1000) {
    const candidate = `${preferred}-${counter}`;
    if (!usedSkus.has(normalizeSku(candidate))) {
      return candidate;
    }
    counter += 1;
  }

  return `${preferred}-${String(skuId).slice(0, 8)}`;
}

async function fetchDuplicateRows(client) {
  const { rows } = await client.query(`
    WITH ranked AS (
      SELECT
        id::text AS sku_id,
        product_id::text AS product_id,
        sku_code,
        LOWER(TRIM(sku_code)) AS normalized_sku,
        created_at,
        updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(sku_code))
          ORDER BY created_at NULLS FIRST, id
        ) AS duplicate_index,
        COUNT(*) OVER (PARTITION BY LOWER(TRIM(sku_code)))::int AS duplicate_count
      FROM "1688_product_skus"
      WHERE COALESCE(TRIM(sku_code), '') <> ''
    )
    SELECT *
    FROM ranked
    WHERE duplicate_count > 1
    ORDER BY normalized_sku, duplicate_index;
  `);
  return rows;
}

async function fetchUsedSkuSet(client) {
  const { rows } = await client.query(`
    SELECT LOWER(TRIM(sku_code)) AS normalized_sku
    FROM "1688_product_skus"
    WHERE COALESCE(TRIM(sku_code), '') <> '';
  `);
  return new Set(rows.map((row) => row.normalized_sku));
}

async function assertNoDuplicateSkus(client) {
  const { rows } = await client.query(`
    SELECT LOWER(TRIM(sku_code)) AS normalized_sku, COUNT(*)::int AS duplicate_count
    FROM "1688_product_skus"
    WHERE COALESCE(TRIM(sku_code), '') <> ''
    GROUP BY LOWER(TRIM(sku_code))
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC, normalized_sku
    LIMIT 20;
  `);

  if (rows.length > 0) {
    throw new Error(`Duplicate SKU rows still exist after repair: ${JSON.stringify(rows)}`);
  }
}

async function createUniqueIndex(client) {
  await client.query(`DROP INDEX IF EXISTS ${uniqueIndexName};`);
  await client.query(`
    CREATE UNIQUE INDEX ${uniqueIndexName}
      ON "1688_product_skus" (LOWER(TRIM(sku_code)))
      WHERE COALESCE(TRIM(sku_code), '') <> '';
  `);
}

async function main() {
  loadLocalEnv();
  console.log('Starting 1688 duplicate SKU repair. A database backup will be created first.');
  await runBackup();

  const pool = createPool();
  const client = await pool.connect();
  const changes = [];

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE "1688_product_skus" IN SHARE ROW EXCLUSIVE MODE');

    const duplicates = await fetchDuplicateRows(client);
    if (duplicates.length === 0) {
      console.log('No duplicate SKU codes found. Ensuring unique index exists.');
      await createUniqueIndex(client);
      await client.query('COMMIT');
      console.log(`Unique index ${uniqueIndexName} is ready.`);
      return;
    }

    const usedSkus = await fetchUsedSkuSet(client);
    for (const row of duplicates) {
      if (Number(row.duplicate_index) === 1) {
        continue;
      }

      usedSkus.delete(normalizeSku(row.sku_code));
      const nextSkuCode = buildCandidateSku(row.sku_code, row.duplicate_index, row.sku_id, usedSkus);
      usedSkus.add(normalizeSku(nextSkuCode));

      await client.query(
        `
          UPDATE "1688_product_skus"
          SET sku_code = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        [nextSkuCode, row.sku_id],
      );

      changes.push({
        skuId: row.sku_id,
        productId: row.product_id,
        oldSkuCode: row.sku_code,
        newSkuCode: nextSkuCode,
      });
    }

    await assertNoDuplicateSkus(client);
    await createUniqueIndex(client);
    await client.query('COMMIT');

    console.log(`Repaired ${changes.length} duplicate SKU rows.`);
    if (changes.length > 0) {
      console.table(changes);
    }
    console.log(`Unique index ${uniqueIndexName} has been created.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Duplicate SKU repair failed: ${error.message}`);
  process.exitCode = 1;
});
