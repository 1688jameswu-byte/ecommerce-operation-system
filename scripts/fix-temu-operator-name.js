import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryTemuDatabase } from '../server/temu/postgresDatabase.js';
import { closeAlibaba1688Pool } from '../server/alibaba1688/postgresDatabase.js';

const OLD_NAME = '\u66fe\u4f73\u5b8f';
const NEW_NAME = '\u66fe\u4f73\u5f18';
const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const shouldSkipJson = args.has('--skip-json');
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const TEMU_JSON_FILES = new Set([
  'data/stores.json',
  'data/operators.json',
  'data/store-operator-relations.json',
  'data/order-import-store.json',
  'data/raw/traffic-conversion-store.json',
  'data/traffic-conversion-store.json',
  'data/effective-new-listings.json',
  'data/traffic-warning-rules.json',
]);

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  });
}

async function fixPostgres() {
  const tables = await queryTemuDatabase(
    `SELECT table_name,
            BOOL_OR(column_name = 'updated_at') AS has_updated_at
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name LIKE 'temu\\_%' ESCAPE '\\'
       AND column_name IN ('operator_name', 'updated_at')
     GROUP BY table_name
     HAVING BOOL_OR(column_name = 'operator_name')
     ORDER BY table_name`,
  );

  const results = [];
  for (const row of tables.rows) {
    const tableName = row.table_name;
    const setUpdatedAt = row.has_updated_at ? ', updated_at = NOW()' : '';
    const sql = `UPDATE ${quoteIdentifier(tableName)}
                 SET operator_name = $1${setUpdatedAt}
                 WHERE operator_name = $2`;
    if (!shouldApply) {
      const count = await queryTemuDatabase(
        `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)} WHERE operator_name = $1`,
        [OLD_NAME],
      );
      results.push({ table: tableName, matched: Number(count.rows[0]?.count || 0), updated: 0 });
      continue;
    }
    const updated = await queryTemuDatabase(sql, [NEW_NAME, OLD_NAME]);
    results.push({ table: tableName, matched: Number(updated.rowCount || 0), updated: Number(updated.rowCount || 0) });
  }
  return results;
}

function fixJsonFiles() {
  if (shouldSkipJson) return [];
  const files = listJsonFiles(dataDir).filter((filePath) => TEMU_JSON_FILES.has(path.relative(rootDir, filePath).replace(/\\/g, '/')));
  const results = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(OLD_NAME)) continue;
    const occurrences = content.split(OLD_NAME).length - 1;
    if (shouldApply) {
      fs.writeFileSync(filePath, content.replaceAll(OLD_NAME, NEW_NAME));
    }
    results.push({
      file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
      matched: occurrences,
      updated: shouldApply ? occurrences : 0,
    });
  }
  return results;
}

async function main() {
  console.log(`[temu-operator-name-fix] mode=${shouldApply ? 'apply' : 'dry-run'} ${OLD_NAME} -> ${NEW_NAME}`);
  const postgres = await fixPostgres();
  const json = fixJsonFiles();
  console.log(JSON.stringify({ postgres, json }, null, 2));
  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to update data.');
  } else {
    console.log('Done. Restart the Node/PM2 service to clear in-memory page caches.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAlibaba1688Pool();
  });
