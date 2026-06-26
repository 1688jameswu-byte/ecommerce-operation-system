import * as XLSX from 'xlsx';
import { queryTemuDatabase, runTemuMigrations } from './postgresDatabase.js';
import { getAlibaba1688Pool } from '../alibaba1688/postgresDatabase.js';

const PRODUCT_FIELDS = {
  storeName: ['店铺', '店铺名称', 'store', 'storeName'],
  temuProductId: ['商品ID', '商品 ID', '商品id', 'product id', 'temu_product_id'],
  temuSpuId: ['SPU ID', 'SPU', 'spu id', 'temu_spu_id'],
  productName: ['商品名称', '品名', 'product name'],
  productImageUrl: ['商品图片', '图片', '主图', 'image', 'image url'],
  categoryName: ['类目', '分类', 'category'],
  skuId: ['SKU ID', 'sku id', 'SKUID'],
  skuCode: ['SKU货号', 'SKU 货号', '货号', 'sku_code', 'SKU编码'],
  skuName: ['SKU名称', 'SKU 名称', '规格', 'sku name'],
  firstOnlineAt: ['首次上架时间', '上架时间', 'first_online_at', '首次上架日期'],
  productStatus: ['商品状态', '状态', 'product status'],
  currentPrice: ['当前售价', '售价', '价格', 'current_price'],
  currentInventory: ['当前库存', '库存', 'current_inventory'],
};

const AD_FIELDS = {
  storeName: ['店铺', '店铺名称', 'store', 'storeName'],
  productName: ['商品名称', '品名', 'product name'],
  temuProductId: ['商品ID', '商品 ID', '商品id', 'product id'],
  temuSpuId: ['SPU ID', 'SPU', 'spu id'],
  adSpend: ['总花费', '花费', 'ad_spend'],
  netAdSpend: ['净总花费', '净花费'],
  globalSalesAmount: ['申报价销售额（全域）', '申报价销售额(全域)', '全域销售额'],
  globalRoas: ['投资回报率ROAS（全域）', '投资回报率ROAS(全域)', '全域ROAS'],
  globalAcos: ['费比（全域）', '费比(全域)', '全域费比'],
  globalCpa: ['每笔成交花费（全域）', '每笔成交花费(全域)'],
  globalSubOrderCount: ['子订单数（全域）', '子订单数(全域)'],
  globalUnitCount: ['件数（全域）', '件数(全域)'],
  globalImpressions: ['曝光（全域）', '曝光(全域)'],
  globalClicks: ['点击（全域）', '点击(全域)'],
  globalCtr: ['点击率（全域）', '点击率(全域)'],
  globalCvr: ['转化率（全域）', '转化率(全域)'],
  globalAddToCartCount: ['加入购物车数（全域）', '加入购物车数(全域)', '加购（全域）'],
  promoSalesAmount: ['申报价销售额（推广）', '申报价销售额(推广)', '推广销售额'],
  promoRoas: ['投资回报率ROAS（推广）', '投资回报率ROAS(推广)', '推广ROAS'],
  promoWeekRoas: ['自然周投资回报率ROAS（推广）', '自然周投资回报率ROAS(推广)'],
  targetRoas: ['自然周目标ROAS（推广）', '自然周目标ROAS(推广)', '目标ROAS'],
  promoAcos: ['费比（推广）', '费比(推广)', '推广费比'],
  promoCpa: ['每笔成交花费（推广）', '每笔成交花费(推广)'],
  promoSubOrderCount: ['子订单数（推广）', '子订单数(推广)'],
  promoUnitCount: ['件数（推广）', '件数(推广)'],
  promoImpressions: ['曝光（推广）', '曝光(推广)'],
  promoClicks: ['点击（推广）', '点击(推广)'],
  promoCtr: ['点击率（推广）', '点击率(推广)'],
  promoCvr: ['转化率（推广）', '转化率(推广)'],
  promoAddToCartCount: ['加购（推广）', '加购(推广)', '加购'],
  netPromoSalesAmount: ['净申报价销售额（推广）', '净申报价销售额(推广)'],
  netPromoRoas: ['净投资回报率ROAS（推广）', '净投资回报率ROAS(推广)'],
  netPromoAcos: ['净费比（推广）', '净费比(推广)'],
  netPromoCpa: ['净每笔成交花费（推广）', '净每笔成交花费(推广)'],
  netPromoSubOrderCount: ['净子订单数（推广）', '净子订单数(推广)'],
  netPromoUnitCount: ['净件数（推广）', '净件数(推广)'],
};

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const next = text(value);
  return next || null;
}

