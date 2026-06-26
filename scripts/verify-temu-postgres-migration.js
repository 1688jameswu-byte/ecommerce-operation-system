import fs from 'fs';
import path from 'path';
import { closeAlibaba1688Pool } from '../server/alibaba1688/postgresDatabase.js';
import { queryTemuDatabase, runTemuMigrations } from '../server/temu/postgresDatabase.js';

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');

const expectedTables = [
  'temu_stores',
  'temu_operators',
  'temu_store_operator_relations',
  'temu_import_batches',
  'temu_import_errors',
  'temu_order_items',
  'temu_traffic_daily_records',
  'temu_effective_new_listings',
  'temu_warning_rules',
  'temu_products',
  'temu_product_skus',
  'temu_ad_product_daily',
];

function loadJson(relativePath, fallback) {
  const filePath = path.join(dataDir, relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function sum(values) {
  return Number(values.reduce((total, value) => total + (Number(value) || 0), 0).toFixed(4));
}

function normalizeStatus(value) {
  return String(value ?? '');
}

function isCancelled(status) {
  const text = normalizeStatus(status);
  return text.includes('作废') || text.includes('取消') || text.toLowerCase().includes('cancel');
}

function groupSum(items, keyFn, valueFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(valueFn(item)) || 0));
  }
  return Object.fromEntries(Array.from(map.entries()).sort().map(([key, value]) => [key, Number(value.toFixed(4))]));
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
  console.log(`PASS ${label}`);
}

