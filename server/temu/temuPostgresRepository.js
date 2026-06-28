import crypto from 'crypto';
import { queryTemuDatabase, runTemuMigrations } from './postgresDatabase.js';

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const next = text(value);
  return next || null;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value) {
  const next = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function timestampValue(value) {
  const next = text(value);
  return next ? next : null;
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeStoreKey(value) {
  return text(value).replace(/\s+/g, '').toLowerCase();
}

function orderStatusFlags(status) {
  const value = text(status);
  const isCancelled = value.includes('作废') || value.includes('取消') || value.toLowerCase().includes('cancel');
  return {
    isCancelled,
    isValidOrder: !isCancelled,
  };
}

async function upsertImportBatch(client, batch) {
  const result = await client.query(
    `INSERT INTO temu_import_batches (
       legacy_id, source_batch_id, import_type, source_type, file_name, report_date,
       store_id, store_name, total_rows, success_rows, error_rows, status,
       error_message, uploaded_by, uploaded_by_name, uploaded_at, finished_at, raw_data, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,NOW())
     ON CONFLICT (import_type, source_type, (COALESCE(source_batch_id, '')), (COALESCE(file_name, '')))
     DO UPDATE SET
       legacy_id = EXCLUDED.legacy_id,
       report_date = EXCLUDED.report_date,
       store_id = EXCLUDED.store_id,
       store_name = EXCLUDED.store_name,
       total_rows = EXCLUDED.total_rows,
       success_rows = EXCLUDED.success_rows,
       error_rows = EXCLUDED.error_rows,
       status = EXCLUDED.status,
       error_message = EXCLUDED.error_message,
       uploaded_by = EXCLUDED.uploaded_by,
       uploaded_by_name = EXCLUDED.uploaded_by_name,
       uploaded_at = EXCLUDED.uploaded_at,
       finished_at = EXCLUDED.finished_at,
       raw_data = EXCLUDED.raw_data,
       updated_at = NOW()
     RETURNING id`,
    [
      nullableText(batch.legacyId),
      nullableText(batch.sourceBatchId),
      text(batch.importType),
      text(batch.sourceType || 'json_migration'),
      nullableText(batch.fileName),
      dateValue(batch.reportDate),
      batch.storeId || null,
      nullableText(batch.storeName),
      numberValue(batch.totalRows),
      numberValue(batch.successRows),
      numberValue(batch.errorRows),
      text(batch.status || 'success'),
      nullableText(batch.errorMessage),
      nullableText(batch.uploadedBy),
      nullableText(batch.uploadedByName),
      timestampValue(batch.uploadedAt),
      timestampValue(batch.finishedAt),
      json(batch.rawData),
    ],
  );
  return result.rows[0].id;
}

async function insertImportError(client, batchId, rowNumber, errorReason, rawData) {
  await client.query(
    `INSERT INTO temu_import_errors (batch_id, row_number, error_reason, raw_data)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [batchId, rowNumber ?? null, text(errorReason), json(rawData)],
  );
}

async function upsertStore(client, store) {
  const legacyId = text(store?.id || store?.storeName);
  if (!legacyId) return null;
  const result = await client.query(
    `INSERT INTO temu_stores (
       legacy_id, store_name, platform, platform_store_id, site_country, store_group,
       country, status, group_name, remark, raw_data, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,COALESCE($12::timestamptz,NOW()),COALESCE($13::timestamptz,NOW()))
     ON CONFLICT (legacy_id)
     DO UPDATE SET
       store_name = EXCLUDED.store_name,
       platform = EXCLUDED.platform,
       platform_store_id = EXCLUDED.platform_store_id,
       site_country = EXCLUDED.site_country,
       store_group = EXCLUDED.store_group,
       country = EXCLUDED.country,
       status = EXCLUDED.status,
       group_name = EXCLUDED.group_name,
       remark = EXCLUDED.remark,
       raw_data = EXCLUDED.raw_data,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      legacyId,
      text(store?.storeName || store?.name),
      text(store?.platform || 'TEMU'),
      nullableText(store?.platformStoreId),
      nullableText(store?.siteCountry),
      nullableText(store?.storeGroup),
      nullableText(store?.country),
      text(store?.status || 'active'),
      nullableText(store?.groupName),
      nullableText(store?.remark),
      json(store),
      timestampValue(store?.createdAt),
      timestampValue(store?.updatedAt),
    ],
  );
  return result.rows[0].id;
}

async function upsertOperator(client, operator) {
  const legacyId = text(operator?.id || operator?.operatorName || operator?.name);
  if (!legacyId) return null;
  const result = await client.query(
    `INSERT INTO temu_operators (
       legacy_id, operator_name, team_id, group_name, level, status, remark,
       raw_data, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,COALESCE($9::timestamptz,NOW()),COALESCE($10::timestamptz,NOW()))
     ON CONFLICT (legacy_id)
     DO UPDATE SET
       operator_name = EXCLUDED.operator_name,
       team_id = EXCLUDED.team_id,
       group_name = EXCLUDED.group_name,
       level = EXCLUDED.level,
       status = EXCLUDED.status,
       remark = EXCLUDED.remark,
       raw_data = EXCLUDED.raw_data,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      legacyId,
      text(operator?.operatorName || operator?.name),
      nullableText(operator?.teamId),
      nullableText(operator?.groupName),
      nullableText(operator?.level),
      text(operator?.status || 'active'),
      nullableText(operator?.remark),
      json(operator),
      timestampValue(operator?.createdAt),
      timestampValue(operator?.updatedAt),
    ],
  );
  return result.rows[0].id;
}

async function upsertRelation(client, relation) {
  const legacyId = text(relation?.id || `${relation?.storeId || relation?.storeName}-${relation?.operatorId || relation?.operatorName}`);
  if (!legacyId) return null;
  const storeLegacyId = text(relation?.storeId || relation?.storeName);
  const operatorLegacyId = text(relation?.operatorId || relation?.operatorName);
  const storeResult = storeLegacyId
    ? await client.query('SELECT id, store_name FROM temu_stores WHERE legacy_id = $1 OR store_name = $1 LIMIT 1', [storeLegacyId])
    : { rows: [] };
  const operatorResult = operatorLegacyId || text(relation?.operatorName)
    ? await client.query(
        'SELECT id, operator_name FROM temu_operators WHERE legacy_id = $1 OR operator_name = $1 OR operator_name = $2 LIMIT 1',
        [operatorLegacyId, text(relation?.operatorName)],
      )
    : { rows: [] };
  const store = storeResult.rows[0];
  const operator = operatorResult.rows[0];

  const result = await client.query(
    `INSERT INTO temu_store_operator_relations (
       legacy_id, store_id, operator_id, legacy_store_id, legacy_operator_id,
       store_name, operator_name, role, platform, start_date, end_date, status,
       remark, raw_data, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,COALESCE($15::timestamptz,NOW()),COALESCE($16::timestamptz,NOW()))
     ON CONFLICT (legacy_id)
     DO UPDATE SET
       store_id = EXCLUDED.store_id,
       operator_id = EXCLUDED.operator_id,
       legacy_store_id = EXCLUDED.legacy_store_id,
       legacy_operator_id = EXCLUDED.legacy_operator_id,
       store_name = EXCLUDED.store_name,
       operator_name = EXCLUDED.operator_name,
       role = EXCLUDED.role,
       platform = EXCLUDED.platform,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       status = EXCLUDED.status,
       remark = EXCLUDED.remark,
       raw_data = EXCLUDED.raw_data,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      legacyId,
      store?.id || null,
      operator?.id || null,
      nullableText(storeLegacyId),
      nullableText(operatorLegacyId),
      text(relation?.storeName || store?.store_name || relation?.storeId),
      text(relation?.operatorName || operator?.operator_name || relation?.operatorId),
      text(relation?.role || 'primary'),
      text(relation?.platform || 'TEMU'),
      dateValue(relation?.startDate),
      dateValue(relation?.endDate),
      text(relation?.status || 'active'),
      nullableText(relation?.remark),
      json(relation),
      timestampValue(relation?.createdAt),
      timestampValue(relation?.updatedAt),
    ],
  );
  return result.rows[0].id;
}

