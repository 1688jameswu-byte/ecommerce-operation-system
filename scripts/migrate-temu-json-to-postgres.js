import fs from 'fs';
import path from 'path';
import { closeAlibaba1688Pool } from '../server/alibaba1688/postgresDatabase.js';
import { runTemuMigrations } from '../server/temu/postgresDatabase.js';
import { syncAllTemuJsonToPostgres } from '../server/temu/temuPostgresRepository.js';

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');

function loadJson(relativePath, fallback) {
  const filePath = path.join(dataDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function main() {
  await runTemuMigrations();
  const summary = await syncAllTemuJsonToPostgres({
    stores: loadJson('stores.json', []),
    operators: loadJson('operators.json', []),
    relations: loadJson('store-operator-relations.json', []),
    orderStore: loadJson('order-import-store.json', { batches: [] }),
    trafficStore: loadJson(path.join('raw', 'traffic-conversion-store.json'), { records: [], batches: [] }),
    effectiveListings: loadJson('effective-new-listings.json', []),
    warningRuleStore: loadJson('traffic-warning-rules.json', { settings: { displayLimit: 5 }, rules: [], growthRules: [] }),
  });

  console.log('TEMU JSON -> PostgreSQL migration finished.');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(`TEMU migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAlibaba1688Pool();
  });