async function assertTables() {
  const result = await queryTemuDatabase(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [expectedTables],
  );
  const actual = new Set(result.rows.map((row) => row.table_name));
  for (const table of expectedTables) {
    if (!actual.has(table)) {
      throw new Error(`Missing TEMU table: ${table}`);
    }
  }
  console.log(`PASS TEMU tables exist: ${expectedTables.length}`);

  const indexes = await queryTemuDatabase(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])`,
    [expectedTables],
  );
  console.log(`PASS TEMU indexes/constraints visible: ${indexes.rows.length}`);
}

async function verifyDimensions(stores, operators, relations) {
  const temuStores = stores.filter((store) => String(store.platform || 'TEMU').toUpperCase() === 'TEMU');
  const temuRelations = relations.filter((relation) => String(relation.platform || 'TEMU').toUpperCase() === 'TEMU');
  const result = await queryTemuDatabase(
    `SELECT
       (SELECT COUNT(*)::int FROM temu_stores) AS stores,
       (SELECT COUNT(*)::int FROM temu_operators) AS operators,
       (SELECT COUNT(*)::int FROM temu_store_operator_relations) AS relations`,
  );
  assertEqual(result.rows[0].stores, temuStores.length, 'store count');
  assertEqual(result.rows[0].operators, operators.length, 'operator count');
  assertEqual(result.rows[0].relations, temuRelations.length, 'store-operator relation count');

  const pgStoreNames = await queryTemuDatabase('SELECT store_name FROM temu_stores ORDER BY store_name');
  assertEqual(pgStoreNames.rows.map((row) => row.store_name), temuStores.map((store) => store.storeName).sort(), 'store names');
}

async function verifyOrders(orderStore) {
  const orders = (orderStore.batches || []).flatMap((batch) => (batch.orders || []).map((order) => ({ ...order, batchId: batch.batchId })));
  const result = await queryTemuDatabase(
    `SELECT
       (SELECT COUNT(*)::int FROM temu_import_batches WHERE import_type = 'order_sales') AS batches,
       COUNT(*)::int AS rows,
       COUNT(DISTINCT order_no)::int AS unique_orders,
       COALESCE(SUM(item_amount),0)::float AS sales_amount,
       COALESCE(SUM(quantity),0)::float AS quantity,
       COUNT(*) FILTER (WHERE is_valid_order)::int AS valid_rows,
       COUNT(*) FILTER (WHERE is_cancelled)::int AS cancelled_rows
     FROM temu_order_items`,
  );
  assertEqual(result.rows[0].batches, (orderStore.batches || []).length, 'order batch count');
  assertEqual(result.rows[0].rows, orders.length, 'order item row count');
  assertEqual(result.rows[0].unique_orders, new Set(orders.map((order) => order.orderId).filter(Boolean)).size, 'unique order number count');
  assertEqual(Number(result.rows[0].sales_amount.toFixed(4)), sum(orders.map((order) => order.salesAmount || (Number(order.declarePrice) || 0) * (Number(order.quantity) || 0))), 'order sales amount total');
  assertEqual(Number(result.rows[0].quantity.toFixed(4)), sum(orders.map((order) => order.quantity)), 'order quantity total');
  assertEqual(result.rows[0].valid_rows, orders.filter((order) => !isCancelled(order.status)).length, 'valid order item rows');
  assertEqual(result.rows[0].cancelled_rows, orders.filter((order) => isCancelled(order.status)).length, 'cancelled order item rows');

  const pgDaily = await queryTemuDatabase(
    `SELECT order_date::text AS key, ROUND(SUM(item_amount)::numeric, 4)::float AS value
     FROM temu_order_items
     GROUP BY order_date
     ORDER BY order_date`,
  );
  assertEqual(Object.fromEntries(pgDaily.rows.map((row) => [row.key, row.value])), groupSum(orders, (order) => order.orderDate, (order) => order.salesAmount || (Number(order.declarePrice) || 0) * (Number(order.quantity) || 0)), 'order sales by date');

  const pgStore = await queryTemuDatabase(
    `SELECT store_name AS key, ROUND(SUM(item_amount)::numeric, 4)::float AS value
     FROM temu_order_items
     GROUP BY store_name
     ORDER BY store_name`,
  );
  assertEqual(Object.fromEntries(pgStore.rows.map((row) => [row.key, row.value])), groupSum(orders, (order) => order.storeName, (order) => order.salesAmount || (Number(order.declarePrice) || 0) * (Number(order.quantity) || 0)), 'order sales by store');
}

async function verifyTraffic(trafficStore) {
  const records = trafficStore.records || [];
  const result = await queryTemuDatabase(
    `SELECT
       (SELECT COUNT(*)::int FROM temu_import_batches WHERE import_type = 'traffic_conversion') AS batches,
       COUNT(*)::int AS rows
     FROM temu_traffic_daily_records
     WHERE is_current = TRUE`,
  );
  assertEqual(result.rows[0].batches, new Set(records.map((record) => record.batchId).filter(Boolean)).size, 'traffic batch count');
  assertEqual(result.rows[0].rows, records.length, 'traffic record count');

  const pgVisitors = await queryTemuDatabase(
    `SELECT CONCAT(store_name, '|', report_date::text) AS key, ROUND(SUM(product_visitors)::numeric, 4)::float AS value
     FROM temu_traffic_daily_records
     WHERE is_current = TRUE
     GROUP BY store_name, report_date
     ORDER BY store_name, report_date`,
  );
  assertEqual(Object.fromEntries(pgVisitors.rows.map((row) => [row.key, row.value])), groupSum(records, (record) => `${record.storeName}|${record.date}`, (record) => record.productVisitors), 'traffic product visitors by store/date');

  const pgConversion = await queryTemuDatabase(
    `SELECT CONCAT(store_name, '|', report_date::text) AS key, ROUND(AVG(detail_pay_conversion_rate)::numeric, 8)::float AS value
     FROM temu_traffic_daily_records
     WHERE is_current = TRUE
     GROUP BY store_name, report_date
     ORDER BY store_name, report_date`,
  );
  assertEqual(
    Object.fromEntries(pgConversion.rows.map((row) => [row.key, row.value])),
    groupSum(records, (record) => `${record.storeName}|${record.date}`, (record) => record.detailPayConversionRate),
    'traffic conversion rate by store/date',
  );
}

async function verifyEffectiveListings(items) {
  const result = await queryTemuDatabase('SELECT COUNT(*)::int AS count FROM temu_effective_new_listings');
  assertEqual(result.rows[0].count, items.length, 'effective new listing count');
  const pg = await queryTemuDatabase(
    `SELECT CONCAT(COALESCE(legacy_store_id,''), '|', site_join_date::text, '|', skc) AS key
     FROM temu_effective_new_listings
     ORDER BY key`,
  );
  assertEqual(pg.rows.map((row) => row.key), items.map((item) => `${item.storeId || ''}|${item.siteJoinDate}|${item.skc}`).sort(), 'effective listing store/date/skc');
}

async function verifyRules(ruleStore) {
  const expected = (ruleStore.rules?.length || 0) + (ruleStore.growthRules?.length || 0);
  const result = await queryTemuDatabase('SELECT COUNT(*)::int AS count FROM temu_warning_rules');
  assertEqual(result.rows[0].count, expected, 'warning rule count');
  const defaults = await queryTemuDatabase('SELECT COUNT(*)::int AS count FROM temu_warning_rules WHERE enabled = TRUE');
  if (defaults.rows[0].count <= 0) {
    throw new Error('warning rule default fallback failed: no enabled rules');
  }
  console.log('PASS warning rule default fallback has enabled rules');
}

async function verifyAds() {
  const result = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS count,
            COALESCE(SUM(ad_spend),0)::float AS ad_spend,
            COALESCE(SUM(global_sales_amount),0)::float AS sales_amount,
            COALESCE(SUM(global_impressions),0)::float AS impressions,
            COALESCE(SUM(global_clicks),0)::float AS clicks,
            COALESCE(SUM(global_add_to_cart_count),0)::float AS carts,
            COUNT(*) FILTER (
              WHERE calculated_cpc IS NULL
                 OR calculated_add_to_cart_rate IS NULL
                 OR calculated_cart_to_order_rate IS NULL
                 OR calculated_avg_order_value IS NULL
                 OR calculated_target_roas_gap IS NULL
            )::int AS nullable_calculated_rows
     FROM temu_ad_product_daily`,
  );
  console.log(`PASS ad daily table ready: rows=${result.rows[0].count}, spend=${result.rows[0].ad_spend}, sales=${result.rows[0].sales_amount}, impressions=${result.rows[0].impressions}, clicks=${result.rows[0].clicks}, carts=${result.rows[0].carts}, nullableCalculatedRows=${result.rows[0].nullable_calculated_rows}`);
}

async function main() {
  await runTemuMigrations();
  await assertTables();
  await verifyDimensions(
    loadJson('stores.json', []),
    loadJson('operators.json', []),
    loadJson('store-operator-relations.json', []),
  );
  await verifyOrders(loadJson('order-import-store.json', { batches: [] }));
  await verifyTraffic(loadJson(path.join('raw', 'traffic-conversion-store.json'), { records: [], batches: [] }));
  await verifyEffectiveListings(loadJson('effective-new-listings.json', []));
  await verifyRules(loadJson('traffic-warning-rules.json', { rules: [], growthRules: [] }));
  await verifyAds();

  const errors = await queryTemuDatabase('SELECT COUNT(*)::int AS count FROM temu_import_errors');
  console.log(`PASS import error records checked: ${errors.rows[0].count}`);
  console.log('TEMU PostgreSQL migration verification passed.');
}

main()
  .catch((error) => {
    console.error(`TEMU PostgreSQL verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAlibaba1688Pool();
  });