async function resolveStoreAndOperator(client, storeKey, operatorName, reportDate) {
  const normalized = normalizeStoreKey(storeKey);
  const storeResult = await client.query(
    `SELECT id, legacy_id, store_name
     FROM temu_stores
     WHERE legacy_id = $1 OR store_name = $1 OR LOWER(REPLACE(store_name, ' ', '')) = $2
     LIMIT 1`,
    [text(storeKey), normalized],
  );
  const store = storeResult.rows[0];
  let relation = null;
  if (store) {
    const relationResult = await client.query(
      `SELECT r.operator_id, r.operator_name, o.operator_name AS resolved_operator_name
       FROM temu_store_operator_relations r
       LEFT JOIN temu_operators o ON o.id = r.operator_id
       WHERE r.status <> 'inactive'
         AND (r.store_id = $1 OR r.legacy_store_id = $2 OR r.store_name = $3)
         AND ($4::date IS NULL OR COALESCE(r.start_date, DATE '0001-01-01') <= $4::date)
         AND ($4::date IS NULL OR COALESCE(r.end_date, DATE '9999-12-31') >= $4::date)
       ORDER BY CASE WHEN r.role = 'primary' THEN 0 ELSE 1 END, r.updated_at DESC
       LIMIT 1`,
      [store.id, store.legacy_id, store.store_name, dateValue(reportDate)],
    );
    relation = relationResult.rows[0] || null;
  }

  return {
    storeId: store?.id || null,
    storeName: store?.store_name || text(storeKey),
    operatorId: relation?.operator_id || null,
    operatorName: relation?.resolved_operator_name || relation?.operator_name || text(operatorName),
  };
}