function normalizeHeader(value) {
  return text(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeSkuCode(value) {
  return text(value).replace(/\s+/g, '').toUpperCase();
}

function numberValue(value, fallback = 0) {
  const raw = text(value).replace(/[%￥¥,]/g, '');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return text(value).includes('%') ? parsed / 100 : parsed;
}

function nullableNumber(value) {
  const raw = text(value);
  if (!raw) return null;
  return numberValue(raw, null);
}

function dateText(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const raw = text(value);
  const matched = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (matched) {
    return `${matched[1]}-${String(matched[2]).padStart(2, '0')}-${String(matched[3]).padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) ? raw.slice(0, 10) : null;
}

function safeDivide(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : null;
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function inferMapping(headers, fieldMap) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  return Object.fromEntries(Object.entries(fieldMap).map(([field, candidates]) => {
    const matched = candidates.find((candidate) => normalized.has(normalizeHeader(candidate)));
    return [field, matched ? normalized.get(normalizeHeader(matched)) : ''];
  }));
}

function mapRow(row, mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, header ? row[header] : '']));
}

export function parseExcelDataUrl(dataUrl) {
  const base64 = String(dataUrl || '').split(',').pop() || '';
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { sheetName, headers, rows };
}

export function buildImportPreview({ rows = [], headers = [], type }) {
  const mapping = inferMapping(headers, type === 'ad' ? AD_FIELDS : PRODUCT_FIELDS);
  return {
    headers,
    mapping,
    previewRows: rows.slice(0, 20),
    totalRows: rows.length,
  };
}

async function resolveStoreAndOperator(client, storeName, reportDate) {
  const storeResult = await client.query(
    `SELECT id, store_name FROM temu_stores
     WHERE store_name = $1 OR legacy_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [text(storeName)],
  );
  const store = storeResult.rows[0] || null;
  let relation = null;
  if (store) {
    const relationResult = await client.query(
      `SELECT r.operator_id, COALESCE(o.operator_name, r.operator_name) AS operator_name
       FROM temu_store_operator_relations r
       LEFT JOIN temu_operators o ON o.id = r.operator_id
       WHERE r.status <> 'inactive'
         AND (r.store_id = $1 OR r.store_name = $2)
         AND ($3::date IS NULL OR COALESCE(r.start_date, DATE '0001-01-01') <= $3::date)
         AND ($3::date IS NULL OR COALESCE(r.end_date, DATE '9999-12-31') >= $3::date)
       ORDER BY CASE WHEN r.role = 'primary' THEN 0 ELSE 1 END, r.updated_at DESC
       LIMIT 1`,
      [store.id, store.store_name, dateText(reportDate)],
    );
    relation = relationResult.rows[0] || null;
  }
  return {
    storeId: store?.id || null,
    storeName: store?.store_name || text(storeName),
    operatorId: relation?.operator_id || null,
    operatorName: relation?.operator_name || '',
  };
}

async function createImportBatch(client, payload) {
  const result = await client.query(
    `INSERT INTO temu_import_batches (
       source_batch_id, import_type, source_type, file_name, report_date, store_id, store_name,
       total_rows, success_rows, error_rows, status, error_message,
       uploaded_by, uploaded_by_name, uploaded_at, finished_at, raw_data, updated_at
     )
     VALUES ($1,$2,'excel_import',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW(),$14::jsonb,NOW())
     RETURNING id`,
    [
      payload.sourceBatchId,
      payload.importType,
      payload.fileName || '',
      dateText(payload.reportDate),
      payload.storeId || null,
      payload.storeName || '',
      payload.totalRows || 0,
      payload.successRows || 0,
      payload.errorRows || 0,
      payload.status || 'success',
      payload.errorMessage || null,
      payload.uploadedBy || null,
      payload.uploadedByName || null,
      json(payload.rawData || {}),
    ],
  );
  return result.rows[0].id;
}

async function insertImportError(client, batchId, rowNumber, reason, rawData) {
  await client.query(
    `INSERT INTO temu_import_errors (batch_id, row_number, error_reason, raw_data)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [batchId, rowNumber, reason, json(rawData)],
  );
}

async function addTimeline(client, event) {
  await client.query(
    `INSERT INTO temu_product_timeline (
       product_id, store_id, operator_id, event_type, event_date, event_time,
       title, description, source_type, source_id, raw_data
     )
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,NOW()),$7,$8,$9,$10,$11::jsonb)`,
    [
      event.productId,
      event.storeId || null,
      event.operatorId || null,
      event.eventType,
      dateText(event.eventDate),
      event.eventTime || null,
      event.title || '',
      event.description || '',
      event.sourceType || '',
      event.sourceId || '',
      json(event.rawData || {}),
    ],
  );
}

async function upsertProduct(client, row, batchId, rowNumber) {
  const data = mapRow(row, row.__mapping);
  const firstOnlineAt = dateText(data.firstOnlineAt);
  if (!text(data.storeName)) throw new Error('缺少店铺');
  if (!text(data.temuProductId)) throw new Error('缺少商品ID');
  if (!firstOnlineAt) throw new Error('缺少或无法识别首次上架时间');
  const owner = await resolveStoreAndOperator(client, data.storeName, firstOnlineAt);
  if (!owner.storeId) throw new Error(`未匹配到 TEMU 店铺：${text(data.storeName)}`);
  const before = await client.query(
    `SELECT id, current_price, current_inventory FROM temu_products WHERE store_id = $1 AND temu_product_id = $2 LIMIT 1`,
    [owner.storeId, text(data.temuProductId)],
  );
  const result = await client.query(
    `INSERT INTO temu_products (
       legacy_id, source_id, store_id, store_name, operator_id, operator_name,
       temu_product_id, temu_spu_id, product_name, product_image_url, category_name,
       first_online_at, product_status, current_price, current_inventory, raw_data, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14,$15,$16::jsonb,NOW())
     ON CONFLICT (store_id, temu_product_id) WHERE store_id IS NOT NULL AND temu_product_id IS NOT NULL
     DO UPDATE SET
       store_name = EXCLUDED.store_name,
       operator_id = EXCLUDED.operator_id,
       operator_name = EXCLUDED.operator_name,
       temu_spu_id = EXCLUDED.temu_spu_id,
       product_name = EXCLUDED.product_name,
       product_image_url = EXCLUDED.product_image_url,
       category_name = EXCLUDED.category_name,
       first_online_at = EXCLUDED.first_online_at,
       product_status = EXCLUDED.product_status,
       current_price = EXCLUDED.current_price,
       current_inventory = EXCLUDED.current_inventory,
       raw_data = EXCLUDED.raw_data,
       updated_at = NOW()
     RETURNING id`,
    [
      `${owner.storeId}-${text(data.temuProductId)}`,
      `${batchId}-${rowNumber}`,
      owner.storeId,
      owner.storeName,
      owner.operatorId,
      owner.operatorName,
      text(data.temuProductId),
      nullableText(data.temuSpuId),
      text(data.productName),
      nullableText(data.productImageUrl),
      nullableText(data.categoryName),
      firstOnlineAt,
      nullableText(data.productStatus),
      nullableNumber(data.currentPrice),
      Math.trunc(numberValue(data.currentInventory)),
      json(row),
    ],
  );
  const productId = result.rows[0].id;
  if (!before.rows[0]) {
    await addTimeline(client, {
      productId,
      storeId: owner.storeId,
      operatorId: owner.operatorId,
      eventType: 'PRODUCT_ONLINE',
      eventDate: firstOnlineAt,
      eventTime: firstOnlineAt,
      title: '商品首次上架',
      description: text(data.productName),
      sourceType: 'product_import',
      sourceId: String(batchId),
      rawData: row,
    });
  } else {
    const oldPrice = Number(before.rows[0].current_price);
    const newPrice = Number(data.currentPrice);
    if (Number.isFinite(newPrice) && oldPrice !== newPrice) {
      await addTimeline(client, {
        productId,
        storeId: owner.storeId,
        operatorId: owner.operatorId,
        eventType: 'PRICE_CHANGE',
        eventDate: new Date().toISOString().slice(0, 10),
        title: '价格变化',
        description: `${oldPrice || 0} -> ${newPrice}`,
        sourceType: 'product_import',
        sourceId: String(batchId),
        rawData: row,
      });
    }
    const oldInventory = Number(before.rows[0].current_inventory);
    const newInventory = Number(data.currentInventory);
    if (Number.isFinite(newInventory) && oldInventory !== newInventory) {
      await addTimeline(client, {
        productId,
        storeId: owner.storeId,
        operatorId: owner.operatorId,
        eventType: 'INVENTORY_CHANGE',
        eventDate: new Date().toISOString().slice(0, 10),
        title: '库存变化',
        description: `${oldInventory || 0} -> ${newInventory}`,
        sourceType: 'product_import',
        sourceId: String(batchId),
        rawData: row,
      });
    }
  }

  const skuId = nullableText(data.skuId);
  const skuCode = normalizeSkuCode(data.skuCode);
  if (skuId || skuCode) {
    const existingSku = await client.query(
      `SELECT id FROM temu_product_skus
       WHERE store_id = $1 AND COALESCE(sku_id, '') = COALESCE($2, '') AND COALESCE(sku_code, '') = COALESCE($3, '')
       LIMIT 1`,
      [owner.storeId, skuId, skuCode || null],
    );
    if (existingSku.rows[0]) {
      await client.query(
        `UPDATE temu_product_skus
         SET product_id=$1, store_name=$2, temu_product_id=$3, temu_spu_id=$4, sku_name=$5,
             sku_price=$6, sku_inventory=$7, raw_data=$8::jsonb, updated_at=NOW()
         WHERE id=$9`,
        [productId, owner.storeName, text(data.temuProductId), nullableText(data.temuSpuId), nullableText(data.skuName), nullableNumber(data.currentPrice), Math.trunc(numberValue(data.currentInventory)), json(row), existingSku.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO temu_product_skus (
           product_id, store_id, store_name, temu_product_id, temu_spu_id,
           sku_id, sku_code, sku_name, sku_price, sku_inventory, raw_data
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [productId, owner.storeId, owner.storeName, text(data.temuProductId), nullableText(data.temuSpuId), skuId, skuCode || null, nullableText(data.skuName), nullableNumber(data.currentPrice), Math.trunc(numberValue(data.currentInventory)), json(row)],
      );
    }
  }
  return productId;
}

async function findProductForAd(client, owner, data) {
  const result = await client.query(
    `SELECT id FROM temu_products
     WHERE store_id = $1 AND (temu_product_id = $2 OR ($3 <> '' AND temu_spu_id = $3))
     ORDER BY CASE WHEN temu_product_id = $2 THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [owner.storeId, text(data.temuProductId), text(data.temuSpuId)],
  );
  return result.rows[0]?.id || null;
}