async function resolveOrderSkuProduct(client, owner, order) {
  if (!owner.storeId) {
    return { productId: null, productSkuId: null, temuSpuId: null, errorReason: '订单店铺未匹配，无法按店铺匹配 SKU' };
  }
  const skuId = nullableText(order?.productSku);
  const skuCode = nullableText(order?.skuCode);
  if (!skuId && !skuCode) {
    return { productId: null, productSkuId: null, temuSpuId: null, errorReason: '订单缺少 SKU ID 和 SKU货号' };
  }
  const result = await client.query(
    `SELECT id, product_id, temu_spu_id
     FROM temu_product_skus
     WHERE store_id = $1
       AND (($2::text IS NOT NULL AND sku_id = $2) OR ($3::text IS NOT NULL AND sku_code = $3))
     ORDER BY CASE WHEN $2::text IS NOT NULL AND sku_id = $2 THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 2`,
    [owner.storeId, skuId, skuCode],
  );
  if (result.rows.length > 1) {
    return { productId: null, productSkuId: null, temuSpuId: null, errorReason: `订单 SKU 匹配到多条商品 SKU：${skuId || skuCode}` };
  }
  const match = result.rows[0];
  if (!match) {
    return { productId: null, productSkuId: null, temuSpuId: null, errorReason: `订单 SKU 未匹配到商品信息：${skuId || skuCode}` };
  }
  return {
    productId: match.product_id || null,
    productSkuId: match.id || null,
    temuSpuId: match.temu_spu_id || null,
    errorReason: '',
  };
}

async function withClient(callback) {
  await runTemuMigrations();
  const { getAlibaba1688Pool } = await import('../alibaba1688/postgresDatabase.js');
  const client = await getAlibaba1688Pool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function syncAllTemuJsonToPostgres({ stores = [], operators = [], relations = [], orderStore, trafficStore, effectiveListings = [], warningRuleStore } = {}) {
  return withClient(async (client) => {
    const summary = {
      stores: 0,
      operators: 0,
      relations: 0,
      orderBatches: 0,
      orderItems: 0,
      trafficBatches: 0,
      trafficRecords: 0,
      effectiveNewListings: 0,
      warningRules: 0,
      errors: 0,
    };

    await client.query('DELETE FROM temu_import_errors');
    await client.query('DELETE FROM temu_order_items');
    await client.query('DELETE FROM temu_traffic_daily_records');
    await client.query('DELETE FROM temu_effective_new_listings');
    await client.query('DELETE FROM temu_warning_rules');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type IN ('order_sales','traffic_conversion','effective_new_listing','warning_rule') AND source_type = 'json_migration'`);

    for (const store of stores.filter((item) => text(item?.platform || 'TEMU').toUpperCase() === 'TEMU')) {
      await upsertStore(client, store);
      summary.stores += 1;
    }
    for (const operator of operators) {
      await upsertOperator(client, operator);
      summary.operators += 1;
    }
    for (const relation of relations.filter((item) => text(item?.platform || 'TEMU').toUpperCase() === 'TEMU')) {
      await upsertRelation(client, relation);
      summary.relations += 1;
    }

    const orderResult = await syncOrderStoreWithClient(client, orderStore || { batches: [] });
    Object.assign(summary, {
      orderBatches: orderResult.orderBatches,
      orderItems: orderResult.orderItems,
      errors: summary.errors + orderResult.errors,
    });

    const trafficResult = await syncTrafficStoreWithClient(client, trafficStore || { records: [], batches: [] });
    Object.assign(summary, {
      trafficBatches: trafficResult.trafficBatches,
      trafficRecords: trafficResult.trafficRecords,
      errors: summary.errors + trafficResult.errors,
    });

    summary.effectiveNewListings = await syncEffectiveListingsWithClient(client, effectiveListings);
    summary.warningRules = await syncWarningRulesWithClient(client, warningRuleStore || { settings: { displayLimit: 5 }, rules: [], growthRules: [] });

    return summary;
  });
}

export async function syncTemuReferenceJsonToPostgres({ stores = [], operators = [], relations = [] } = {}) {
  return withClient(async (client) => {
    let storesCount = 0;
    let operatorsCount = 0;
    let relationsCount = 0;
    for (const store of stores.filter((item) => text(item?.platform || 'TEMU').toUpperCase() === 'TEMU')) {
      await upsertStore(client, store);
      storesCount += 1;
    }
    for (const operator of operators) {
      await upsertOperator(client, operator);
      operatorsCount += 1;
    }
    for (const relation of relations.filter((item) => text(item?.platform || 'TEMU').toUpperCase() === 'TEMU')) {
      await upsertRelation(client, relation);
      relationsCount += 1;
    }
    return { stores: storesCount, operators: operatorsCount, relations: relationsCount };
  });
}

export async function syncOrderStoreToPostgres(orderStore = { batches: [] }) {
  return withClient(async (client) => {
    await client.query(`DELETE FROM temu_import_errors WHERE batch_id IN (SELECT id FROM temu_import_batches WHERE import_type = 'order_sales' AND source_type = 'json_migration')`);
    await client.query('DELETE FROM temu_order_items');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'order_sales' AND source_type = 'json_migration'`);
    return syncOrderStoreWithClient(client, orderStore);
  });
}

export async function replaceOrderStoreInPostgres(orderStore = { batches: [] }, { sourceType = 'api_import' } = {}) {
  return withClient(async (client) => {
    await client.query(`DELETE FROM temu_import_errors WHERE batch_id IN (SELECT id FROM temu_import_batches WHERE import_type = 'order_sales')`);
    await client.query('DELETE FROM temu_order_items');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'order_sales'`);
    return syncOrderStoreWithClient(client, orderStore, { sourceType });
  });
}

async function syncOrderStoreWithClient(client, orderStore, { sourceType = 'json_migration' } = {}) {
  const summary = { orderBatches: 0, orderItems: 0, errors: 0 };
  for (const batch of orderStore?.batches ?? []) {
    const batchId = text(batch?.batchId || batch?.id || `${batch?.fileName}-${batch?.importedAt}`);
    const importBatchId = await upsertImportBatch(client, {
      legacyId: batchId,
      sourceBatchId: batchId,
      importType: 'order_sales',
      sourceType,
      fileName: batch?.fileName,
      totalRows: batch?.totalRows ?? batch?.orders?.length ?? 0,
      successRows: batch?.validRows ?? batch?.orders?.length ?? 0,
      errorRows: batch?.duplicateRows ?? 0,
      status: 'success',
      uploadedAt: batch?.importedAt,
      finishedAt: batch?.importedAt,
      rawData: batch,
    });
    summary.orderBatches += 1;

    let rowNumber = 0;
    for (const order of batch?.orders ?? []) {
      rowNumber += 1;
      try {
        const orderDate = dateValue(order?.orderDate || order?.orderTime);
        const owner = await resolveStoreAndOperator(client, order?.storeName, order?.operatorName, orderDate);
        const skuMatch = await resolveOrderSkuProduct(client, owner, order);
        if (skuMatch.errorReason) {
          await insertImportError(client, importBatchId, rowNumber, skuMatch.errorReason, order);
        }
        const flags = orderStatusFlags(order?.status);
        const rowHash = sha256(`${batchId}|${rowNumber}|${json(order)}`);
        const quantity = numberValue(order?.quantity);
        const declaredPrice = numberValue(order?.declarePrice);
        const itemAmount = Number.isFinite(Number(order?.salesAmount))
          ? numberValue(order?.salesAmount)
          : declaredPrice * quantity;

        await client.query(
          `INSERT INTO temu_order_items (
             legacy_id, source_id, import_batch_id, source_batch_id, source_row_number, source_row_hash,
             order_no, store_id, store_name, operator_id, operator_name, product_id, product_sku_id,
             temu_product_id, temu_spu_id, sku_id, sku_code, declared_price, currency, quantity, item_amount, order_time, order_date,
             order_status, is_valid_order, is_cancelled, raw_data, updated_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,NOW())
           ON CONFLICT (source_batch_id, source_row_hash)
           DO UPDATE SET
             legacy_id = EXCLUDED.legacy_id,
             source_id = EXCLUDED.source_id,
             import_batch_id = EXCLUDED.import_batch_id,
             source_row_number = EXCLUDED.source_row_number,
             order_no = EXCLUDED.order_no,
             store_id = EXCLUDED.store_id,
             store_name = EXCLUDED.store_name,
             operator_id = EXCLUDED.operator_id,
             operator_name = EXCLUDED.operator_name,
             product_id = EXCLUDED.product_id,
             product_sku_id = EXCLUDED.product_sku_id,
             temu_product_id = EXCLUDED.temu_product_id,
             temu_spu_id = EXCLUDED.temu_spu_id,
             sku_id = EXCLUDED.sku_id,
             sku_code = EXCLUDED.sku_code,
             declared_price = EXCLUDED.declared_price,
             currency = EXCLUDED.currency,
             quantity = EXCLUDED.quantity,
             item_amount = EXCLUDED.item_amount,
             order_time = EXCLUDED.order_time,
             order_date = EXCLUDED.order_date,
             order_status = EXCLUDED.order_status,
             is_valid_order = EXCLUDED.is_valid_order,
             is_cancelled = EXCLUDED.is_cancelled,
             raw_data = EXCLUDED.raw_data,
             updated_at = NOW()`,
          [
            nullableText(order?.uniqueKey || `${batchId}-${rowNumber}`),
            nullableText(order?.uniqueKey),
            importBatchId,
            batchId,
            rowNumber,
            rowHash,
            text(order?.orderId),
            owner.storeId,
            owner.storeName,
            owner.operatorId,
            owner.operatorName,
            skuMatch.productId,
            skuMatch.productSkuId,
            null,
            skuMatch.temuSpuId,
            nullableText(order?.productSku),
            nullableText(order?.skuCode),
            declaredPrice,
            'CNY',
            quantity,
            itemAmount,
            timestampValue(order?.orderTime),
            orderDate,
            nullableText(order?.status),
            flags.isValidOrder,
            flags.isCancelled,
            json(order),
          ],
        );
        summary.orderItems += 1;
      } catch (error) {
        summary.errors += 1;
        await insertImportError(client, importBatchId, rowNumber, error instanceof Error ? error.message : String(error), order);
      }
    }
  }
  return summary;
}

export async function syncTrafficStoreToPostgres(trafficStore = { records: [], batches: [] }) {
  return withClient(async (client) => {
    await client.query(`DELETE FROM temu_import_errors WHERE batch_id IN (SELECT id FROM temu_import_batches WHERE import_type = 'traffic_conversion' AND source_type = 'json_migration')`);
    await client.query('DELETE FROM temu_traffic_daily_records');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'traffic_conversion' AND source_type = 'json_migration'`);
    return syncTrafficStoreWithClient(client, trafficStore);
  });
}