async function upsertAdRow(client, row, batchId, rowNumber, reportDate, fallbackStoreName) {
  const data = mapRow(row, row.__mapping);
  const storeName = text(data.storeName || fallbackStoreName);
  if (!storeName) throw new Error('缺少店铺，请在页面选择店铺或映射店铺字段');
  if (!text(data.temuProductId)) throw new Error('缺少商品ID');
  const owner = await resolveStoreAndOperator(client, storeName, reportDate);
  if (!owner.storeId) throw new Error(`未匹配到 TEMU 店铺：${storeName}`);
  const productId = await findProductForAd(client, owner, data);
  await client.query(
    `INSERT INTO temu_ad_product_daily (
       report_date, import_batch_id, store_id, store_name, operator_id, operator_name,
       product_id, temu_product_id, temu_spu_id, product_name, ad_spend, net_ad_spend,
       global_sales_amount, global_roas, global_acos, global_cpa, global_sub_order_count,
       global_unit_count, global_impressions, global_clicks, global_ctr, global_cvr,
       global_add_to_cart_count, promo_sales_amount, promo_roas, promo_week_roas, target_roas,
       promo_acos, promo_cpa, promo_sub_order_count, promo_unit_count, promo_impressions,
       promo_clicks, promo_ctr, promo_cvr, promo_add_to_cart_count, net_promo_sales_amount,
       net_promo_roas, net_promo_acos, net_promo_cpa, net_promo_sub_order_count,
       net_promo_unit_count, raw_data, updated_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
       $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43::jsonb,NOW()
     )
     ON CONFLICT (store_id, report_date, temu_product_id) WHERE store_id IS NOT NULL AND temu_product_id IS NOT NULL
     DO UPDATE SET
       import_batch_id=EXCLUDED.import_batch_id, store_name=EXCLUDED.store_name,
       operator_id=EXCLUDED.operator_id, operator_name=EXCLUDED.operator_name, product_id=EXCLUDED.product_id,
       temu_spu_id=EXCLUDED.temu_spu_id, product_name=EXCLUDED.product_name, ad_spend=EXCLUDED.ad_spend,
       net_ad_spend=EXCLUDED.net_ad_spend, global_sales_amount=EXCLUDED.global_sales_amount,
       global_roas=EXCLUDED.global_roas, global_acos=EXCLUDED.global_acos, global_cpa=EXCLUDED.global_cpa,
       global_sub_order_count=EXCLUDED.global_sub_order_count, global_unit_count=EXCLUDED.global_unit_count,
       global_impressions=EXCLUDED.global_impressions, global_clicks=EXCLUDED.global_clicks,
       global_ctr=EXCLUDED.global_ctr, global_cvr=EXCLUDED.global_cvr,
       global_add_to_cart_count=EXCLUDED.global_add_to_cart_count, promo_sales_amount=EXCLUDED.promo_sales_amount,
       promo_roas=EXCLUDED.promo_roas, promo_week_roas=EXCLUDED.promo_week_roas, target_roas=EXCLUDED.target_roas,
       promo_acos=EXCLUDED.promo_acos, promo_cpa=EXCLUDED.promo_cpa, promo_sub_order_count=EXCLUDED.promo_sub_order_count,
       promo_unit_count=EXCLUDED.promo_unit_count, promo_impressions=EXCLUDED.promo_impressions,
       promo_clicks=EXCLUDED.promo_clicks, promo_ctr=EXCLUDED.promo_ctr, promo_cvr=EXCLUDED.promo_cvr,
       promo_add_to_cart_count=EXCLUDED.promo_add_to_cart_count, net_promo_sales_amount=EXCLUDED.net_promo_sales_amount,
       net_promo_roas=EXCLUDED.net_promo_roas, net_promo_acos=EXCLUDED.net_promo_acos, net_promo_cpa=EXCLUDED.net_promo_cpa,
       net_promo_sub_order_count=EXCLUDED.net_promo_sub_order_count, net_promo_unit_count=EXCLUDED.net_promo_unit_count,
       raw_data=EXCLUDED.raw_data, updated_at=NOW()`,
    [
      dateText(reportDate),
      batchId,
      owner.storeId,
      owner.storeName,
      owner.operatorId,
      owner.operatorName,
      productId,
      text(data.temuProductId),
      nullableText(data.temuSpuId),
      nullableText(data.productName),
      nullableNumber(data.adSpend),
      nullableNumber(data.netAdSpend),
      nullableNumber(data.globalSalesAmount),
      nullableNumber(data.globalRoas),
      nullableNumber(data.globalAcos),
      nullableNumber(data.globalCpa),
      nullableNumber(data.globalSubOrderCount),
      nullableNumber(data.globalUnitCount),
      nullableNumber(data.globalImpressions),
      nullableNumber(data.globalClicks),
      nullableNumber(data.globalCtr),
      nullableNumber(data.globalCvr),
      nullableNumber(data.globalAddToCartCount),
      nullableNumber(data.promoSalesAmount),
      nullableNumber(data.promoRoas),
      nullableNumber(data.promoWeekRoas),
      nullableNumber(data.targetRoas),
      nullableNumber(data.promoAcos),
      nullableNumber(data.promoCpa),
      nullableNumber(data.promoSubOrderCount),
      nullableNumber(data.promoUnitCount),
      nullableNumber(data.promoImpressions),
      nullableNumber(data.promoClicks),
      nullableNumber(data.promoCtr),
      nullableNumber(data.promoCvr),
      nullableNumber(data.promoAddToCartCount),
      nullableNumber(data.netPromoSalesAmount),
      nullableNumber(data.netPromoRoas),
      nullableNumber(data.netPromoAcos),
      nullableNumber(data.netPromoCpa),
      nullableNumber(data.netPromoSubOrderCount),
      nullableNumber(data.netPromoUnitCount),
      json(row),
    ],
  );
  if (productId) {
    const spend = numberValue(data.adSpend);
    const clicks = numberValue(data.promoClicks || data.globalClicks);
    const orders = numberValue(data.promoSubOrderCount || data.globalSubOrderCount);
    if (spend > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_SPEND', eventDate: reportDate, title: '广告产生花费', description: String(spend), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
    if (clicks > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_CLICK', eventDate: reportDate, title: '广告产生点击', description: String(clicks), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
    if (orders > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_ORDER', eventDate: reportDate, title: '广告产生订单', description: String(orders), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
  }
}

export async function importProductRows({ rows = [], mapping = {}, fileName = '', currentUser = {} }) {
  await runTemuMigrations();
  const client = await getAlibaba1688Pool().connect();
  const sourceBatchId = `product-info-${Date.now().toString(36)}`;
  let batchId = null;
  const errors = [];
  const productIds = new Set();
  try {
    await client.query('BEGIN');
    batchId = await createImportBatch(client, {
      sourceBatchId,
      importType: 'product_info',
      fileName,
      totalRows: rows.length,
      status: 'processing',
      uploadedBy: currentUser.userId || currentUser.username,
      uploadedByName: currentUser.displayName || currentUser.username,
      rawData: { fileName },
    });
    let rowNumber = 0;
    for (const row of rows) {
      rowNumber += 1;
      try {
        const productId = await upsertProduct(client, { ...row, __mapping: mapping }, batchId, rowNumber);
        productIds.add(productId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push({ rowNumber, errorReason: reason, rawData: row });
        await insertImportError(client, batchId, rowNumber, reason, row);
      }
    }
    await client.query(
      `UPDATE temu_import_batches SET success_rows=$1,error_rows=$2,status=$3,finished_at=NOW(),updated_at=NOW() WHERE id=$4`,
      [rows.length - errors.length, errors.length, errors.length ? 'partial_success' : 'success', batchId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await rebuildNewProductSnapshots({ productIds: Array.from(productIds) });
  return { ok: true, totalRows: rows.length, successRows: rows.length - errors.length, errorRows: errors.length, errors };
}

export async function importAdRows({ rows = [], mapping = {}, fileName = '', reportDate, storeName = '', currentUser = {} }) {
  await runTemuMigrations();
  const client = await getAlibaba1688Pool().connect();
  const sourceBatchId = `ad-report-${dateText(reportDate)}-${Date.now().toString(36)}`;
  const errors = [];
  if (!dateText(reportDate)) throw new Error('报表日期必填');
  try {
    await client.query('BEGIN');
    const owner = storeName ? await resolveStoreAndOperator(client, storeName, reportDate) : {};
    const batchId = await createImportBatch(client, {
      sourceBatchId,
      importType: 'ad_product_daily',
      fileName,
      reportDate,
      storeId: owner.storeId,
      storeName: owner.storeName || storeName,
      totalRows: rows.length,
      status: 'processing',
      uploadedBy: currentUser.userId || currentUser.username,
      uploadedByName: currentUser.displayName || currentUser.username,
      rawData: { fileName, reportDate, storeName },
    });
    let rowNumber = 0;
    for (const row of rows) {
      rowNumber += 1;
      try {
        await upsertAdRow(client, { ...row, __mapping: mapping }, batchId, rowNumber, reportDate, storeName);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push({ rowNumber, errorReason: reason, rawData: row });
        await insertImportError(client, batchId, rowNumber, reason, row);
      }
    }
    await client.query(
      `UPDATE temu_import_batches SET success_rows=$1,error_rows=$2,status=$3,finished_at=NOW(),updated_at=NOW() WHERE id=$4`,
      [rows.length - errors.length, errors.length, errors.length ? 'partial_success' : 'success', batchId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await rebuildNewProductSnapshots({ snapshotDate: dateText(reportDate) });
  return { ok: true, totalRows: rows.length, successRows: rows.length - errors.length, errorRows: errors.length, errors };
}

function stageForDays(days) {
  if (days <= 3) return 'COLD_START';
  if (days <= 7) return 'TESTING';
  if (days <= 14) return 'SCALING';
  if (days <= 30) return 'OBSERVATION';
  return 'NORMAL';
}

function tagFor(row) {
  const adOrderCount = Number(row.ad_order_count || 0);
  const roas = row.roas === null ? null : Number(row.roas);
  const targetRoas = row.target_roas === null ? null : Number(row.target_roas);
  const adSpend = Number(row.ad_spend || 0);
  const clicks = Number(row.clicks || 0);
  const addToCart = Number(row.add_to_cart_count || 0);
  const impressions = Number(row.impressions || 0);
  const orderCount = Number(row.order_count || 0);
  const naturalOrderCount = Number(row.natural_order_count || 0);
  if (adSpend >= 5 && adOrderCount === 0 && clicks >= 10) return '烧钱无单';
  if (adOrderCount > 0 && targetRoas !== null && roas !== null && roas < targetRoas) return '高费比新品';
  if (adOrderCount > 0 && targetRoas !== null && roas !== null && roas >= targetRoas) return '高潜新品';
  if (addToCart >= 3 && adOrderCount === 0) return '加购未成交';
  if (clicks >= 10 && adOrderCount === 0) return '有流量无转化';
  if (row.is_ad_enabled && impressions < 50 && adSpend === 0) return '低曝光新品';
  if (orderCount > adOrderCount && naturalOrderCount > 0) return '自然起量';
  return '普通新品';
}

function recommendationForTag(tag) {
  const map = {
    高潜新品: ['INCREASE_BUDGET', 'MEDIUM', '建议加预算', 'ROAS 已达到目标，有继续放量空间。', '加预算或扩大投放'],
    烧钱无单: ['PAUSE_OR_BID_DOWN', 'HIGH', '建议暂停广告或降低出价', '广告有花费和点击但没有订单。', '暂停广告或降低出价'],
    有流量无转化: ['OPTIMIZE_PRODUCT', 'MEDIUM', '建议优化商品', '点击充足但没有形成广告订单。', '优化主图、价格、评价或详情'],
    加购未成交: ['OPTIMIZE_CONVERSION', 'MEDIUM', '建议优化价格、优惠、配送或下单路径', '加购后没有成交。', '检查优惠、配送和转化链路'],
    低曝光新品: ['CHECK_AD_DELIVERY', 'MEDIUM', '建议检查广告状态、预算、出价或商品是否可推广', '广告开启但曝光偏低。', '检查预算、出价和商品推广状态'],
    高费比新品: ['CONTROL_BUDGET', 'HIGH', '建议降出价或控制预算', 'ROAS 低于目标。', '降低出价或收紧预算'],
  };
  return map[tag] || null;
}

async function upsertRecommendation(client, snapshot) {
  const recommendation = recommendationForTag(snapshot.product_tag);
  if (!recommendation) return null;
  const [type, priority, textValue, reason, action] = recommendation;
  const result = await client.query(
    `INSERT INTO temu_ad_recommendations (
       recommendation_date, store_id, store_name, operator_id, operator_name,
       product_id, temu_product_id, temu_spu_id, product_name, recommendation_type,
       priority, problem_type, recommendation_text, reason_text, suggested_action, status, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDING',NOW())
     ON CONFLICT (recommendation_date, product_id, recommendation_type)
     DO UPDATE SET
       store_id=EXCLUDED.store_id, store_name=EXCLUDED.store_name, operator_id=EXCLUDED.operator_id,
       operator_name=EXCLUDED.operator_name, temu_product_id=EXCLUDED.temu_product_id,
       temu_spu_id=EXCLUDED.temu_spu_id, product_name=EXCLUDED.product_name,
       priority=EXCLUDED.priority, problem_type=EXCLUDED.problem_type,
       recommendation_text=EXCLUDED.recommendation_text, reason_text=EXCLUDED.reason_text,
       suggested_action=EXCLUDED.suggested_action, updated_at=NOW()
     RETURNING recommendation_type, recommendation_text`,
    [
      snapshot.snapshot_date,
      snapshot.store_id,
      snapshot.store_name,
      snapshot.operator_id,
      snapshot.operator_name,
      snapshot.product_id,
      snapshot.temu_product_id,
      snapshot.temu_spu_id,
      snapshot.product_name,
      type,
      priority,
      snapshot.product_tag,
      textValue,
      reason,
      action,
    ],
  );
  await addTimeline(client, {
    productId: snapshot.product_id,
    storeId: snapshot.store_id,
    operatorId: snapshot.operator_id,
    eventType: 'SYSTEM_RECOMMENDATION',
    eventDate: snapshot.snapshot_date,
    title: textValue,
    description: reason,
    sourceType: 'ad_recommendation',
    sourceId: type,
    rawData: snapshot,
  });
  return result.rows[0];
}

export async function rebuildNewProductSnapshots({ snapshotDate = new Date().toISOString().slice(0, 10), productIds = [] } = {}) {
  await runTemuMigrations();
  const client = await getAlibaba1688Pool().connect();
  const targetDate = dateText(snapshotDate);
  try {
    await client.query('BEGIN');
    const productFilter = productIds.length ? 'AND p.id = ANY($2::uuid[])' : '';
    const params = productIds.length ? [targetDate, productIds] : [targetDate];
    const products = await client.query(
      `SELECT p.*
       FROM temu_products p
       WHERE p.first_online_at IS NOT NULL
         AND p.first_online_at::date <= $1::date
         AND p.first_online_at::date >= ($1::date - INTERVAL '29 days')::date
         ${productFilter}
       ORDER BY p.first_online_at DESC`,
      params,
    );
    let count = 0;
    for (const product of products.rows) {
      const orderResult = await client.query(
        `SELECT COUNT(DISTINCT o.order_no) AS order_count,
                COALESCE(SUM(o.quantity),0) AS order_quantity,
                COALESCE(SUM(o.item_amount),0) AS order_sales_amount,
                MIN(o.order_time) AS first_order_time,
                MAX(o.order_time) AS last_order_time
         FROM temu_order_items o
         LEFT JOIN temu_product_skus s ON (
           o.product_sku_id = s.id OR (
             s.store_id = o.store_id AND (
               (o.sku_id IS NOT NULL AND o.sku_id <> '' AND s.sku_id = o.sku_id) OR
               (o.sku_code IS NOT NULL AND o.sku_code <> '' AND s.sku_code = o.sku_code)
             )
           )
         )
         WHERE o.is_valid_order = TRUE
           AND o.is_cancelled = FALSE
           AND o.order_date = $1::date
           AND (o.product_id = $2 OR s.product_id = $2 OR (o.temu_product_id IS NOT NULL AND o.temu_product_id = $3))`,
        [targetDate, product.id, product.temu_product_id],
      );
      const adResult = await client.query(
        `SELECT COALESCE(SUM(ad_spend),0) AS ad_spend,
                COALESCE(SUM(promo_sales_amount),0) AS ad_sales_amount,
                COALESCE(SUM(promo_sub_order_count),0) AS ad_order_count,
                COALESCE(SUM(promo_unit_count),0) AS ad_unit_count,
                COALESCE(SUM(promo_impressions),0) AS impressions,
                COALESCE(SUM(promo_clicks),0) AS clicks,
                COALESCE(SUM(promo_add_to_cart_count),0) AS add_to_cart_count,
                MAX(target_roas) AS target_roas
         FROM temu_ad_product_daily
         WHERE report_date = $1::date
           AND (product_id = $2 OR (store_id = $3 AND temu_product_id = $4) OR (store_id = $3 AND temu_spu_id = $5))`,
        [targetDate, product.id, product.store_id, product.temu_product_id, product.temu_spu_id],
      );
      const orders = orderResult.rows[0] || {};
      const ads = adResult.rows[0] || {};
      const orderCount = Number(orders.order_count || 0);
      const adOrderCount = Number(ads.ad_order_count || 0);
      const adSpend = Number(ads.ad_spend || 0);
      const adSales = Number(ads.ad_sales_amount || 0);
      const clicks = Number(ads.clicks || 0);
      const impressions = Number(ads.impressions || 0);
      const orderSales = Number(orders.order_sales_amount || 0);
      const firstDate = dateText(product.first_online_at);
      const daysOnline = Math.floor((new Date(`${targetDate}T00:00:00Z`) - new Date(`${firstDate}T00:00:00Z`)) / 86400000) + 1;
      const naturalOrderCount = Math.max(orderCount - adOrderCount, 0);
      const naturalSalesAmount = Math.max(orderSales - adSales, 0);
      const snapshot = {
        snapshot_date: targetDate,
        store_id: product.store_id,
        store_name: product.store_name,
        operator_id: product.operator_id,
        operator_name: product.operator_name,
        product_id: product.id,
        temu_product_id: product.temu_product_id,
        temu_spu_id: product.temu_spu_id,
        product_name: product.product_name,
        product_image_url: product.product_image_url,
        category_name: product.category_name,
        first_online_at: product.first_online_at,
        days_online: daysOnline,
        new_product_stage: stageForDays(daysOnline),
        current_price: product.current_price,
        current_inventory: product.current_inventory,
        product_status: product.product_status,
        is_new_product: daysOnline >= 1 && daysOnline <= 30,
        is_ad_enabled: adSpend > 0 || impressions > 0 || clicks > 0,
        is_ordered: orderCount > 0,
        order_count: orderCount,
        order_quantity: Number(orders.order_quantity || 0),
        order_sales_amount: orderSales,
        first_order_time: orders.first_order_time,
        last_order_time: orders.last_order_time,
        ad_spend: adSpend,
        ad_sales_amount: adSales,
        ad_order_count: adOrderCount,
        ad_unit_count: Number(ads.ad_unit_count || 0),
        impressions,
        clicks,
        add_to_cart_count: Number(ads.add_to_cart_count || 0),
        target_roas: ads.target_roas === null ? null : Number(ads.target_roas),
        roas: safeDivide(adSales, adSpend),
        acos: safeDivide(adSpend, adSales),
        ctr: safeDivide(clicks, impressions),
        cvr: safeDivide(adOrderCount, clicks),
        cpc: safeDivide(adSpend, clicks),
        natural_order_count: naturalOrderCount,
        natural_sales_amount: naturalSalesAmount,
        natural_order_ratio: safeDivide(naturalOrderCount, orderCount),
      };
      snapshot.product_tag = tagFor(snapshot);
      snapshot.abnormal_type = snapshot.product_tag === '普通新品' || snapshot.product_tag === '高潜新品' || snapshot.product_tag === '自然起量' ? null : snapshot.product_tag;
      const recommendation = recommendationForTag(snapshot.product_tag);
      snapshot.latest_recommendation_type = recommendation?.[0] || null;
      snapshot.latest_recommendation_text = recommendation?.[2] || null;
      await client.query(
        `INSERT INTO temu_new_product_daily_snapshot (
           snapshot_date, store_id, store_name, operator_id, operator_name, product_id,
           temu_product_id, temu_spu_id, product_name, product_image_url, category_name,
           first_online_at, days_online, new_product_stage, current_price, current_inventory,
           product_status, is_new_product, is_ad_enabled, is_ordered, order_count,
           order_quantity, order_sales_amount, first_order_time, last_order_time,
           ad_spend, ad_sales_amount, ad_order_count, ad_unit_count, impressions, clicks,
           add_to_cart_count, target_roas, roas, acos, ctr, cvr, cpc,
           natural_order_count, natural_sales_amount, natural_order_ratio, product_tag,
           abnormal_type, latest_recommendation_type, latest_recommendation_text, updated_at
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
           $39,$40,$41,$42,$43,$44,$45,NOW()
         )
         ON CONFLICT (snapshot_date, product_id)
         DO UPDATE SET
           store_id=EXCLUDED.store_id, store_name=EXCLUDED.store_name, operator_id=EXCLUDED.operator_id,
           operator_name=EXCLUDED.operator_name, temu_product_id=EXCLUDED.temu_product_id,
           temu_spu_id=EXCLUDED.temu_spu_id, product_name=EXCLUDED.product_name,
           product_image_url=EXCLUDED.product_image_url, category_name=EXCLUDED.category_name,
           first_online_at=EXCLUDED.first_online_at, days_online=EXCLUDED.days_online,
           new_product_stage=EXCLUDED.new_product_stage, current_price=EXCLUDED.current_price,
           current_inventory=EXCLUDED.current_inventory, product_status=EXCLUDED.product_status,
           is_new_product=EXCLUDED.is_new_product, is_ad_enabled=EXCLUDED.is_ad_enabled,
           is_ordered=EXCLUDED.is_ordered, order_count=EXCLUDED.order_count,
           order_quantity=EXCLUDED.order_quantity, order_sales_amount=EXCLUDED.order_sales_amount,
           first_order_time=EXCLUDED.first_order_time, last_order_time=EXCLUDED.last_order_time,
           ad_spend=EXCLUDED.ad_spend, ad_sales_amount=EXCLUDED.ad_sales_amount,
           ad_order_count=EXCLUDED.ad_order_count, ad_unit_count=EXCLUDED.ad_unit_count,
           impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, add_to_cart_count=EXCLUDED.add_to_cart_count,
           target_roas=EXCLUDED.target_roas, roas=EXCLUDED.roas, acos=EXCLUDED.acos,
           ctr=EXCLUDED.ctr, cvr=EXCLUDED.cvr, cpc=EXCLUDED.cpc,
           natural_order_count=EXCLUDED.natural_order_count, natural_sales_amount=EXCLUDED.natural_sales_amount,
           natural_order_ratio=EXCLUDED.natural_order_ratio, product_tag=EXCLUDED.product_tag,
           abnormal_type=EXCLUDED.abnormal_type, latest_recommendation_type=EXCLUDED.latest_recommendation_type,
           latest_recommendation_text=EXCLUDED.latest_recommendation_text, updated_at=NOW()`,
        [
          snapshot.snapshot_date, snapshot.store_id, snapshot.store_name, snapshot.operator_id, snapshot.operator_name,
          snapshot.product_id, snapshot.temu_product_id, snapshot.temu_spu_id, snapshot.product_name,
          snapshot.product_image_url, snapshot.category_name, snapshot.first_online_at, snapshot.days_online,
          snapshot.new_product_stage, snapshot.current_price, snapshot.current_inventory, snapshot.product_status,
          snapshot.is_new_product, snapshot.is_ad_enabled, snapshot.is_ordered, snapshot.order_count,
          snapshot.order_quantity, snapshot.order_sales_amount, snapshot.first_order_time, snapshot.last_order_time,
          snapshot.ad_spend, snapshot.ad_sales_amount, snapshot.ad_order_count, snapshot.ad_unit_count,
          snapshot.impressions, snapshot.clicks, snapshot.add_to_cart_count, snapshot.target_roas,
          snapshot.roas, snapshot.acos, snapshot.ctr, snapshot.cvr, snapshot.cpc, snapshot.natural_order_count,
          snapshot.natural_sales_amount, snapshot.natural_order_ratio, snapshot.product_tag, snapshot.abnormal_type,
          snapshot.latest_recommendation_type, snapshot.latest_recommendation_text,
        ],
      );
      const savedSnapshot = await client.query(
        `SELECT * FROM temu_new_product_daily_snapshot WHERE snapshot_date = $1 AND product_id = $2`,
        [targetDate, product.id],
      );
      await upsertRecommendation(client, savedSnapshot.rows[0]);
      if (orderCount > 0) {
        await addTimeline(client, { productId: product.id, storeId: product.store_id, operatorId: product.operator_id, eventType: 'FIRST_ORDER', eventDate: targetDate, title: '商品出单', description: `${orderCount} 单`, sourceType: 'snapshot', sourceId: targetDate, rawData: snapshot });
      }
      count += 1;
    }
    await client.query('COMMIT');
    return { ok: true, snapshotDate: targetDate, snapshotRows: count };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function toCamel(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
    value,
  ]));
}

function buildScopeWhere(params, startIndex = 1) {
  const values = [];
  const where = [];
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${startIndex + values.length - 1}`));
  };
  if (params.storeId) push('s.store_id = ?', params.storeId);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`s.store_id = ANY($${startIndex + values.length - 1}::uuid[])`);
    }
  }
  if (params.operatorId) push('s.operator_id = ?', params.operatorId);
  if (params.categoryName) push('s.category_name = ?', params.categoryName);
  if (params.productTag) push('s.product_tag = ?', params.productTag);
  if (params.isAdEnabled !== undefined) push('s.is_ad_enabled = ?', params.isAdEnabled === 'true' || params.isAdEnabled === true);
  if (params.isOrdered !== undefined) push('s.is_ordered = ?', params.isOrdered === 'true' || params.isOrdered === true);
  if (params.dateStart) push('s.first_online_at::date >= ?', params.dateStart);
  if (params.dateEnd) push('s.first_online_at::date <= ?', params.dateEnd);
  if (params.roasMin) push('s.roas >= ?', Number(params.roasMin));
  if (params.roasMax) push('s.roas <= ?', Number(params.roasMax));
  if (params.acosMin) push('s.acos >= ?', Number(params.acosMin));
  if (params.acosMax) push('s.acos <= ?', Number(params.acosMax));
  if (params.adSpendMin) push('s.ad_spend >= ?', Number(params.adSpendMin));
  if (params.adSpendMax) push('s.ad_spend <= ?', Number(params.adSpendMax));
  return { where, values };
}

export async function getProducts(params = {}) {
  const snapshotDate = dateText(params.snapshotDate) || new Date().toISOString().slice(0, 10);
  await rebuildNewProductSnapshots({ snapshotDate });
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)));
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.*, COUNT(*) OVER() AS total
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     ORDER BY s.first_online_at DESC, s.updated_at DESC
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [snapshotDate, ...values, pageSize, (page - 1) * pageSize],
  );
  return {
    records: result.rows.map((row) => toCamel(row)),
    total: Number(result.rows[0]?.total || 0),
    page,
    pageSize,
  };
}

export async function getBossDashboard(params = {}) {
  const snapshotDate = dateText(params.snapshotDate) || new Date().toISOString().slice(0, 10);
  await rebuildNewProductSnapshots({ snapshotDate });
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const summary = await queryTemuDatabase(
    `SELECT
       COUNT(*) FILTER (WHERE days_online = 1) AS today_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7 AND is_ordered) AS recent7_ordered_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30 AND is_ordered) AS recent30_ordered_count,
       COALESCE(SUM(ad_spend),0) AS ad_spend,
       COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
       COUNT(*) FILTER (WHERE product_tag IN ('烧钱无单','高费比新品')) AS loss_new_count,
       COUNT(*) FILTER (WHERE product_tag = '高潜新品') AS high_potential_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}`,
    [snapshotDate, ...values],
  );
  const operatorRanking = await queryTemuDatabase(
    `SELECT operator_id, operator_name, COUNT(*) AS new_count, COALESCE(SUM(order_count),0) AS order_count,
            COALESCE(SUM(ad_spend),0) AS ad_spend, COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY operator_id, operator_name
     ORDER BY order_count DESC, new_count DESC
     LIMIT 20`,
    [snapshotDate, ...values],
  );
  const storeRanking = await queryTemuDatabase(
    `SELECT store_id, store_name, COUNT(*) AS new_count, COALESCE(SUM(order_count),0) AS order_count,
            COALESCE(SUM(ad_spend),0) AS ad_spend, COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY store_id, store_name
     ORDER BY order_count DESC, new_count DESC
     LIMIT 20`,
    [snapshotDate, ...values],
  );
  const row = summary.rows[0] || {};
  return {
    snapshotDate,
    summary: {
      todayNewCount: Number(row.today_new_count || 0),
      recent7NewCount: Number(row.recent7_new_count || 0),
      recent7OrderedRate: safeDivide(row.recent7_ordered_count, row.recent7_new_count),
      recent30NewCount: Number(row.recent30_new_count || 0),
      recent30OrderedRate: safeDivide(row.recent30_ordered_count, row.recent30_new_count),
      adSpend: Number(row.ad_spend || 0),
      adSalesAmount: Number(row.ad_sales_amount || 0),
      roas: safeDivide(row.ad_sales_amount, row.ad_spend),
      lossNewCount: Number(row.loss_new_count || 0),
      highPotentialCount: Number(row.high_potential_count || 0),
    },
    operatorRanking: operatorRanking.rows.map(toCamel),
    storeRanking: storeRanking.rows.map(toCamel),
  };
}

export async function getOperatorDashboard(params = {}) {
  const data = await getBossDashboard(params);
  const recommendations = await getRecommendations({ ...params, status: 'PENDING', pageSize: 10 });
  return { ...data, recommendations: recommendations.records };
}

export async function getRecommendations(params = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)));
  const values = [];
  const where = [];
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (params.recommendationDate) push('r.recommendation_date = ?', params.recommendationDate);
  if (params.storeId) push('r.store_id = ?', params.storeId);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`r.store_id = ANY($${values.length}::uuid[])`);
    }
  }
  if (params.operatorId) push('r.operator_id = ?', params.operatorId);
  if (params.recommendationType) push('r.recommendation_type = ?', params.recommendationType);
  if (params.priority) push('r.priority = ?', params.priority);
  if (params.status) push('r.status = ?', params.status);
  if (params.productTag) push('s.product_tag = ?', params.productTag);
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await queryTemuDatabase(
    `SELECT r.*, s.product_image_url, s.days_online, s.product_tag, s.ad_spend, s.ad_sales_amount,
            s.ad_order_count, s.clicks, s.add_to_cart_count, s.roas, s.target_roas, s.acos,
            COUNT(*) OVER() AS total
     FROM temu_ad_recommendations r
     LEFT JOIN temu_new_product_daily_snapshot s ON s.product_id = r.product_id AND s.snapshot_date = r.recommendation_date
     ${condition}
     ORDER BY CASE r.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, r.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { records: result.rows.map(toCamel), total: Number(result.rows[0]?.total || 0), page, pageSize };
}

export async function handleRecommendation(id, payload = {}, currentUser = {}) {
  const status = text(payload.status || 'ACCEPTED');
  const note = text(payload.handleNote || payload.note);
  const result = await queryTemuDatabase(
    `UPDATE temu_ad_recommendations
     SET status=$1, handled_by=$2, handled_by_name=$3, handled_at=NOW(), handle_note=$4, updated_at=NOW()
     WHERE id=$5
     RETURNING *`,
    [status, currentUser.userId || currentUser.username || '', currentUser.displayName || currentUser.username || '', note, id],
  );
  const row = result.rows[0];
  if (row) {
    await queryTemuDatabase(
      `INSERT INTO temu_product_timeline (
         product_id, store_id, operator_id, event_type, event_date, title, description, source_type, source_id, raw_data
       )
       VALUES ($1,$2,$3,'OPERATOR_ACTION',CURRENT_DATE,$4,$5,'ad_recommendation',$6,$7::jsonb)`,
      [row.product_id, row.store_id, row.operator_id, `建议处理：${status}`, note, row.id, json(row)],
    );
  }
  return { ok: true, recommendation: row ? toCamel(row) : null };
}

export async function getProductDetail(productId) {
  const product = await queryTemuDatabase(`SELECT * FROM temu_products WHERE id = $1`, [productId]);
  const skus = await queryTemuDatabase(`SELECT * FROM temu_product_skus WHERE product_id = $1 ORDER BY sku_code`, [productId]);
  const snapshots = await queryTemuDatabase(`SELECT * FROM temu_new_product_daily_snapshot WHERE product_id = $1 ORDER BY snapshot_date DESC LIMIT 30`, [productId]);
  const ads = await queryTemuDatabase(`SELECT * FROM temu_ad_product_daily WHERE product_id = $1 ORDER BY report_date DESC LIMIT 30`, [productId]);
  const orders = await queryTemuDatabase(
    `SELECT o.order_date, COUNT(DISTINCT o.order_no) AS order_count, COALESCE(SUM(o.quantity),0) AS quantity, COALESCE(SUM(o.item_amount),0) AS sales_amount
     FROM temu_order_items o
     LEFT JOIN temu_product_skus s ON o.product_sku_id = s.id OR (s.store_id = o.store_id AND (s.sku_id = o.sku_id OR s.sku_code = o.sku_code))
     WHERE o.is_valid_order = TRUE AND o.is_cancelled = FALSE AND (o.product_id = $1 OR s.product_id = $1)
     GROUP BY o.order_date
     ORDER BY o.order_date DESC
     LIMIT 30`,
    [productId],
  );
  const recommendations = await queryTemuDatabase(`SELECT * FROM temu_ad_recommendations WHERE product_id = $1 ORDER BY recommendation_date DESC, created_at DESC`, [productId]);
  const timeline = await queryTemuDatabase(`SELECT * FROM temu_product_timeline WHERE product_id = $1 ORDER BY event_time DESC LIMIT 100`, [productId]);
  return {
    product: product.rows[0] ? toCamel(product.rows[0]) : null,
    skus: skus.rows.map(toCamel),
    snapshots: snapshots.rows.map(toCamel),
    ads: ads.rows.map(toCamel),
    orders: orders.rows.map(toCamel),
    recommendations: recommendations.rows.map(toCamel),
    timeline: timeline.rows.map(toCamel),
  };
}