export async function replaceTrafficStoreInPostgres(trafficStore = { records: [], batches: [] }, { sourceType = 'api_import' } = {}) {
  return withClient(async (client) => {
    await client.query(`DELETE FROM temu_import_errors WHERE batch_id IN (SELECT id FROM temu_import_batches WHERE import_type = 'traffic_conversion')`);
    await client.query('DELETE FROM temu_traffic_daily_records');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'traffic_conversion'`);
    return syncTrafficStoreWithClient(client, trafficStore, { sourceType });
  });
}

async function syncTrafficStoreWithClient(client, trafficStore, { sourceType = 'json_migration' } = {}) {
  const summary = { trafficBatches: 0, trafficRecords: 0, errors: 0 };
  const batchMap = new Map((trafficStore?.batches ?? []).map((batch) => [text(batch?.id), batch]));
  const grouped = new Map();
  for (const record of trafficStore?.records ?? []) {
    const batchId = text(record?.batchId || 'legacy-traffic-json');
    const records = grouped.get(batchId) ?? [];
    records.push(record);
    grouped.set(batchId, records);
  }

  for (const [sourceBatchId, records] of grouped.entries()) {
    const batch = batchMap.get(sourceBatchId) || {};
    const first = records[0] || {};
    const owner = await resolveStoreAndOperator(client, first?.storeName, '', first?.date);
    const importBatchId = await upsertImportBatch(client, {
      legacyId: sourceBatchId,
      sourceBatchId,
      importType: 'traffic_conversion',
      sourceType,
      fileName: batch?.fileName || first?.fileName,
      storeId: owner.storeId,
      storeName: owner.storeName,
      totalRows: records.length,
      successRows: records.length,
      errorRows: 0,
      status: batch?.status || 'success',
      uploadedAt: batch?.importedAt || first?.importedAt,
      finishedAt: batch?.importedAt || first?.importedAt,
      rawData: { ...batch, records },
    });
    summary.trafficBatches += 1;

    let rowNumber = 0;
    for (const record of records) {
      rowNumber += 1;
      try {
        const reportDate = dateValue(record?.date);
        const rowOwner = await resolveStoreAndOperator(client, record?.storeName, '', reportDate);
        const rowHash = sha256(`${sourceBatchId}|${rowNumber}|${json(record)}`);
        await client.query(
          `INSERT INTO temu_traffic_daily_records (
             legacy_id, source_id, import_batch_id, source_batch_id, source_row_number, source_row_hash,
             store_id, store_name, operator_id, operator_name, report_date, total_views, total_visitors,
             total_pay_buyers, total_pay_conversion_rate, total_pay_pieces, product_views, product_visitors,
             detail_pay_buyers, detail_pay_conversion_rate, store_page_views, store_page_visitors,
             store_page_pay_buyers, store_page_pay_conversion_rate, is_current, raw_data, updated_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,TRUE,$25::jsonb,NOW())
           ON CONFLICT (source_batch_id, source_row_hash)
           DO UPDATE SET
             import_batch_id = EXCLUDED.import_batch_id,
             source_row_number = EXCLUDED.source_row_number,
             store_id = EXCLUDED.store_id,
             store_name = EXCLUDED.store_name,
             operator_id = EXCLUDED.operator_id,
             operator_name = EXCLUDED.operator_name,
             report_date = EXCLUDED.report_date,
             total_views = EXCLUDED.total_views,
             total_visitors = EXCLUDED.total_visitors,
             total_pay_buyers = EXCLUDED.total_pay_buyers,
             total_pay_conversion_rate = EXCLUDED.total_pay_conversion_rate,
             total_pay_pieces = EXCLUDED.total_pay_pieces,
             product_views = EXCLUDED.product_views,
             product_visitors = EXCLUDED.product_visitors,
             detail_pay_buyers = EXCLUDED.detail_pay_buyers,
             detail_pay_conversion_rate = EXCLUDED.detail_pay_conversion_rate,
             store_page_views = EXCLUDED.store_page_views,
             store_page_visitors = EXCLUDED.store_page_visitors,
             store_page_pay_buyers = EXCLUDED.store_page_pay_buyers,
             store_page_pay_conversion_rate = EXCLUDED.store_page_pay_conversion_rate,
             is_current = TRUE,
             raw_data = EXCLUDED.raw_data,
             updated_at = NOW()`,
          [
            nullableText(`${sourceBatchId}-${rowNumber}`),
            nullableText(`${record?.storeName || ''}-${record?.date || ''}`),
            importBatchId,
            sourceBatchId,
            rowNumber,
            rowHash,
            rowOwner.storeId,
            rowOwner.storeName,
            rowOwner.operatorId,
            rowOwner.operatorName,
            reportDate,
            numberValue(record?.totalViews),
            numberValue(record?.totalVisitors),
            numberValue(record?.totalPayBuyers),
            numberValue(record?.totalPayConversionRate),
            numberValue(record?.totalPayPieces),
            numberValue(record?.productViews),
            numberValue(record?.productVisitors),
            numberValue(record?.detailPayBuyers),
            numberValue(record?.detailPayConversionRate),
            numberValue(record?.storePageViews),
            numberValue(record?.storePageVisitors),
            numberValue(record?.storePagePayBuyers),
            numberValue(record?.storePagePayConversionRate),
            json(record),
          ],
        );
        summary.trafficRecords += 1;
      } catch (error) {
        summary.errors += 1;
        await insertImportError(client, importBatchId, rowNumber, error instanceof Error ? error.message : String(error), record);
      }
    }
  }
  return summary;
}

export async function syncEffectiveListingsToPostgres(items = []) {
  return withClient(async (client) => {
    await client.query('DELETE FROM temu_effective_new_listings');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'effective_new_listing' AND source_type = 'json_migration'`);
    return syncEffectiveListingsWithClient(client, items);
  });
}

async function syncEffectiveListingsWithClient(client, items) {
  const importBatchId = await upsertImportBatch(client, {
    sourceBatchId: 'effective-new-listings-json',
    importType: 'effective_new_listing',
    sourceType: 'json_migration',
    fileName: 'effective-new-listings.json',
    totalRows: items.length,
    successRows: items.length,
    status: 'success',
    uploadedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    rawData: { count: items.length },
  });
  let count = 0;
  for (const item of items) {
    const owner = await resolveStoreAndOperator(client, item?.storeId || item?.storeName, item?.operatorName, item?.siteJoinDate);
    await client.query(
      `INSERT INTO temu_effective_new_listings (
         legacy_id, import_batch_id, platform, store_id, legacy_store_id, store_name, operator_id,
         operator_name, site_join_date, skc, remark, created_by, created_by_name,
         raw_data, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,COALESCE($15::timestamptz,NOW()),COALESCE($16::timestamptz,NOW()))
       ON CONFLICT (legacy_id)
       DO UPDATE SET
         import_batch_id = EXCLUDED.import_batch_id,
         platform = EXCLUDED.platform,
         store_id = EXCLUDED.store_id,
         legacy_store_id = EXCLUDED.legacy_store_id,
         store_name = EXCLUDED.store_name,
         operator_id = EXCLUDED.operator_id,
         operator_name = EXCLUDED.operator_name,
         site_join_date = EXCLUDED.site_join_date,
         skc = EXCLUDED.skc,
         remark = EXCLUDED.remark,
         created_by = EXCLUDED.created_by,
         created_by_name = EXCLUDED.created_by_name,
         raw_data = EXCLUDED.raw_data,
         updated_at = EXCLUDED.updated_at`,
      [
        text(item?.id || `${item?.storeId}-${item?.siteJoinDate}-${item?.skc}`),
        importBatchId,
        text(item?.platform || 'TEMU'),
        owner.storeId,
        nullableText(item?.storeId),
        owner.storeName,
        owner.operatorId,
        owner.operatorName,
        dateValue(item?.siteJoinDate),
        text(item?.skc),
        nullableText(item?.remark),
        nullableText(item?.createdBy),
        nullableText(item?.createdByName),
        json(item),
        timestampValue(item?.createdAt),
        timestampValue(item?.updatedAt),
      ],
    );
    count += 1;
  }
  return count;
}

export async function syncWarningRulesToPostgres(ruleStore = { settings: { displayLimit: 5 }, rules: [], growthRules: [] }) {
  return withClient(async (client) => {
    await client.query('DELETE FROM temu_warning_rules');
    await client.query(`DELETE FROM temu_import_batches WHERE import_type = 'warning_rule' AND source_type = 'json_migration'`);
    return syncWarningRulesWithClient(client, ruleStore);
  });
}

async function syncWarningRulesWithClient(client, ruleStore) {
  const rules = [
    ...(ruleStore?.rules ?? []).map((rule) => ({ ...rule, ruleGroup: 'risk' })),
    ...(ruleStore?.growthRules ?? []).map((rule) => ({ ...rule, ruleGroup: 'growth' })),
  ];
  const importBatchId = await upsertImportBatch(client, {
    sourceBatchId: 'traffic-warning-rules-json',
    importType: 'warning_rule',
    sourceType: 'json_migration',
    fileName: 'traffic-warning-rules.json',
    totalRows: rules.length,
    successRows: rules.length,
    status: 'success',
    uploadedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    rawData: ruleStore,
  });
  let count = 0;
  for (const rule of rules) {
    await client.query(
      `INSERT INTO temu_warning_rules (
         legacy_id, import_batch_id, rule_group, rule_type, rule_name, metric_field,
         yellow_threshold, red_threshold, growth_threshold, enabled, sort_weight,
         display_limit, remark, raw_data, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW())
       ON CONFLICT (legacy_id)
       DO UPDATE SET
         import_batch_id = EXCLUDED.import_batch_id,
         rule_group = EXCLUDED.rule_group,
         rule_type = EXCLUDED.rule_type,
         rule_name = EXCLUDED.rule_name,
         metric_field = EXCLUDED.metric_field,
         yellow_threshold = EXCLUDED.yellow_threshold,
         red_threshold = EXCLUDED.red_threshold,
         growth_threshold = EXCLUDED.growth_threshold,
         enabled = EXCLUDED.enabled,
         sort_weight = EXCLUDED.sort_weight,
         display_limit = EXCLUDED.display_limit,
         remark = EXCLUDED.remark,
         raw_data = EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        `${rule.ruleGroup}-${text(rule.id)}`,
        importBatchId,
        rule.ruleGroup,
        text(rule.type),
        text(rule.name),
        text(rule.metricField),
        rule.yellowThreshold ?? null,
        rule.redThreshold ?? null,
        rule.growthThreshold ?? null,
        rule.enabled !== false,
        numberValue(rule.sortWeight),
        numberValue(ruleStore?.settings?.displayLimit, 5),
        nullableText(rule.remark),
        json(rule),
      ],
    );
    count += 1;
  }
  return count;
}

export async function readTemuCollectionFromPostgres(name) {
  if (name === 'stores') {
    const result = await queryTemuDatabase(
      `SELECT id, legacy_id, store_name, platform, platform_store_id, site_country, store_group,
              country, status, group_name, remark, created_at, updated_at
       FROM temu_stores
       ORDER BY store_name`,
    );
    return result.rows.map((row) => ({
      id: row.legacy_id,
      dbId: row.id,
      storeName: row.store_name,
      platform: row.platform,
      platformStoreId: row.platform_store_id || '',
      siteCountry: row.site_country || '',
      storeGroup: row.store_group || '',
      country: row.country || '',
      status: row.status,
      groupName: row.group_name || '',
      remark: row.remark || '',
      createdAt: row.created_at?.toISOString?.() || '',
      updatedAt: row.updated_at?.toISOString?.() || '',
    }));
  }

  if (name === 'operators') {
    const result = await queryTemuDatabase(
      `SELECT legacy_id, operator_name, team_id, group_name, level, status, remark, created_at, updated_at
       FROM temu_operators
       ORDER BY operator_name`,
    );
    return result.rows.map((row) => ({
      id: row.legacy_id,
      operatorName: row.operator_name,
      teamId: row.team_id || '',
      groupName: row.group_name || '',
      level: row.level || '',
      status: row.status,
      remark: row.remark || '',
      createdAt: row.created_at?.toISOString?.() || '',
      updatedAt: row.updated_at?.toISOString?.() || '',
    }));
  }

  if (name === 'storeOperatorRelations') {
    const result = await queryTemuDatabase(
      `SELECT r.legacy_id, r.legacy_store_id, r.legacy_operator_id, r.store_name, r.operator_name,
              r.role, r.platform, r.start_date, r.end_date, r.status, r.remark, r.created_at, r.updated_at
       FROM temu_store_operator_relations r
       ORDER BY r.store_name, r.operator_name`,
    );
    return result.rows.map((row) => ({
      id: row.legacy_id,
      storeId: row.legacy_store_id || row.store_name,
      operatorId: row.legacy_operator_id || row.operator_name,
      storeName: row.store_name,
      operatorName: row.operator_name,
      role: row.role,
      platform: row.platform,
      startDate: row.start_date?.toISOString?.().slice(0, 10) || '',
      endDate: row.end_date?.toISOString?.().slice(0, 10) || '',
      status: row.status,
      remark: row.remark || '',
      createdAt: row.created_at?.toISOString?.() || '',
      updatedAt: row.updated_at?.toISOString?.() || '',
    }));
  }

  return null;
}

export async function readOrderImportStoreFromPostgres() {
  const batchesResult = await queryTemuDatabase(
    `SELECT id, source_batch_id, file_name, uploaded_at, total_rows, success_rows, error_rows, raw_data
     FROM temu_import_batches
     WHERE import_type = 'order_sales' AND source_type IN ('json_migration', 'api_import')
     ORDER BY uploaded_at, created_at`,
  );
  const ordersResult = await queryTemuDatabase(
    `SELECT b.source_batch_id, o.raw_data
     FROM temu_order_items o
     JOIN temu_import_batches b ON b.id = o.import_batch_id
     WHERE b.import_type = 'order_sales' AND b.source_type IN ('json_migration', 'api_import')
     ORDER BY b.uploaded_at, o.source_row_number`,
  );
  const ordersByBatch = new Map();
  for (const row of ordersResult.rows) {
    const orders = ordersByBatch.get(row.source_batch_id) ?? [];
    orders.push(row.raw_data);
    ordersByBatch.set(row.source_batch_id, orders);
  }
  return {
    batches: batchesResult.rows.map((row) => {
      const orders = ordersByBatch.get(row.source_batch_id) ?? [];
      return {
        ...(row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}),
        batchId: row.source_batch_id,
        fileName: row.file_name || '',
        importedAt: row.uploaded_at?.toISOString?.() || '',
        totalRows: row.total_rows,
        validRows: row.success_rows,
        duplicateRows: row.error_rows,
        orders,
      };
    }),
  };
}

export async function readTrafficConversionStoreFromPostgres() {
  const recordsResult = await queryTemuDatabase(
    `SELECT r.raw_data, b.source_batch_id
     FROM temu_traffic_daily_records r
     JOIN temu_import_batches b ON b.id = r.import_batch_id
     WHERE b.import_type = 'traffic_conversion'
       AND b.source_type IN ('json_migration', 'api_import')
       AND r.is_current = TRUE
     ORDER BY r.report_date, r.store_name`,
  );
  const batchesResult = await queryTemuDatabase(
    `SELECT source_batch_id, file_name, uploaded_at, store_name, total_rows, success_rows, status, raw_data
     FROM temu_import_batches
     WHERE import_type = 'traffic_conversion' AND source_type IN ('json_migration', 'api_import')
     ORDER BY uploaded_at, created_at`,
  );
  return {
    records: recordsResult.rows.map((row) => ({
      ...(row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}),
      batchId: row.raw_data?.batchId || row.source_batch_id,
    })),
    batches: batchesResult.rows.map((row) => ({
      ...(row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {}),
      id: row.source_batch_id,
      fileName: row.file_name || '',
      importedAt: row.uploaded_at?.toISOString?.() || '',
      storeName: row.store_name || '',
      detailCount: row.total_rows,
      newCount: row.success_rows,
      status: row.status,
    })),
  };
}

export async function readEffectiveListingsFromPostgres() {
  const result = await queryTemuDatabase(
    `SELECT legacy_id, platform, legacy_store_id, store_name, operator_name, site_join_date,
            skc, remark, created_by, created_by_name, created_at, updated_at
     FROM temu_effective_new_listings
     ORDER BY site_join_date DESC, store_name, skc`,
  );
  return result.rows.map((row) => ({
    id: row.legacy_id,
    platform: row.platform,
    storeId: row.legacy_store_id || '',
    storeName: row.store_name || '',
    operatorName: row.operator_name || '',
    siteJoinDate: row.site_join_date?.toISOString?.().slice(0, 10) || '',
    skc: row.skc,
    remark: row.remark || '',
    createdBy: row.created_by || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at?.toISOString?.() || '',
    updatedAt: row.updated_at?.toISOString?.() || '',
  }));
}
