import * as XLSX from 'xlsx';
import { queryTemuDatabase, runTemuMigrations } from './postgresDatabase.js';
import { getAlibaba1688Pool } from '../alibaba1688/postgresDatabase.js';

const PRODUCT_FIELDS = {
  storeName: ['店铺', '店铺名称', 'store', 'storeName'],
  productTitle: ['商品标题'],
  spuId: ['SPU ID'],
  skcId: ['SKC ID'],
  skuId: ['SKU ID'],
  skcCode: ['SKC货号'],
  skuCode: ['SKU货号'],
  leafCategoryName: ['叶子类目名称'],
  productStatus: ['商品状态'],
  spec1Name: ['规格1名称'],
  spec2Name: ['规格2名称'],
  declaredPriceCny: ['申报价格(CNY)', '申报价格（CNY）'],
  declaredPriceStatus: ['申报价格状态'],
  createdTime: ['创建时间'],
  temuProductId: ['商品ID', '商品 ID', '商品id', 'product id', 'temu_product_id'],
  temuSpuId: ['SPU ID', 'SPU', 'spu id', 'temu_spu_id'],
  productName: ['商品名称', '商品标题', '品名', 'product name'],
  productImageUrl: ['商品图片', '图片', '主图', 'image', 'image url'],
  categoryName: ['类目', '分类', 'category', '叶子类目名称'],
  skuName: ['SKU名称', 'SKU 名称', '规格', 'sku name', '规格1名称', '规格2名称'],
  firstOnlineAt: ['首次上架时间', '上架时间', 'first_online_at', '首次上架日期', '创建时间'],
  currentPrice: ['当前售价', '售价', '价格', 'current_price', '申报价格(CNY)', '申报价格（CNY）', '申报价格'],
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

PRODUCT_FIELDS.storeName.push('店铺', '店铺名称');
PRODUCT_FIELDS.temuProductId.push('商品ID', '商品 ID');
PRODUCT_FIELDS.temuSpuId.push('SPU ID', 'SPUID');
PRODUCT_FIELDS.productName.push('商品名称', '商品标题', '品名');
PRODUCT_FIELDS.productImageUrl.push('商品图片', '图片', '主图');
PRODUCT_FIELDS.categoryName.push('类目', '分类', '叶子类目名称');
PRODUCT_FIELDS.skuId.push('SKU ID', 'SKUID');
PRODUCT_FIELDS.skuCode.push('SKU货号', 'SKU 货号', 'SKC货号', '货号');
PRODUCT_FIELDS.skuName.push('SKU名称', 'SKU 名称', '规格', '规格1名称', '规格2名称');
PRODUCT_FIELDS.firstOnlineAt.push('首次上架时间', '上架时间', '创建时间', '首次上架日期');
PRODUCT_FIELDS.productStatus.push('商品状态', '状态', '申报价格状态');
PRODUCT_FIELDS.currentPrice.push('当前售价', '售价', '价格', '申报价格(CNY)', '申报价格');
PRODUCT_FIELDS.currentInventory.push('当前库存', '库存', '可售库存');
PRODUCT_FIELDS.productTitle.push('商品标题');
PRODUCT_FIELDS.spuId.push('SPU ID', 'SPUID');
PRODUCT_FIELDS.skcId.push('SKC ID', 'SKCID', 'SKC');
PRODUCT_FIELDS.skcCode.push('SKC货号', 'SKC 货号');
PRODUCT_FIELDS.leafCategoryName.push('叶子类目名称');
PRODUCT_FIELDS.spec1Name.push('规格1名称');
PRODUCT_FIELDS.spec2Name.push('规格2名称');
PRODUCT_FIELDS.declaredPriceCny.push('申报价格(CNY)', '申报价格（CNY）', '申报价格');
PRODUCT_FIELDS.declaredPriceStatus.push('申报价格状态');
PRODUCT_FIELDS.createdTime.push('创建时间');

AD_FIELDS.storeName.push('店铺', '店铺名称');
AD_FIELDS.productName.push('商品名称', '商品标题', '品名');
AD_FIELDS.temuProductId.push('商品ID', '商品 ID');
AD_FIELDS.temuSpuId.push('SPU ID', 'SPUID');
AD_FIELDS.adSpend.push('总花费', '花费');
AD_FIELDS.netAdSpend.push('净总花费', '净花费');
AD_FIELDS.globalSalesAmount.push('申报价销售额（全域）', '申报价销售额(全域)', '全域销售额');
AD_FIELDS.globalRoas.push('投资回报率ROAS（全域）', '投资回报率ROAS(全域)', '全域ROAS');
AD_FIELDS.globalRoas.push('投资回报率(ROAS)（全域）', '投资回报率(ROAS)(全域)');
AD_FIELDS.globalAcos.push('费比（全域）', '费比(全域)', '全域费比');
AD_FIELDS.globalCpa.push('每笔成交花费（全域）', '每笔成交花费(全域)');
AD_FIELDS.globalSubOrderCount.push('子订单数（全域）', '子订单数(全域)');
AD_FIELDS.globalUnitCount.push('件数（全域）', '件数(全域)');
AD_FIELDS.globalImpressions.push('曝光（全域）', '曝光(全域)');
AD_FIELDS.globalClicks.push('点击（全域）', '点击(全域)');
AD_FIELDS.globalCtr.push('点击率（全域）', '点击率(全域)');
AD_FIELDS.globalCvr.push('转化率（全域）', '转化率(全域)');
AD_FIELDS.globalAddToCartCount.push('加入购物车数（全域）', '加入购物车数(全域)', '加购（全域）');
AD_FIELDS.promoSalesAmount.push('申报价销售额（推广）', '申报价销售额(推广)', '推广销售额');
AD_FIELDS.promoRoas.push('投资回报率ROAS（推广）', '投资回报率ROAS(推广)', '推广ROAS');
AD_FIELDS.promoRoas.push('投资回报率(ROAS)（推广）', '投资回报率(ROAS)(推广)');
AD_FIELDS.promoWeekRoas.push('自然周投资回报率ROAS（推广）', '自然周投资回报率ROAS(推广)');
AD_FIELDS.promoWeekRoas.push('自然周投资回报率(ROAS)（推广）', '自然周投资回报率(ROAS)(推广)');
AD_FIELDS.targetRoas.push('自然周目标ROAS（推广）', '自然周目标ROAS(推广)', '目标ROAS');
AD_FIELDS.promoAcos.push('费比（推广）', '费比(推广)', '推广费比');
AD_FIELDS.promoCpa.push('每笔成交花费（推广）', '每笔成交花费(推广)');
AD_FIELDS.promoSubOrderCount.push('子订单数（推广）', '子订单数(推广)');
AD_FIELDS.promoUnitCount.push('件数（推广）', '件数(推广)');
AD_FIELDS.promoImpressions.push('曝光（推广）', '曝光(推广)');
AD_FIELDS.promoClicks.push('点击（推广）', '点击(推广)');
AD_FIELDS.promoCtr.push('点击率（推广）', '点击率(推广)');
AD_FIELDS.promoCvr.push('转化率（推广）', '转化率(推广)');
AD_FIELDS.promoAddToCartCount.push('加购（推广）', '加购(推广)', '加购');
AD_FIELDS.netPromoSalesAmount.push('净申报价销售额（推广）', '净申报价销售额(推广)');
AD_FIELDS.netPromoRoas.push('净投资回报率ROAS（推广）', '净投资回报率ROAS(推广)');
AD_FIELDS.netPromoRoas.push('净投资回报率(ROAS)（推广）', '净投资回报率(ROAS)(推广)');
AD_FIELDS.netPromoAcos.push('净费比（推广）', '净费比(推广)');
AD_FIELDS.netPromoCpa.push('净每笔成交花费（推广）', '净每笔成交花费(推广)');
AD_FIELDS.netPromoSubOrderCount.push('净子订单数（推广）', '净子订单数(推广)');
AD_FIELDS.netPromoUnitCount.push('净件数（推广）', '净件数(推广)');

// TEMU 广告报表不同导出版的表头不完全一致。有些文件会把全域和推广列
// 导成同名表头，xlsx 会自动追加 _1 后缀；这里只增强读取兼容，不改变口径。
AD_FIELDS.productName.push('商品名称', '商品标题', '品名');
AD_FIELDS.temuProductId.push('商品ID', '商品 ID');
AD_FIELDS.temuSpuId.push('SPU ID', 'SPUID');
AD_FIELDS.adSpend.push('总花费', '花费');
AD_FIELDS.netAdSpend.push('净总花费', '净花费');
AD_FIELDS.globalSalesAmount.push('申报价销售额（全域）', '申报价销售额(全域)', '全域销售额');
AD_FIELDS.globalRoas.push('投资回报率(ROAS)（全域）', '投资回报率(ROAS)(全域)', '投资回报率ROAS（全域）', '投资回报率ROAS(全域)', '全域ROAS');
AD_FIELDS.globalAcos.push('费比（全域）', '费比(全域)', '全域费比');
AD_FIELDS.globalCpa.push('每笔成交花费（全域）', '每笔成交花费(全域)');
AD_FIELDS.globalSubOrderCount.push('子订单数（全域）', '子订单数(全域)');
AD_FIELDS.globalUnitCount.push('件数（全域）', '件数(全域)');
AD_FIELDS.globalImpressions.push('曝光（全域）', '曝光(全域)');
AD_FIELDS.globalClicks.push('点击（全域）', '点击(全域)');
AD_FIELDS.globalCtr.push('点击率（全域）', '点击率(全域)');
AD_FIELDS.globalCvr.push('转化率（全域）', '转化率(全域)');
AD_FIELDS.globalAddToCartCount.push('加入购物车数（全域）', '加入购物车数(全域)', '加购（全域）', '加购(全域)');
AD_FIELDS.promoSalesAmount.push('申报价销售额（推广）', '申报价销售额(推广)', '推广销售额');
AD_FIELDS.promoRoas.push('投资回报率(ROAS)（推广）', '投资回报率(ROAS)(推广)', '投资回报率ROAS（推广）', '投资回报率ROAS(推广)', '推广ROAS');
AD_FIELDS.promoWeekRoas.push('自然周投资回报率(ROAS)（推广）', '自然周投资回报率(ROAS)(推广)');
AD_FIELDS.targetRoas.push('自然周目标ROAS（推广）', '自然周目标ROAS(推广)', '目标ROAS');
AD_FIELDS.promoAcos.push('费比（推广）', '费比(推广)', '推广费比');
AD_FIELDS.promoCpa.push('每笔成交花费（推广）', '每笔成交花费(推广)');
AD_FIELDS.promoSubOrderCount.push('子订单数（推广）', '子订单数(推广)');
AD_FIELDS.promoUnitCount.push('件数（推广）', '件数(推广)');
AD_FIELDS.promoImpressions.push('曝光（推广）', '曝光(推广)');
AD_FIELDS.promoClicks.push('点击（推广）', '点击(推广)');
AD_FIELDS.promoCtr.push('点击率（推广）', '点击率(推广)');
AD_FIELDS.promoCvr.push('转化率（推广）', '转化率(推广)');
AD_FIELDS.promoAddToCartCount.push('加购（推广）', '加购(推广)', '加购');
AD_FIELDS.netPromoSalesAmount.push('净申报价销售额（推广）', '净申报价销售额(推广)', '净申报价销售额（全域）', '净申报价销售额(全域)');
AD_FIELDS.netPromoRoas.push('净投资回报率(ROAS)（推广）', '净投资回报率(ROAS)(推广)', '净投资回报率(ROAS)（全域）', '净投资回报率(ROAS)(全域)');
AD_FIELDS.netPromoAcos.push('净费比（推广）', '净费比(推广)', '净费比（全域）', '净费比(全域)');
AD_FIELDS.netPromoCpa.push('净每笔成交花费（推广）', '净每笔成交花费(推广)', '净每笔成交花费（全域）', '净每笔成交花费(全域)');
AD_FIELDS.netPromoSubOrderCount.push('净子订单数（推广）', '净子订单数(推广)', '净子订单数（全域）', '净子订单数(全域)');
AD_FIELDS.netPromoUnitCount.push('净件数（推广）', '净件数(推广)', '净件数（全域）', '净件数(全域)');

const AD_GLOBAL_PROMO_DUPLICATE_FIELDS = [
  ['globalSalesAmount', 'promoSalesAmount', ['申报价销售额', '销售额']],
  ['globalRoas', 'promoRoas', ['投资回报率ROAS', '投资回报率(ROAS)', 'ROAS']],
  ['globalAcos', 'promoAcos', ['费比']],
  ['globalCpa', 'promoCpa', ['每笔成交花费']],
  ['globalSubOrderCount', 'promoSubOrderCount', ['子订单数']],
  ['globalUnitCount', 'promoUnitCount', ['件数']],
  ['globalImpressions', 'promoImpressions', ['曝光']],
  ['globalClicks', 'promoClicks', ['点击']],
  ['globalCtr', 'promoCtr', ['点击率']],
  ['globalCvr', 'promoCvr', ['转化率']],
  ['globalAddToCartCount', 'promoAddToCartCount', ['加入购物车数', '加购']],
];

for (const [globalField, promoField, aliases] of AD_GLOBAL_PROMO_DUPLICATE_FIELDS) {
  AD_FIELDS[globalField].push(...aliases);
  AD_FIELDS[promoField].push(...aliases.map((alias) => `${alias}_1`));
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeTemuOperatorName(value) {
  const operatorName = text(value);
  if (operatorName === '\u66fe\u4f73\u5b8f') return '\u66fe\u4f73\u5f18';
  return operatorName;
}

function getTemuOperatorNameAliases(value) {
  const original = text(value);
  const normalized = normalizeTemuOperatorName(original);
  const aliases = new Set([original, normalized].filter(Boolean));
  if (normalized === '\u66fe\u4f73\u5f18') aliases.add('\u66fe\u4f73\u5b8f');
  return Array.from(aliases);
}

function pushOperatorNameAliases(values, where, startIndex, column, operatorName) {
  const aliases = getTemuOperatorNameAliases(operatorName);
  if (!aliases.length) return;
  values.push(aliases);
  where.push(`${column} = ANY($${startIndex + values.length - 1}::text[])`);
}

function pushOperatorNameAliasesToBuilder(whereBuilder, column, operatorName) {
  const aliases = getTemuOperatorNameAliases(operatorName);
  if (!aliases.length) return;
  whereBuilder.values.push(aliases);
  whereBuilder.where.push(`${column} = ANY($${whereBuilder.startIndex + whereBuilder.values.length - 1}::text[])`);
}

function nullableText(value) {
  const next = text(value);
  return next || null;
}

function normalizeHeader(value) {
  return text(value)
    .replace(/\s+/g, '')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .toLowerCase();
}

function inferStoreNameFromFileName(fileName = '') {
  const raw = text(fileName);
  const matched = raw.match(/([A-Za-z0-9]+店|[\u4e00-\u9fa5]+店)/);
  return matched ? matched[1] : '';
}

function normalizeStoreNameForValidation(value) {
  return text(value).replace(/\s+/g, '').toUpperCase();
}

function storePrefixFromName(storeName = '') {
  const normalized = normalizeStoreNameForValidation(storeName);
  const matched = normalized.match(/^([A-Z0-9]+)店$/i);
  return matched ? matched[1] : '';
}

function allowedProductCodePrefixesForStore(storeName = '') {
  const expectedPrefix = storePrefixFromName(storeName);
  if (!expectedPrefix) return [];
  if (expectedPrefix === 'K') return ['K', 'UK', 'TM'];
  return [expectedPrefix];
}

function normalizeSkuCode(value) {
  return text(value).replace(/\s+/g, '').toUpperCase();
}

function numberValue(value, fallback = 0) {
  const rawText = text(value);
  const normalizedText = rawText.toLowerCase();
  if (!rawText || rawText === '--' || rawText === '-' || rawText === '∞' || normalizedText === 'null' || normalizedText === 'undefined' || normalizedText === 'nan') return fallback;
  const raw = rawText.replace(/[,%￥¥\s]/g, '').replace(/，/g, '');
  if (!raw || raw === '--' || raw === '∞') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function nullableNumber(value) {
  const raw = text(value);
  const normalizedText = raw.toLowerCase();
  if (!raw || raw === '--' || raw === '-' || raw === '∞' || normalizedText === 'null' || normalizedText === 'undefined' || normalizedText === 'nan') return null;
  return numberValue(raw, null);
}

function dateText(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
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

function countMappedFields(mapping, fields) {
  return fields.filter((field) => Boolean(mapping[field])).length;
}

function headersFromRowsAndMapping(rows, mapping) {
  const headerSet = new Set(Object.values(mapping || {}).filter(Boolean));
  for (const row of rows.slice(0, 5)) {
    Object.keys(row || {}).forEach((header) => headerSet.add(header));
  }
  return Array.from(headerSet);
}

function detectAdTableType(headers = [], mapping = {}) {
  const normalizedHeaders = new Set(headers.map((header) => normalizeHeader(header)));
  if (mapping.globalSalesAmount || normalizedHeaders.has(normalizeHeader('申报价销售额（全域）')) || normalizedHeaders.has(normalizeHeader('申报价销售额(全域)'))) {
    return '全域推广';
  }
  if (mapping.promoSalesAmount || normalizedHeaders.has(normalizeHeader('申报价销售额（推广）')) || normalizedHeaders.has(normalizeHeader('申报价销售额(推广)'))) {
    return '兼容推广';
  }
  return '广告推广';
}

function validateProductStoreImportScope({ rows = [], mapping = {}, fileName = '', storeName = '' }) {
  const selectedStoreName = text(storeName);
  if (!selectedStoreName) {
    throw new Error('导入店铺必选：请先选择本次商品信息所属店铺。');
  }

  const fileStoreName = inferStoreNameFromFileName(fileName);
  if (!fileStoreName) {
    throw new Error(`商品信息导入失败：文件名必须包含店铺名，例如“A店商品基础信息.xlsx”。当前文件名：${fileName || '-'}`);
  }
  if (normalizeStoreNameForValidation(fileStoreName) !== normalizeStoreNameForValidation(selectedStoreName)) {
    throw new Error(`商品信息导入失败：文件名店铺“${fileStoreName}”与导入店铺“${selectedStoreName}”不一致，请选择正确店铺后重新导入。`);
  }

  const skcCodeHeader = mapping.skcCode;
  if (!skcCodeHeader) {
    throw new Error('商品信息导入失败：必须映射“SKC货号”，用于校验文件所属店铺。');
  }

  const allowedPrefixes = allowedProductCodePrefixesForStore(selectedStoreName);
  if (!allowedPrefixes.length) {
    throw new Error(`商品信息导入失败：无法从店铺名“${selectedStoreName}”识别 SKC 货号前缀。店铺名需类似“A店”。`);
  }

  const skcCodes = rows
    .map((row) => normalizeSkuCode(row?.[skcCodeHeader]))
    .filter(Boolean);
  if (!skcCodes.length) {
    throw new Error('商品信息导入失败：Excel 中“SKC货号”为空，无法校验文件所属店铺。');
  }

  const matchedCount = skcCodes.filter((code) => allowedPrefixes.some((prefix) => code.startsWith(prefix))).length;
  const matchedRate = matchedCount / skcCodes.length;
  if (matchedRate <= 0.5) {
    const invalidSamples = skcCodes.filter((code) => !allowedPrefixes.some((prefix) => code.startsWith(prefix))).slice(0, 10);
    const expectedPrefixText = allowedPrefixes.join(' / ');
    throw new Error(
      `商品信息导入失败：导入店铺为“${selectedStoreName}”，要求超过 50% 的 SKC货号以“${expectedPrefixText}”开头。` +
      `当前匹配 ${matchedCount}/${skcCodes.length}，匹配率 ${(matchedRate * 100).toFixed(2)}%。` +
      `异常样例：${invalidSamples.join('、') || '-'}`,
    );
  }
}

function formatMissingFields(mapping, fields) {
  return fields.filter(([field]) => !mapping[field]).map(([, label]) => label);
}

export function assertImportFileShape({ headers = [], mapping: explicitMapping = null, type }) {
  const productMapping = explicitMapping && type === 'product' ? explicitMapping : inferMapping(headers, PRODUCT_FIELDS);
  const adMapping = explicitMapping && type === 'ad' ? explicitMapping : inferMapping(headers, AD_FIELDS);
  const productScore = countMappedFields(productMapping, ['productTitle', 'spuId', 'skcId', 'skuId', 'skcCode', 'skuCode', 'spec1Name', 'spec2Name', 'declaredPriceStatus', 'createdTime']);
  const adScore = countMappedFields(adMapping, ['adSpend', 'netAdSpend', 'promoSalesAmount', 'promoRoas', 'targetRoas', 'promoSubOrderCount', 'promoImpressions', 'promoClicks', 'globalSalesAmount', 'globalImpressions', 'globalClicks']);

  if (type === 'product') {
    if (adScore >= 3) {
      throw new Error('导入信息错误：当前文件像广告数据报表，请使用“广告数据导入”。');
    }
    const missing = formatMissingFields(productMapping, [
      ['productTitle', '商品标题'],
      ['spuId', 'SPU ID'],
      ['skcId', 'SKC ID'],
      ['skuId', 'SKU ID'],
      ['skcCode', 'SKC货号'],
      ['skuCode', 'SKU货号'],
      ['createdTime', '创建时间'],
    ]);
    if (missing.length) {
      throw new Error(`导入信息错误：当前文件不是商品信息表，缺少字段：${missing.join('、')}。`);
    }
    return productMapping;
  }

  if (type === 'ad') {
    if (productScore >= 5 && adScore < 3) {
      throw new Error('导入信息错误：当前文件像商品信息表，请使用“商品信息导入”。');
    }
    const missing = formatMissingFields(adMapping, [
      ['temuSpuId', 'SPU ID'],
      ['temuProductId', '商品ID'],
      ['adSpend', '总花费'],
    ]);
    if (!adMapping.promoSalesAmount && !adMapping.globalSalesAmount) {
      missing.push('销售额字段');
    }
    if (!adMapping.promoImpressions && !adMapping.globalImpressions && !adMapping.promoClicks && !adMapping.globalClicks) {
      missing.push('曝光或点击字段');
    }
    if (missing.length) {
      throw new Error(`导入信息错误：当前文件不是广告数据报表，缺少字段：${missing.join('、')}。`);
    }
    return adMapping;
  }

  return explicitMapping || {};
}

function mapRow(row, mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, header ? row[header] : '']));
}

function isAdSummaryRow(row, mapping) {
  const data = mapRow(row, mapping);
  const firstText = Object.values(row || {}).map(text).find(Boolean) || '';
  const productName = text(data.productName) || firstText;
  return !text(data.temuProductId) && /^共\s*\d+\s*项/.test(productName);
}

export function parseExcelDataUrl(dataUrl) {
  const base64 = String(dataUrl || '').split(',').pop() || '';
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { sheetName, headers, rows };
}

export function buildImportPreview({ rows = [], headers = [], type }) {
  const mapping = inferMapping(headers, type === 'ad' ? AD_FIELDS : PRODUCT_FIELDS);
  const skippedRows = type === 'ad' ? rows.filter((row) => isAdSummaryRow(row, mapping)).length : 0;
  return {
    headers,
    mapping,
    previewRows: rows.slice(0, 20),
    totalRows: rows.length,
    effectiveRows: rows.length - skippedRows,
    skippedRows,
    tableType: type === 'ad' ? detectAdTableType(headers, mapping) : undefined,
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

async function upsertProduct(client, row, batchId, rowNumber, fallbackStoreName = '') {
  const data = mapRow(row, row.__mapping);
  if (!text(data.storeName) && text(fallbackStoreName)) data.storeName = fallbackStoreName;
  const productTitle = text(data.productTitle || data.productName);
  const spuId = nullableText(data.spuId || data.temuSpuId);
  const skcId = nullableText(data.skcId);
  const skcCode = nullableText(data.skcCode);
  const leafCategoryName = nullableText(data.leafCategoryName || data.categoryName);
  const declaredPriceCny = nullableNumber(data.declaredPriceCny || data.currentPrice);
  const declaredPriceStatus = nullableText(data.declaredPriceStatus);
  const createdTime = dateText(data.createdTime || data.firstOnlineAt);
  const firstOnlineAt = dateText(data.createdTime || data.firstOnlineAt);
  if (!text(data.storeName)) throw new Error('缺少店铺');
  if (!spuId) throw new Error('缺少 SPU ID');
  if (!skcId) throw new Error('缺少 SKC ID');
  if (!firstOnlineAt) throw new Error('缺少或无法识别首次上架时间');
  const owner = await resolveStoreAndOperator(client, data.storeName, firstOnlineAt);
  if (!owner.storeId) throw new Error(`未匹配到 TEMU 店铺：${text(data.storeName)}`);
  const before = await client.query(
    `SELECT id, current_price, current_inventory FROM temu_products WHERE store_id = $1 AND temu_spu_id = $2 LIMIT 2`,
    [owner.storeId, spuId],
  );
  if (before.rows.length > 1) throw new Error(`同店铺 SPU ID 匹配到多个商品主记录：${spuId}`);
  const productValues = [
    `${owner.storeId}-${spuId}`,
    `${batchId}-${rowNumber}`,
    owner.storeId,
    owner.storeName,
    owner.operatorId,
    owner.operatorName,
    null,
    spuId,
    productTitle,
    nullableText(data.productImageUrl),
    leafCategoryName,
    firstOnlineAt,
    nullableText(data.productStatus),
    declaredPriceCny,
    nullableNumber(data.currentInventory) === null ? null : Math.trunc(numberValue(data.currentInventory)),
    productTitle,
    spuId,
    skcId,
    skcCode,
    leafCategoryName,
    declaredPriceCny,
    declaredPriceStatus,
    createdTime,
    json(row),
  ];
  let productId = before.rows[0]?.id;
  if (productId) {
    await client.query(
      `UPDATE temu_products
       SET legacy_id=$1, source_id=$2, store_id=$3, store_name=$4, operator_id=$5, operator_name=$6,
           temu_product_id=$7, temu_spu_id=$8, product_name=$9, product_image_url=$10,
           category_name=$11, first_online_at=$12::timestamptz, product_status=$13,
           current_price=$14, current_inventory=COALESCE($15, current_inventory),
           product_title=$16, spu_id=$17, skc_id=$18, skc_code=$19,
           leaf_category_name=$20, declared_price_cny=$21, declared_price_status=$22,
           created_time=$23::timestamptz, raw_data=$24::jsonb, updated_at=NOW()
       WHERE id=$25`,
      [...productValues, productId],
    );
  } else {
    const result = await client.query(
      `INSERT INTO temu_products (
         legacy_id, source_id, store_id, store_name, operator_id, operator_name,
         temu_product_id, temu_spu_id, product_name, product_image_url, category_name,
         first_online_at, product_status, current_price, current_inventory,
         product_title, spu_id, skc_id, skc_code, leaf_category_name, declared_price_cny,
         declared_price_status, created_time, raw_data, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14,$15,
               $16,$17,$18,$19,$20,$21,$22,$23::timestamptz,$24::jsonb,NOW())
       RETURNING id`,
      productValues,
    );
    productId = result.rows[0].id;
    await addTimeline(client, {
      productId,
      storeId: owner.storeId,
      operatorId: owner.operatorId,
      eventType: 'PRODUCT_ONLINE',
      eventDate: firstOnlineAt,
      eventTime: firstOnlineAt,
      title: '商品首次上架',
      description: productTitle,
      sourceType: 'product_import',
      sourceId: String(batchId),
      rawData: row,
    });
  }
  await client.query('UPDATE temu_products SET temu_skc_id=$1 WHERE id=$2', [skcId, productId]);
  if (before.rows[0]) {
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
  const skuName = text([data.spec1Name, data.spec2Name].map(text).filter(Boolean).join(' / ') || data.skuName);
  if (skuId || skuCode) {
    const existingSku = await client.query(
      `SELECT id FROM temu_product_skus
       WHERE store_id = $1 AND COALESCE(sku_id, '') = COALESCE($2::text, '') AND COALESCE(sku_code, '') = COALESCE($3::text, '')
       LIMIT 1`,
      [owner.storeId, skuId, skuCode || null],
    );
    if (existingSku.rows[0]) {
      await client.query(
        `UPDATE temu_product_skus
         SET product_id=$1, store_name=$2, temu_product_id=$3, temu_spu_id=$4, sku_name=$5,
             sku_price=$6, sku_inventory=COALESCE($7, sku_inventory),
             product_title=$8, spu_id=$9, skc_id=$10, skc_code=$11, leaf_category_name=$12,
             product_status=$13, spec1_name=$14, spec2_name=$15, declared_price_cny=$16,
             declared_price_status=$17, created_time=$18::timestamptz, raw_data=$19::jsonb, updated_at=NOW()
         WHERE id=$20`,
        [
          productId, owner.storeName, null, spuId, nullableText(skuName), declaredPriceCny,
          nullableNumber(data.currentInventory) === null ? null : Math.trunc(numberValue(data.currentInventory)),
          productTitle, spuId, skcId, skcCode, leafCategoryName, nullableText(data.productStatus),
          nullableText(data.spec1Name), nullableText(data.spec2Name), declaredPriceCny, declaredPriceStatus,
          createdTime, json(row), existingSku.rows[0].id,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO temu_product_skus (
           product_id, store_id, store_name, temu_product_id, temu_spu_id,
           sku_id, sku_code, sku_name, sku_price, sku_inventory,
           product_title, spu_id, skc_id, skc_code, leaf_category_name, product_status,
           spec1_name, spec2_name, declared_price_cny, declared_price_status, created_time, raw_data
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::timestamptz,$22::jsonb)`,
        [
          productId, owner.storeId, owner.storeName, null, spuId, skuId, skuCode || null,
          nullableText(skuName), declaredPriceCny,
          nullableNumber(data.currentInventory) === null ? null : Math.trunc(numberValue(data.currentInventory)),
          productTitle, spuId, skcId, skcCode, leafCategoryName, nullableText(data.productStatus),
          nullableText(data.spec1Name), nullableText(data.spec2Name), declaredPriceCny,
          declaredPriceStatus, createdTime, json(row),
        ],
      );
    }
    await client.query(
      `UPDATE temu_product_skus
       SET temu_skc_id=$1
       WHERE product_id=$2
         AND store_id=$3
         AND (($4::text IS NOT NULL AND sku_id = $4) OR ($5::text IS NOT NULL AND sku_code = $5))`,
      [skcId, productId, owner.storeId, skuId, skuCode || null],
    );
  }
  return productId;
}

async function findProductForAd(client, owner, data) {
  const result = await client.query(
    `SELECT id FROM temu_products
     WHERE store_id = $1 AND temu_spu_id = $2
     LIMIT 2`,
    [owner.storeId, text(data.temuSpuId)],
  );
  if (result.rows.length > 1) {
    throw new Error(`同店铺 SPU ID 匹配到多个商品主记录：${text(data.temuSpuId)}`);
  }
  if (!result.rows[0]) {
    return null;
  }
  return result.rows[0].id;
}

async function resolveAdOwner(client, storeName, data, reportDate) {
  if (text(storeName)) {
    return resolveStoreAndOperator(client, storeName, reportDate);
  }
  return {
    storeId: null,
    storeName: '',
    operatorId: null,
    operatorName: '',
  };
}

async function upsertAdRow(client, row, batchId, rowNumber, reportDate, fallbackStoreName) {
  const data = mapRow(row, row.__mapping);
  const storeName = text(data.storeName || fallbackStoreName);
  if (!text(data.temuProductId)) throw new Error('缺少商品ID');
  if (!text(data.temuSpuId)) throw new Error('缺少 SPU ID');
  const owner = await resolveAdOwner(client, storeName, data, reportDate);
  if (!owner.storeId) throw new Error(storeName ? `未匹配到 TEMU 店铺：${storeName}` : '缺少店铺：广告数据必须提供店铺字段或在导入页选择默认店铺');
  const productId = await findProductForAd(client, owner, data);
  const adValues = [
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
  ];
  const existing = await client.query(
    `SELECT id FROM temu_ad_product_daily
     WHERE store_id = $1 AND report_date = $2::date AND temu_spu_id = $3
     LIMIT 2`,
    [owner.storeId, dateText(reportDate), text(data.temuSpuId)],
  );
  if (existing.rows.length > 1) throw new Error(`同店铺同日期 SPU ID 匹配到多条广告记录：${text(data.temuSpuId)}`);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE temu_ad_product_daily
       SET import_batch_id=$2, store_name=$4, operator_id=$5, operator_name=$6,
           product_id=$7, temu_product_id=$8, temu_spu_id=$9, product_name=$10,
           ad_spend=$11, net_ad_spend=$12, global_sales_amount=$13, global_roas=$14,
           global_acos=$15, global_cpa=$16, global_sub_order_count=$17, global_unit_count=$18,
           global_impressions=$19, global_clicks=$20, global_ctr=$21, global_cvr=$22,
           global_add_to_cart_count=$23, promo_sales_amount=$24, promo_roas=$25,
           promo_week_roas=$26, target_roas=$27, promo_acos=$28, promo_cpa=$29,
           promo_sub_order_count=$30, promo_unit_count=$31, promo_impressions=$32,
           promo_clicks=$33, promo_ctr=$34, promo_cvr=$35, promo_add_to_cart_count=$36,
           net_promo_sales_amount=$37, net_promo_roas=$38, net_promo_acos=$39,
           net_promo_cpa=$40, net_promo_sub_order_count=$41, net_promo_unit_count=$42,
           raw_data=$43::jsonb, updated_at=NOW()
       WHERE id=$44`,
      [...adValues, existing.rows[0].id],
    );
  } else {
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
       )`,
      adValues,
    );
  }
  if (productId) {
    const spend = numberValue(data.adSpend);
    const clicks = numberValue(data.globalClicks || data.promoClicks);
    const orders = numberValue(data.globalSubOrderCount || data.promoSubOrderCount);
    if (spend > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_SPEND', eventDate: reportDate, title: '广告产生花费', description: String(spend), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
    if (clicks > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_CLICK', eventDate: reportDate, title: '广告产生点击', description: String(clicks), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
    if (orders > 0) await addTimeline(client, { productId, storeId: owner.storeId, operatorId: owner.operatorId, eventType: 'AD_FIRST_ORDER', eventDate: reportDate, title: '广告产生订单', description: String(orders), sourceType: 'ad_import', sourceId: String(batchId), rawData: row });
  }
  return { productId };
}

export async function importProductRows({ rows = [], mapping = {}, fileName = '', storeName = '', currentUser = {} }) {
  await runTemuMigrations();
  assertImportFileShape({ headers: headersFromRowsAndMapping(rows, mapping), mapping, type: 'product' });
  validateProductStoreImportScope({ rows, mapping, fileName, storeName });
  const client = await getAlibaba1688Pool().connect();
  const sourceBatchId = `product-info-${Date.now().toString(36)}`;
  const fallbackStoreName = text(storeName) || inferStoreNameFromFileName(fileName);
  let batchId = null;
  const errors = [];
  const productIds = new Set();
  try {
    await client.query('BEGIN');
    const batchOwner = fallbackStoreName ? await resolveStoreAndOperator(client, fallbackStoreName, null) : {};
    batchId = await createImportBatch(client, {
      sourceBatchId,
      importType: 'product_info',
      fileName,
      storeId: batchOwner.storeId || null,
      storeName: batchOwner.storeName || fallbackStoreName,
      totalRows: rows.length,
      status: 'processing',
      uploadedBy: currentUser.userId || currentUser.username,
      uploadedByName: currentUser.displayName || currentUser.username,
      rawData: { fileName, storeName: fallbackStoreName },
    });
    let rowNumber = 0;
    for (const row of rows) {
      rowNumber += 1;
      await client.query('SAVEPOINT import_product_row');
      try {
        const productId = await upsertProduct(client, { ...row, __mapping: mapping }, batchId, rowNumber, fallbackStoreName);
        productIds.add(productId);
        await client.query('RELEASE SAVEPOINT import_product_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_product_row');
        const reason = error instanceof Error ? error.message : String(error);
        errors.push({ rowNumber, errorReason: reason, rawData: row });
        await insertImportError(client, batchId, rowNumber, reason, row);
        await client.query('RELEASE SAVEPOINT import_product_row');
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
  const headers = headersFromRowsAndMapping(rows, mapping);
  assertImportFileShape({ headers, mapping, type: 'ad' });
  const client = await getAlibaba1688Pool().connect();
  const sourceBatchId = `ad-report-${dateText(reportDate)}-${Date.now().toString(36)}`;
  const fallbackStoreName = text(storeName) || inferStoreNameFromFileName(fileName);
  const tableType = detectAdTableType(headers, mapping);
  const errors = [];
  let skippedRows = 0;
  let successRows = 0;
  let matchedSpuCount = 0;
  let unmatchedSpuCount = 0;
  if (!dateText(reportDate)) throw new Error('报表日期必填');
  try {
    await client.query('BEGIN');
    const owner = fallbackStoreName ? await resolveStoreAndOperator(client, fallbackStoreName, reportDate) : {};
    if (!owner.storeId) {
      throw new Error(fallbackStoreName ? `未匹配到 TEMU 店铺：${fallbackStoreName}` : '缺少店铺：广告数据必须在导入页选择店铺');
    }
    await client.query(
      `DELETE FROM temu_ad_product_daily
       WHERE store_id = $1 AND report_date = $2::date`,
      [owner.storeId, dateText(reportDate)],
    );
    const batchId = await createImportBatch(client, {
      sourceBatchId,
      importType: 'ad_product_daily',
      fileName,
      reportDate,
      storeId: owner.storeId,
      storeName: owner.storeName || fallbackStoreName,
      totalRows: rows.length,
      status: 'processing',
      uploadedBy: currentUser.userId || currentUser.username,
      uploadedByName: currentUser.displayName || currentUser.username,
      rawData: { fileName, reportDate, storeName: fallbackStoreName, tableType },
    });
    let rowNumber = 0;
    for (const row of rows) {
      rowNumber += 1;
      if (isAdSummaryRow(row, mapping)) {
        skippedRows += 1;
        continue;
      }
      await client.query('SAVEPOINT import_ad_row');
      try {
        const rowResult = await upsertAdRow(client, { ...row, __mapping: mapping }, batchId, rowNumber, reportDate, fallbackStoreName);
        successRows += 1;
        if (rowResult?.productId) matchedSpuCount += 1;
        else unmatchedSpuCount += 1;
        await client.query('RELEASE SAVEPOINT import_ad_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_ad_row');
        const reason = error instanceof Error ? error.message : String(error);
        errors.push({ rowNumber, errorReason: reason, rawData: row });
        await insertImportError(client, batchId, rowNumber, reason, row);
        await client.query('RELEASE SAVEPOINT import_ad_row');
      }
    }
    await client.query(
      `UPDATE temu_import_batches SET success_rows=$1,error_rows=$2,status=$3,finished_at=NOW(),updated_at=NOW() WHERE id=$4`,
      [successRows, errors.length, errors.length ? 'partial_success' : 'success', batchId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await rebuildNewProductSnapshots({ snapshotDate: dateText(reportDate) });
  const spuMatchRate = successRows > 0 ? matchedSpuCount / successRows : null;
  return {
    ok: true,
    tableType,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errorRows: errors.length,
    spuMatchRate,
    unmatchedSpuCount,
    errors,
  };
}

export async function deleteProductImportBatch(batchId) {
  await runTemuMigrations();
  const client = await getAlibaba1688Pool().connect();
  try {
    await client.query('BEGIN');
    const batchResult = await client.query(
      `SELECT id, import_type, file_name, store_name
       FROM temu_import_batches
       WHERE id = $1::uuid AND import_type = 'product_info'
       FOR UPDATE`,
      [batchId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      await client.query('ROLLBACK');
      return { ok: false, deleted: false, message: '未找到商品信息导入批次。' };
    }
    const productIdsResult = await client.query(
      `SELECT id
       FROM temu_products
       WHERE source_id LIKE $1`,
      [`${batch.id}-%`],
    );
    const productIds = productIdsResult.rows.map((row) => row.id);
    let deletedProducts = 0;
    let deletedSkus = 0;
    if (productIds.length) {
      const skuResult = await client.query(
        `DELETE FROM temu_product_skus
         WHERE product_id = ANY($1::uuid[])
         RETURNING id`,
        [productIds],
      );
      deletedSkus = skuResult.rowCount || 0;
      const productResult = await client.query(
        `DELETE FROM temu_products
         WHERE id = ANY($1::uuid[])
         RETURNING id`,
        [productIds],
      );
      deletedProducts = productResult.rowCount || 0;
    }
    await client.query(
      `DELETE FROM temu_product_timeline
       WHERE source_type = 'product_import' AND source_id = $1`,
      [String(batch.id)],
    );
    await client.query('DELETE FROM temu_import_batches WHERE id = $1::uuid', [batch.id]);
    await client.query('COMMIT');
    return {
      ok: true,
      deleted: true,
      batchId: String(batch.id),
      fileName: batch.file_name || '',
      storeName: batch.store_name || '',
      deletedProducts,
      deletedSkus,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAdImportBatch(batchId) {
  await runTemuMigrations();
  const client = await getAlibaba1688Pool().connect();
  let snapshotDate = null;
  let productIds = [];
  try {
    await client.query('BEGIN');
    const batchResult = await client.query(
      `SELECT id, import_type, file_name, store_name, report_date
       FROM temu_import_batches
       WHERE id = $1::uuid AND import_type = 'ad_product_daily'
       FOR UPDATE`,
      [batchId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      await client.query('ROLLBACK');
      return { ok: false, deleted: false, message: '未找到广告数据导入批次。' };
    }
    snapshotDate = dateText(batch.report_date);
    const productResult = await client.query(
      `SELECT DISTINCT product_id
       FROM temu_ad_product_daily
       WHERE import_batch_id = $1::uuid AND product_id IS NOT NULL`,
      [batch.id],
    );
    productIds = productResult.rows.map((row) => row.product_id).filter(Boolean);
    const adResult = await client.query(
      `DELETE FROM temu_ad_product_daily
       WHERE import_batch_id = $1::uuid
       RETURNING id`,
      [batch.id],
    );
    await client.query(
      `DELETE FROM temu_product_timeline
       WHERE source_type = 'ad_import' AND source_id = $1`,
      [String(batch.id)],
    );
    await client.query('DELETE FROM temu_import_batches WHERE id = $1::uuid', [batch.id]);
    await client.query('COMMIT');
    if (snapshotDate) {
      await rebuildNewProductSnapshots({ snapshotDate, productIds });
    }
    return {
      ok: true,
      deleted: true,
      batchId: String(batch.id),
      fileName: batch.file_name || '',
      storeName: batch.store_name || '',
      reportDate: snapshotDate,
      deletedAds: adResult.rowCount || 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

const AD_STAGE_STRATEGY_CONFIG = {
  stages: [
    { key: 'COLD_START', name: '冷启动期', dayStart: 1, dayEnd: 7, bidLevel: '竞争力强', targetRoas: 2.95, goal: '获取曝光、点击、加购、首单' },
    { key: 'TESTING', name: '测试期', dayStart: 8, dayEnd: 14, bidLevel: '竞争力中', targetRoas: 5.11, goal: '验证转化能力' },
    { key: 'CONTROL', name: '控本期', dayStart: 15, dayEnd: 21, bidLevel: '竞争力弱', targetRoas: 7.65, goal: '控制成本，筛选有效商品' },
    { key: 'PROFIT', name: '利润期', dayStart: 22, dayEnd: 30, bidLevel: '自定义12', targetRoas: 12, goal: '利润筛选，保留优质商品' },
  ],
  thresholds: {
    burnNoOrderSpend: 5,
    clickThreshold: 30,
    addToCartThreshold: 3,
    lowExposureThreshold: 50,
    conservativeRatio: 1.2,
    aggressiveRatio: 0.8,
  },
};

function adStagePlanForDays(daysOnline) {
  const days = Number(daysOnline || 0);
  return AD_STAGE_STRATEGY_CONFIG.stages.find((stage) => days >= stage.dayStart && days <= stage.dayEnd)
    || { key: 'NORMAL', name: '常规商品', dayStart: 31, dayEnd: 9999, bidLevel: '常规投放', targetRoas: null, goal: '转入常规商品管理' };
}

function adStageExecutionStatus(row) {
  const plan = adStagePlanForDays(row.days_online);
  const actualTargetRoas = row.target_roas === null || row.target_roas === undefined ? null : Number(row.target_roas);
  const plannedTargetRoas = plan.targetRoas === null ? null : Number(plan.targetRoas);
  const adSpend = Number(row.ad_spend || 0);
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const adOrderCount = Number(row.ad_order_count || 0);
  const roas = row.roas === null || row.roas === undefined ? null : Number(row.roas);
  const target = row.target_roas === null || row.target_roas === undefined ? null : Number(row.target_roas);
  const daysOnline = Number(row.days_online || 0);

  if (adSpend <= 0 && impressions <= 0 && clicks <= 0) return '无广告数据';
  if (plannedTargetRoas === null || actualTargetRoas === null) return '无目标ROAS';
  if (actualTargetRoas > plannedTargetRoas * AD_STAGE_STRATEGY_CONFIG.thresholds.conservativeRatio) return '投放过保守';
  if (actualTargetRoas < plannedTargetRoas * AD_STAGE_STRATEGY_CONFIG.thresholds.aggressiveRatio) return '投放过激进';
  if (daysOnline <= 7 && clicks >= AD_STAGE_STRATEGY_CONFIG.thresholds.clickThreshold && adOrderCount === 0) return '建议延长强投';
  if (daysOnline >= 15 && target !== null && roas !== null && roas < target) return '建议提前控本';
  if (daysOnline > 30 && adOrderCount > 0) return '建议转常规商品';
  if (adSpend >= AD_STAGE_STRATEGY_CONFIG.thresholds.burnNoOrderSpend && adOrderCount === 0 && clicks >= AD_STAGE_STRATEGY_CONFIG.thresholds.clickThreshold) return '建议暂停/优化';
  return '已按策略';
}

function strategyRecommendationForSnapshot(row) {
  const plan = adStagePlanForDays(row.days_online);
  const status = adStageExecutionStatus(row);
  const actionByStatus = {
    投放过保守: [`应调至${plan.bidLevel}`, 'MEDIUM', `当前实际目标ROAS高于计划目标ROAS，建议调至${plan.bidLevel}`, '在 TEMU 后台降低目标ROAS或切换到计划档位'],
    投放过激进: [`应调至${plan.bidLevel}`, 'HIGH', `当前实际目标ROAS低于计划目标ROAS，建议调至${plan.bidLevel}`, '在 TEMU 后台提高目标ROAS或收紧预算'],
    建议延长强投: ['建议延长测试', 'MEDIUM', '冷启动阶段已有点击但尚未稳定出单，建议延长测试窗口', '继续观察曝光、点击、加购和首单'],
    建议提前控本: ['建议提前控本', 'HIGH', '当前阶段 ROAS 低于目标，建议提前控本', '提高目标ROAS、降低预算或优化商品承接'],
    建议转常规商品: ['建议转入常规商品', 'MEDIUM', '商品已超过新品周期且有订单表现，建议进入常规商品管理', '转入常规投放和库存管理'],
    建议暂停: ['建议暂停/优化', 'HIGH', '广告有花费但没有形成订单，建议暂停或优化后再投放', '暂停广告或优化主图、价格和详情页'],
    '建议暂停/优化': ['建议暂停/优化', 'HIGH', '广告有花费但没有形成订单，建议暂停或优化后再投放', '暂停广告或优化主图、价格和详情页'],
  };
  const next = actionByStatus[status];
  if (!next) return null;
  return {
    id: `strategy-${row.snapshot_date}-${row.product_id}-${status}`,
    recommendationDate: row.snapshot_date,
    storeId: row.store_id,
    storeName: row.store_name,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    productId: row.product_id,
    temuProductId: row.temu_product_id,
    temuSpuId: row.temu_spu_id,
    productName: row.product_name,
    recommendationType: next[0],
    priority: next[1],
    problemType: status,
    recommendationText: next[2],
    reasonText: `当前阶段：${plan.name}；计划目标ROAS：${plan.targetRoas ?? '-'}；实际目标ROAS：${row.target_roas ?? '-'}`,
    suggestedAction: next[3],
    status: 'PENDING',
    daysOnline: Number(row.days_online || 0),
    currentStage: plan.name,
    plannedTargetRoas: plan.targetRoas,
    actualTargetRoas: row.target_roas === null ? null : Number(row.target_roas),
    adSpend: Number(row.ad_spend || 0),
    adOrderCount: Number(row.ad_order_count || 0),
    naturalOrderCount: Number(row.natural_order_count || 0),
    roas: row.roas === null ? null : Number(row.roas),
    targetRoas: row.target_roas === null ? null : Number(row.target_roas),
    generated: true,
  };
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
  snapshotReadCache.delete(targetDate);
  try {
    await client.query('BEGIN');
    const productFilter = productIds.length ? 'AND p.id = ANY($2::uuid[])' : '';
    const params = productIds.length ? [targetDate, productIds] : [targetDate];
    const products = await client.query(
      `SELECT p.*
       FROM temu_products p
       WHERE p.first_online_at IS NOT NULL
         AND p.first_online_at::date <= $1::date
         AND p.first_online_at::date >= ($1::date - INTERVAL '59 days')::date
         ${productFilter}
       ORDER BY p.first_online_at DESC`,
      params,
    );
    let count = 0;
    for (const product of products.rows) {
      const firstDate = dateText(product.first_online_at);
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
           AND o.order_date BETWEEN $4::date AND $1::date
           AND o.store_id = $3
           AND s.product_id = $2`,
        [targetDate, product.id, product.store_id, firstDate],
      );
      const adResult = await client.query(
        `SELECT COALESCE(SUM(ad_spend),0) AS ad_spend,
                COALESCE(SUM(global_sales_amount),0) AS ad_sales_amount,
                COALESCE(SUM(global_sub_order_count),0) AS ad_order_count,
                COALESCE(SUM(global_unit_count),0) AS ad_unit_count,
                COALESCE(SUM(global_impressions),0) AS impressions,
                COALESCE(SUM(global_clicks),0) AS clicks,
                COALESCE(SUM(global_add_to_cart_count),0) AS add_to_cart_count,
                NULL::numeric AS target_roas,
                MAX(global_roas) AS global_roas,
                MAX(global_acos) AS global_acos
         FROM temu_ad_product_daily
         WHERE report_date = $1::date
           AND store_id = $2
           AND temu_spu_id = $3`,
        [targetDate, product.store_id, product.temu_spu_id],
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
        roas: ads.global_roas === null || ads.global_roas === undefined ? safeDivide(adSales, adSpend) : Number(ads.global_roas),
        acos: ads.global_acos === null || ads.global_acos === undefined ? safeDivide(adSpend, adSales) : Number(ads.global_acos),
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
    key === 'operator_name' ? normalizeTemuOperatorName(value) : value,
  ]));
}

const snapshotReadCache = new Map();
const SNAPSHOT_READ_CACHE_TTL_MS = 30000;

async function ensureSnapshotForRead(snapshotDate) {
  // Read endpoints must never rebuild snapshots. Snapshot rebuilding is an
  // explicit import/rebuild action; opening the workbench should only read
  // existing snapshot rows so the first screen is not blocked by heavy writes.
  if (!dateText(snapshotDate)) return;
}

export async function getNewProductDataCutoffDate() {
  await runTemuMigrations();
  const result = await queryTemuDatabase(
    `SELECT
       (SELECT MAX(first_online_at)::date FROM temu_products WHERE first_online_at IS NOT NULL) AS latest_product_date,
       (SELECT MAX(order_date)::date FROM temu_order_items WHERE is_valid_order = TRUE AND is_cancelled = FALSE) AS latest_order_date,
       (SELECT MAX(report_date)::date FROM temu_ad_product_daily) AS latest_ad_date,
       (SELECT MAX(snapshot_date)::date FROM temu_new_product_daily_snapshot) AS latest_snapshot_date,
       (CURRENT_DATE - INTERVAL '1 day')::date AS yesterday`,
  );
  const row = result.rows[0] || {};
  const latestProductDate = dateText(row.latest_product_date);
  const latestOrderDate = dateText(row.latest_order_date);
  const latestAdDate = dateText(row.latest_ad_date);
  const latestSnapshotDate = dateText(row.latest_snapshot_date);
  const yesterday = dateText(row.yesterday);
  const candidateDates = [latestProductDate, latestOrderDate, latestAdDate, latestSnapshotDate]
    .filter(Boolean)
    .sort();
  return candidateDates.at(-1) || yesterday || new Date().toISOString().slice(0, 10);
}

async function resolveSnapshotDate(params = {}) {
  const selectedDate = dateText(params.snapshotDate);
  if (selectedDate) {
    return { snapshotDate: selectedDate, dataCutoffDate: selectedDate, dateMode: 'manual' };
  }
  const dataCutoffDate = await getNewProductDataCutoffDate();
  return { snapshotDate: dataCutoffDate, dataCutoffDate, dateMode: 'auto' };
}

export async function getTemuStorageStatus() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  if (!hasDatabaseUrl) {
    return {
      ok: false,
      databaseConfigured: false,
      databaseConnected: false,
      message: 'DATABASE_URL is not configured on this server.',
      counts: {},
    };
  }
  try {
    await runTemuMigrations();
    const result = await queryTemuDatabase(
      `SELECT
         current_database() AS database_name,
         (SELECT count(*) FROM temu_products)::int AS product_count,
         (SELECT count(*) FROM temu_product_skus)::int AS sku_count,
         (SELECT count(*) FROM temu_ad_product_daily)::int AS ad_count,
         (SELECT count(*) FROM temu_import_batches WHERE import_type IN ('product_info','ad_product_daily'))::int AS import_batch_count`,
    );
    const row = result.rows[0] || {};
    return {
      ok: true,
      databaseConfigured: true,
      databaseConnected: true,
      databaseName: row.database_name,
      counts: {
        products: Number(row.product_count || 0),
        skus: Number(row.sku_count || 0),
        ads: Number(row.ad_count || 0),
        importBatches: Number(row.import_batch_count || 0),
      },
    };
  } catch (error) {
    return {
      ok: false,
      databaseConfigured: true,
      databaseConnected: false,
      message: error instanceof Error ? error.message : String(error),
      counts: {},
    };
  }
}

function buildScopeWhere(params, startIndex = 1) {
  const values = [];
  const where = [];
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${startIndex + values.length - 1}`));
  };
  if (params.storeId) {
    values.push(params.storeId);
    const placeholder = `$${startIndex + values.length - 1}`;
    where.push(`s.store_id = (SELECT id FROM temu_stores WHERE id::text = ${placeholder} OR legacy_id = ${placeholder} OR store_name = ${placeholder} LIMIT 1)`);
  }
  if (params.storeName) push('s.store_name = ?', params.storeName);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`s.store_id = ANY($${startIndex + values.length - 1}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeNames);
      where.push(`s.store_name = ANY($${startIndex + values.length - 1}::text[])`);
    }
  }
  if (params.operatorId) {
    push('s.operator_id = ?', params.operatorId);
  } else if (params.operatorName) {
    pushOperatorNameAliases(values, where, startIndex, 's.operator_name', params.operatorName);
  }
  if (params.categoryName) push('s.category_name = ?', params.categoryName);
  if (params.productTag) push('s.product_tag = ?', params.productTag);
  if (params.isAdEnabled !== undefined) push('s.is_ad_enabled = ?', params.isAdEnabled === 'true' || params.isAdEnabled === true);
  if (params.isOrdered !== undefined) push('s.is_ordered = ?', params.isOrdered === 'true' || params.isOrdered === true);
  if (params.spuId) push('s.temu_spu_id ILIKE ?', `%${String(params.spuId).trim()}%`);
  if (params.skcId) {
    push(
      `EXISTS (
        SELECT 1
        FROM temu_product_skus ps
        WHERE ps.product_id = s.product_id
          AND COALESCE(ps.skc_id, ps.temu_skc_id, ps.raw_data ->> 'SKC ID', '') ILIKE ?
      )`,
      `%${String(params.skcId).trim()}%`,
    );
  }
  if (params.skuId) {
    push(
      `EXISTS (
        SELECT 1
        FROM temu_product_skus ps
        WHERE ps.product_id = s.product_id
          AND COALESCE(ps.sku_id, ps.raw_data ->> 'SKU ID', '') ILIKE ?
      )`,
      `%${String(params.skuId).trim()}%`,
    );
  }
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

function buildBaseDataScopeWhere(params, aliases, startIndex = 1) {
  const values = [];
  const where = [];
  const storeAlias = aliases.store;
  const operatorAlias = aliases.operator || aliases.store;
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${startIndex + values.length - 1}`));
  };
  if (params.storeId) {
    values.push(params.storeId);
    const placeholder = `$${startIndex + values.length - 1}`;
    where.push(`${storeAlias}.store_id = (SELECT id FROM temu_stores WHERE id::text = ${placeholder} OR legacy_id = ${placeholder} OR store_name = ${placeholder} LIMIT 1)`);
  }
  if (params.storeName) push(`${storeAlias}.store_name = ?`, params.storeName);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`${storeAlias}.store_id = ANY($${startIndex + values.length - 1}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeNames);
      where.push(`${storeAlias}.store_name = ANY($${startIndex + values.length - 1}::text[])`);
    }
  }
  if (operatorAlias && params.operatorId) {
    push(`${operatorAlias}.operator_id = ?`, params.operatorId);
  } else if (operatorAlias && params.operatorName) {
    pushOperatorNameAliases(values, where, startIndex, `${operatorAlias}.operator_name`, params.operatorName);
  }
  return { where, values };
}

async function getScopedBaseCounts(params = {}) {
  const productScope = buildBaseDataScopeWhere(params, { store: 'p', operator: 'p' }, 1);
  const skuScope = buildBaseDataScopeWhere(params, { store: 's', operator: 'p' }, 1);
  const adScope = buildBaseDataScopeWhere(params, { store: 'a', operator: 'a' }, 1);
  const productCondition = productScope.where.length ? `WHERE ${productScope.where.join(' AND ')}` : '';
  const skuCondition = skuScope.where.length ? `WHERE ${skuScope.where.join(' AND ')}` : '';
  const adCondition = adScope.where.length ? `WHERE ${adScope.where.join(' AND ')}` : '';
  const [products, skus, ads] = await Promise.all([
    queryTemuDatabase(`SELECT COUNT(*)::int AS total FROM temu_products p ${productCondition}`, productScope.values),
    queryTemuDatabase(`SELECT COUNT(*)::int AS total FROM temu_product_skus s LEFT JOIN temu_products p ON p.id = s.product_id ${skuCondition}`, skuScope.values),
    queryTemuDatabase(`SELECT COUNT(*)::int AS total FROM temu_ad_product_daily a ${adCondition}`, adScope.values),
  ]);
  return {
    products: Number(products.rows[0]?.total || 0),
    skus: Number(skus.rows[0]?.total || 0),
    ads: Number(ads.rows[0]?.total || 0),
  };
}

async function getScopedTemuStores(params = {}, snapshotDate = null) {
  const values = [snapshotDate || null];
  const where = [
    `UPPER(COALESCE(s.platform, 'TEMU')) = 'TEMU'`,
    `COALESCE(s.status, 'active') <> 'inactive'`,
    `COALESCE(NULLIF(s.store_name, ''), '') <> ''`,
  ];
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (params.storeId) {
    values.push(params.storeId);
    where.push(`(s.id::text = $${values.length} OR s.legacy_id = $${values.length} OR s.store_name = $${values.length})`);
  }
  if (params.storeName) push(`s.store_name = ?`, params.storeName);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`s.id = ANY($${values.length}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeNames);
      where.push(`s.store_name = ANY($${values.length}::text[])`);
    }
  }
  if (params.operatorId) {
    push(`rel.operator_id = ?`, params.operatorId);
  } else if (params.operatorName) {
    const aliases = getTemuOperatorNameAliases(params.operatorName);
    if (aliases.length) {
      values.push(aliases);
      where.push(`rel.operator_name = ANY($${values.length}::text[])`);
    }
  }

  const result = await queryTemuDatabase(
    `SELECT s.id AS store_id,
            s.store_name,
            rel.operator_id,
            COALESCE(rel.operator_name, '') AS operator_name
     FROM temu_stores s
     LEFT JOIN LATERAL (
       SELECT r.operator_id,
              COALESCE(o.operator_name, r.operator_name) AS operator_name
       FROM temu_store_operator_relations r
       LEFT JOIN temu_operators o ON o.id = r.operator_id
       WHERE r.status <> 'inactive'
         AND UPPER(COALESCE(r.platform, 'TEMU')) = 'TEMU'
         AND (r.store_id = s.id OR r.store_name = s.store_name)
         AND ($1::date IS NULL OR COALESCE(r.start_date, DATE '0001-01-01') <= $1::date)
         AND ($1::date IS NULL OR COALESCE(r.end_date, DATE '9999-12-31') >= $1::date)
       ORDER BY CASE WHEN r.role = 'primary' THEN 0 ELSE 1 END, r.updated_at DESC
       LIMIT 1
     ) rel ON TRUE
     WHERE ${where.join(' AND ')}
     ORDER BY s.store_name ASC`,
    values,
  );
  return result.rows.map(toCamel);
}

export async function getProducts(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)));
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.*,
            sku_meta.skc_ids,
            sku_meta.sku_ids,
            COUNT(*) OVER() AS total
     FROM temu_new_product_daily_snapshot s
     LEFT JOIN LATERAL (
       SELECT
         STRING_AGG(DISTINCT NULLIF(COALESCE(ps.skc_id, ps.temu_skc_id, ps.raw_data ->> 'SKC ID'), ''), ' / ') AS skc_ids,
         STRING_AGG(DISTINCT NULLIF(COALESCE(ps.sku_id, ps.raw_data ->> 'SKU ID'), ''), ' / ') AS sku_ids
       FROM temu_product_skus ps
       WHERE ps.product_id = s.product_id
     ) sku_meta ON TRUE
     WHERE ${condition}
     ORDER BY CASE s.product_tag
       WHEN '数据未匹配' THEN 0
       WHEN '烧钱无单' THEN 1
       WHEN '高费比新品' THEN 2
       WHEN '有流量无转化' THEN 3
       WHEN '加购未成交' THEN 4
       WHEN '低曝光新品' THEN 5
       WHEN '高潜新品' THEN 6
       ELSE 9
     END, s.first_online_at DESC, s.updated_at DESC
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [snapshotDate, ...values, pageSize, (page - 1) * pageSize],
  );
  return {
    records: result.rows.map((row) => toCamel(row)),
    total: Number(result.rows[0]?.total || 0),
    page,
    pageSize,
    snapshotDate,
    dataCutoffDate,
    dateMode,
  };
}

function decorateBossStoreRow(store) {
  const newCount = Number(store.period_new_count || 0);
  const orderedCount = Number(store.period_ordered_count || 0);
  const adSpend = Number(store.ad_spend || 0);
  const adOrders = Number(store.ad_order_count || 0);
  const roas = safeDivide(store.ad_sales_amount, store.ad_spend);
  const highPotential = Number(store.high_potential_count || 0);
  const loss = Number(store.loss_new_count || 0);
  const orderedRate = safeDivide(orderedCount, newCount) || 0;
  let statusLabel = '健康';
  let attentionLevel = 'low';
  let decisionReason = '新品与广告表现暂未发现明显风险';
  if (newCount > 0 && adSpend === 0) {
    statusLabel = '广告缺失';
    attentionLevel = 'medium';
    decisionReason = '有新品但广告花费为0，曝光可能不足';
  } else if ((newCount >= 10 && orderedRate < 0.1) || (adSpend > 0 && adOrders === 0) || (roas !== null && roas < 1) || loss >= 3) {
    statusLabel = '需关注';
    attentionLevel = loss >= 3 || (roas !== null && roas < 1) ? 'high' : 'medium';
    decisionReason = '新品出单率、广告效率或烧钱无单指标异常';
  } else if (orderedRate >= 0.25 && highPotential > 0 && (roas === null || roas >= 1)) {
    statusLabel = '优秀';
    attentionLevel = 'low';
    decisionReason = '出单率较高且存在高潜新品';
  }
  return {
    ...toCamel(store),
    periodOrderedRate: safeDivide(orderedCount, newCount),
    roas,
    statusLabel,
    attentionLevel,
    decisionReason,
  };
}

function decorateBossOperatorRow(operator) {
  const newCount = Number(operator.period_new_count || 0);
  const orderedCount = Number(operator.period_ordered_count || 0);
  const roas = safeDivide(operator.ad_sales_amount, operator.ad_spend);
  const problemCount = Number(operator.problem_count || 0);
  const highPotential = Number(operator.high_potential_count || 0);
  const orderedRate = safeDivide(orderedCount, newCount) || 0;
  let statusLabel = '健康';
  let decisionReason = '负责店铺新品表现稳定';
  if (newCount >= 10 && orderedRate < 0.1) {
    statusLabel = '需关注';
    decisionReason = '新品数量不少但出单率偏低';
  } else if (problemCount >= 3 || (roas !== null && roas < 1)) {
    statusLabel = '待提升';
    decisionReason = '广告效率或问题商品数量需要跟进';
  } else if (highPotential > 0 && orderedRate >= 0.2) {
    statusLabel = '优秀';
    decisionReason = '高潜新品和出单表现较好';
  }
  return {
    ...toCamel(operator),
    periodOrderedRate: safeDivide(orderedCount, newCount),
    roas,
    statusLabel,
    decisionReason,
  };
}

export async function getBossDashboard(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const periodDays = [7, 30, 60].includes(Number(params.periodDays)) ? Number(params.periodDays) : 30;
  const { where, values } = buildScopeWhere(params, 3);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const recommendationScopeCondition = where.length ? `AND ${where.join(' AND ').replace(/\bs\./g, 'sr.')}` : '';
  const baseCounts = await getScopedBaseCounts(params);
  const queryValues = [snapshotDate, periodDays, ...values];
  const [summary, operatorRanking, storeRanking] = await Promise.all([
    queryTemuDatabase(
      `SELECT
         COUNT(*) FILTER (WHERE days_online = 1) AS today_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7 AND is_ordered) AS recent7_ordered_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30 AND is_ordered) AS recent30_ordered_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60) AS recent60_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2) AS period_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2 AND is_ordered) AS period_ordered_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN $2 + 1 AND $2 * 2) AS previous_period_new_count,
         COUNT(*) FILTER (WHERE days_online BETWEEN $2 + 1 AND $2 * 2 AND is_ordered) AS previous_period_ordered_count,
         COALESCE(SUM(ad_spend),0) AS ad_spend,
         COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
         COALESCE(SUM(order_sales_amount),0) AS order_sales_amount,
         COALESCE(SUM(ad_order_count),0) AS ad_order_count,
         COUNT(*) FILTER (WHERE (ad_spend >= 5 AND ad_order_count = 0 AND clicks >= 10) OR (target_roas IS NOT NULL AND roas IS NOT NULL AND roas < target_roas)) AS loss_new_count,
         COUNT(*) FILTER (WHERE ad_order_count > 0 AND target_roas IS NOT NULL AND roas IS NOT NULL AND roas >= target_roas) AS high_potential_count,
         COUNT(*) FILTER (WHERE product_tag = '数据未匹配') AS unmatched_count,
         (
           SELECT COUNT(*)
           FROM temu_ad_recommendations r
           LEFT JOIN temu_new_product_daily_snapshot sr
             ON sr.product_id = r.product_id
            AND sr.snapshot_date = r.recommendation_date
           WHERE r.status = 'PENDING'
             AND r.recommendation_date = $1
             ${recommendationScopeCondition}
         ) AS pending_recommendation_count
       FROM temu_new_product_daily_snapshot s
       WHERE ${condition}`,
      queryValues,
    ),
    queryTemuDatabase(
      `SELECT operator_id, operator_name,
              COUNT(DISTINCT store_id) AS store_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2) AS period_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2 AND is_ordered) AS period_ordered_count,
              COUNT(*) AS new_count,
              COALESCE(SUM(order_count),0) AS order_count,
              COALESCE(SUM(ad_order_count),0) AS ad_order_count,
              COALESCE(SUM(natural_order_count),0) AS natural_order_count,
              COUNT(*) FILTER (WHERE ad_order_count > 0 AND target_roas IS NOT NULL AND roas IS NOT NULL AND roas >= target_roas) AS high_potential_count,
              COUNT(*) FILTER (WHERE (ad_spend >= 5 AND ad_order_count = 0 AND clicks >= 10) OR (target_roas IS NOT NULL AND roas IS NOT NULL AND roas < target_roas) OR product_tag = '数据未匹配') AS problem_count,
              COALESCE(SUM(ad_spend),0) AS ad_spend,
              COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
              COALESCE(SUM(order_sales_amount),0) AS order_sales_amount
       FROM temu_new_product_daily_snapshot s
       WHERE ${condition}
       GROUP BY operator_id, operator_name
       ORDER BY period_ordered_count DESC, period_new_count DESC
       LIMIT 20`,
      queryValues,
    ),
    queryTemuDatabase(
      `SELECT store_id, store_name,
              MAX(operator_name) AS operator_name,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2) AS period_new_count,
              COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND $2 AND is_ordered) AS period_ordered_count,
              COUNT(*) AS new_count,
              COALESCE(SUM(order_count),0) AS order_count,
              COALESCE(SUM(ad_order_count),0) AS ad_order_count,
              COALESCE(SUM(natural_order_count),0) AS natural_order_count,
              COUNT(*) FILTER (WHERE ad_order_count > 0 AND target_roas IS NOT NULL AND roas IS NOT NULL AND roas >= target_roas) AS high_potential_count,
              COUNT(*) FILTER (WHERE (ad_spend >= 5 AND ad_order_count = 0 AND clicks >= 10) OR (target_roas IS NOT NULL AND roas IS NOT NULL AND roas < target_roas)) AS loss_new_count,
              COUNT(*) FILTER (WHERE ad_spend >= 5 AND ad_order_count = 0 AND clicks >= 10) AS burn_no_order_count,
              COUNT(*) FILTER (WHERE product_tag = '数据未匹配') AS unmatched_count,
              COALESCE(SUM(ad_spend),0) AS ad_spend,
              COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
              COALESCE(SUM(order_sales_amount),0) AS order_sales_amount
       FROM temu_new_product_daily_snapshot s
       WHERE ${condition}
       GROUP BY store_id, store_name
       ORDER BY period_ordered_count DESC, period_new_count DESC
       LIMIT 20`,
      queryValues,
    ),
  ]);
  const snapshotStores = storeRanking.rows.map(decorateBossStoreRow);
  const scopedStores = await getScopedTemuStores(params, snapshotDate);
  const storeMap = new Map(snapshotStores.map((store) => [String(store.storeId || store.storeName), store]));
  const decoratedStores = [
    ...snapshotStores,
    ...scopedStores
      .filter((store) => !storeMap.has(String(store.storeId || store.storeName)))
      .map((store) => decorateBossStoreRow({
        store_id: store.storeId,
        store_name: store.storeName,
        operator_id: store.operatorId,
        operator_name: store.operatorName,
        recent7_new_count: 0,
        recent30_new_count: 0,
        recent60_ordered_count: 0,
        period_new_count: 0,
        period_ordered_count: 0,
        new_count: 0,
        order_count: 0,
        ad_order_count: 0,
        natural_order_count: 0,
        high_potential_count: 0,
        loss_new_count: 0,
        burn_no_order_count: 0,
        unmatched_count: 0,
        ad_spend: 0,
        ad_sales_amount: 0,
        order_sales_amount: 0,
      })),
  ];
  const decoratedOperators = operatorRanking.rows.map(decorateBossOperatorRow);
  const topStoreIds = decoratedStores.slice(0, 5).map((store) => store.storeId).filter(Boolean);
  let storeTrend = [];
  if (topStoreIds.length > 0) {
    const trendValues = [...queryValues, topStoreIds];
    const trendStorePlaceholder = `$${trendValues.length}`;
    const trendResult = await queryTemuDatabase(
      `SELECT s.store_id,
              s.store_name,
              s.first_online_at::date AS date,
              COUNT(*)::int AS new_count
       FROM temu_new_product_daily_snapshot s
       WHERE ${condition}
         AND s.days_online BETWEEN 1 AND $2
         AND s.store_id = ANY(${trendStorePlaceholder}::uuid[])
       GROUP BY s.store_id, s.store_name, s.first_online_at::date
       ORDER BY date ASC, new_count DESC`,
      trendValues,
    );
    storeTrend = trendResult.rows.map(toCamel);
  }
  const row = summary.rows[0] || {};
  const attentionStoreCount = decoratedStores.filter((store) => ['需关注', '广告缺失'].includes(store.statusLabel)).length;
  return {
    snapshotDate,
    dataCutoffDate,
    dateMode,
    periodDays,
    summary: {
      todayNewCount: Number(row.today_new_count || 0),
      recent7NewCount: Number(row.recent7_new_count || 0),
      recent7OrderedRate: safeDivide(row.recent7_ordered_count, row.recent7_new_count),
      recent30NewCount: Number(row.recent30_new_count || 0),
      recent30OrderedCount: Number(row.recent30_ordered_count || 0),
      recent30OrderedRate: safeDivide(row.recent30_ordered_count, row.recent30_new_count),
      recent60OrderedCount: Number(row.recent60_ordered_count || 0),
      recent60OrderedRate: safeDivide(row.recent60_ordered_count, row.recent60_new_count),
      periodNewCount: Number(row.period_new_count || 0),
      periodOrderedCount: Number(row.period_ordered_count || 0),
      periodOrderedRate: safeDivide(row.period_ordered_count, row.period_new_count),
      previousPeriodNewCount: Number(row.previous_period_new_count || 0),
      previousPeriodOrderedCount: Number(row.previous_period_ordered_count || 0),
      previousPeriodOrderedRate: safeDivide(row.previous_period_ordered_count, row.previous_period_new_count),
      adSpend: Number(row.ad_spend || 0),
      adSalesAmount: Number(row.ad_sales_amount || 0),
      orderSalesAmount: Number(row.order_sales_amount || 0),
      adOrderCount: Number(row.ad_order_count || 0),
      roas: safeDivide(row.ad_sales_amount, row.ad_spend),
      lossNewCount: Number(row.loss_new_count || 0),
      highPotentialCount: Number(row.high_potential_count || 0),
      unmatchedCount: Number(row.unmatched_count || 0),
      attentionStoreCount,
      pendingRecommendationCount: Number(row.pending_recommendation_count || 0),
      baseProductCount: baseCounts.products,
      baseSkuCount: baseCounts.skus,
      baseAdCount: baseCounts.ads,
    },
    focusStores: decoratedStores
      .filter((store) => ['需关注', '广告缺失'].includes(store.statusLabel))
      .sort((a, b) => (b.lossNewCount || 0) - (a.lossNewCount || 0) || (a.periodOrderedRate || 0) - (b.periodOrderedRate || 0))
      .slice(0, 5),
    potentialStores: decoratedStores
      .filter((store) => store.statusLabel === '优秀' || Number(store.highPotentialCount || 0) > 0)
      .sort((a, b) => (b.highPotentialCount || 0) - (a.highPotentialCount || 0) || (b.periodOrderedRate || 0) - (a.periodOrderedRate || 0))
      .slice(0, 5),
    operatorFocus: decoratedOperators
      .sort((a, b) => (b.problemCount || 0) - (a.problemCount || 0) || (b.periodNewCount || 0) - (a.periodNewCount || 0))
      .slice(0, 5),
    operatorRanking: decoratedOperators,
    storeRanking: decoratedStores,
    storeTrend,
  };
}

async function getBossDashboardLegacy(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const recommendationScopeCondition = where.length ? `AND ${where.join(' AND ').replace(/\bs\./g, 'sr.')}` : '';
  const baseCounts = await getScopedBaseCounts(params);
  const summary = await queryTemuDatabase(
    `SELECT
       COUNT(*) FILTER (WHERE days_online = 1) AS today_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7 AND is_ordered) AS recent7_ordered_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30 AND is_ordered) AS recent30_ordered_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60) AS recent60_new_count,
       COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
       COALESCE(SUM(ad_spend),0) AS ad_spend,
       COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
       COALESCE(SUM(order_sales_amount),0) AS order_sales_amount,
       COUNT(*) FILTER (WHERE product_tag IN ('烧钱无单','高费比新品')) AS loss_new_count,
       COUNT(*) FILTER (WHERE product_tag = '高潜新品') AS high_potential_count,
       COUNT(*) FILTER (WHERE product_tag = '数据未匹配') AS unmatched_count,
       (
         SELECT COUNT(*)
         FROM temu_ad_recommendations r
         LEFT JOIN temu_new_product_daily_snapshot sr
           ON sr.product_id = r.product_id
          AND sr.snapshot_date = r.recommendation_date
         WHERE r.status = 'PENDING'
           AND r.recommendation_date = $1
           ${recommendationScopeCondition}
       ) AS pending_recommendation_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}`,
    [snapshotDate, ...values],
  );
  const operatorRanking = await queryTemuDatabase(
    `SELECT operator_id, operator_name,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
            COUNT(*) AS new_count,
            COALESCE(SUM(order_count),0) AS order_count,
            COALESCE(SUM(ad_spend),0) AS ad_spend, COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
            COALESCE(SUM(order_sales_amount),0) AS order_sales_amount
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY operator_id, operator_name
     ORDER BY order_count DESC, new_count DESC
     LIMIT 20`,
    [snapshotDate, ...values],
  );
  const storeRanking = await queryTemuDatabase(
    `SELECT store_id, store_name,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 7) AS recent7_new_count,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 30) AS recent30_new_count,
            COUNT(*) FILTER (WHERE days_online BETWEEN 1 AND 60 AND is_ordered) AS recent60_ordered_count,
            COUNT(*) AS new_count,
            COALESCE(SUM(order_count),0) AS order_count,
            COALESCE(SUM(ad_spend),0) AS ad_spend, COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
            COALESCE(SUM(order_sales_amount),0) AS order_sales_amount
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
    dataCutoffDate,
    dateMode,
    summary: {
      todayNewCount: Number(row.today_new_count || 0),
      recent7NewCount: Number(row.recent7_new_count || 0),
      recent7OrderedRate: safeDivide(row.recent7_ordered_count, row.recent7_new_count),
      recent30NewCount: Number(row.recent30_new_count || 0),
      recent30OrderedCount: Number(row.recent30_ordered_count || 0),
      recent30OrderedRate: safeDivide(row.recent30_ordered_count, row.recent30_new_count),
      recent60OrderedCount: Number(row.recent60_ordered_count || 0),
      recent60OrderedRate: safeDivide(row.recent60_ordered_count, row.recent60_new_count),
      adSpend: Number(row.ad_spend || 0),
      adSalesAmount: Number(row.ad_sales_amount || 0),
      orderSalesAmount: Number(row.order_sales_amount || 0),
      roas: safeDivide(row.ad_sales_amount, row.ad_spend),
      lossNewCount: Number(row.loss_new_count || 0),
      highPotentialCount: Number(row.high_potential_count || 0),
      unmatchedCount: Number(row.unmatched_count || 0),
      pendingRecommendationCount: Number(row.pending_recommendation_count || 0),
      baseProductCount: baseCounts.products,
      baseSkuCount: baseCounts.skus,
      baseAdCount: baseCounts.ads,
    },
    operatorRanking: operatorRanking.rows.map(toCamel),
    storeRanking: storeRanking.rows.map(toCamel),
  };
}

export async function getOperatorOptions(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where, `COALESCE(NULLIF(s.operator_name, ''), '') <> ''`].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.operator_id,
            s.operator_name,
            COUNT(DISTINCT s.store_id) AS store_count,
            COUNT(*) AS product_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY s.operator_id, s.operator_name
     ORDER BY s.operator_name ASC`,
    [snapshotDate, ...values],
  );
  const relationFilter = createWhereBuilder(1);
  relationFilter.where.push(`r.status <> 'inactive'`);
  relationFilter.where.push(`COALESCE(NULLIF(COALESCE(o.operator_name, r.operator_name), ''), '') <> ''`);
  if (params.storeId) relationFilter.push('r.store_id = ?::uuid', params.storeId);
  if (params.storeName) relationFilter.push('r.store_name = ?', params.storeName);
  const relationResult = await queryTemuDatabase(
    `SELECT r.operator_id,
            COALESCE(o.operator_name, r.operator_name) AS operator_name,
            COUNT(DISTINCT COALESCE(r.store_id::text, r.store_name)) AS store_count,
            0::int AS product_count
     FROM temu_store_operator_relations r
     LEFT JOIN temu_operators o ON o.id = r.operator_id
     WHERE ${relationFilter.where.join(' AND ')}
     GROUP BY r.operator_id, COALESCE(o.operator_name, r.operator_name)
     ORDER BY operator_name ASC`,
    relationFilter.values,
  );
  const operatorMap = new Map();
  [...relationResult.rows, ...result.rows].forEach((row) => {
    const operatorName = normalizeTemuOperatorName(row.operator_name);
    if (!operatorName) return;
    const current = operatorMap.get(operatorName) || { ...row, store_count: 0, product_count: 0 };
    operatorMap.set(operatorName, {
      operator_id: row.operator_id || current.operator_id,
      operator_name: operatorName,
      store_count: Math.max(Number(current.store_count || 0), Number(row.store_count || 0)),
      product_count: Math.max(Number(current.product_count || 0), Number(row.product_count || 0)),
    });
  });
  return {
    snapshotDate,
    dataCutoffDate,
    dateMode,
    operators: Array.from(operatorMap.values()).sort((a, b) => text(a.operator_name).localeCompare(text(b.operator_name), 'zh-CN')).map(toCamel),
  };
}

export async function getStoreOptions(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where, `COALESCE(NULLIF(s.store_name, ''), '') <> ''`].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.store_id,
            s.store_name,
            COUNT(DISTINCT s.operator_id) AS operator_count,
            COUNT(*) AS product_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY s.store_id, s.store_name
     ORDER BY s.store_name ASC`,
    [snapshotDate, ...values],
  );
  return {
    snapshotDate,
    dataCutoffDate,
    dateMode,
    stores: result.rows.map(toCamel),
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
  if (params.storeId) {
    values.push(params.storeId);
    where.push(`r.store_id = (SELECT id FROM temu_stores WHERE id::text = $${values.length} OR legacy_id = $${values.length} OR store_name = $${values.length} LIMIT 1)`);
  }
  if (params.storeName) push('r.store_name = ?', params.storeName);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeIds);
      where.push(`r.store_id = ANY($${values.length}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      where.push('1 = 0');
    } else {
      values.push(params.storeNames);
      where.push(`r.store_name = ANY($${values.length}::text[])`);
    }
  }
  if (params.operatorId) {
    push('r.operator_id = ?', params.operatorId);
  } else if (params.operatorName) {
    const aliases = getTemuOperatorNameAliases(params.operatorName);
    if (aliases.length) {
      values.push(aliases);
      where.push(`r.operator_name = ANY($${values.length}::text[])`);
    }
  }
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

export function getAdStrategyConfig() {
  return AD_STAGE_STRATEGY_CONFIG;
}

export async function getAdStrategyPending(params = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 50)));
  const existing = await getRecommendations({ ...params, page: 1, pageSize: 100 });
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const { where, values } = buildScopeWhere(params, 2);
  if (params.type) {
    where.push(`(
      s.product_tag = $${values.length + 2}
      OR s.latest_recommendation_type = $${values.length + 2}
      OR s.latest_recommendation_text = $${values.length + 2}
    )`);
    values.push(params.type);
  }
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const snapshots = await queryTemuDatabase(
    `SELECT s.*
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     ORDER BY s.ad_spend DESC NULLS LAST, s.updated_at DESC
     LIMIT 1000`,
    [snapshotDate, ...values],
  );
  const generated = snapshots.rows
    .map(strategyRecommendationForSnapshot)
    .filter(Boolean)
    .filter((record) => !params.status || params.status === 'PENDING');
  const searchText = String(params.search || params.keyword || '').trim().toLowerCase();
  const stageText = String(params.currentStage || '').trim();
  const priorityText = String(params.priority || '').trim().toUpperCase();
  const merged = [...existing.records, ...generated]
    .filter((record) => !params.type || record.recommendationType === params.type || record.problemType === params.type || record.productTag === params.type)
    .filter((record) => !priorityText || String(record.priority || '').toUpperCase() === priorityText)
    .filter((record) => !stageText || String(record.currentStage || '').includes(stageText))
    .filter((record) => {
      if (!searchText) return true;
      return [
        record.productName,
        record.temuSpuId,
        record.storeName,
        record.operatorName,
        record.recommendationType,
        record.problemType,
      ].some((value) => String(value || '').toLowerCase().includes(searchText));
    });
  const records = merged.slice((page - 1) * pageSize, page * pageSize);
  return {
    records,
    total: merged.length,
    page,
    pageSize,
    snapshotDate,
    dataCutoffDate,
    dateMode,
  };
}

export async function getAdStrategyCounts(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const aggregate = await queryTemuDatabase(
    `SELECT
       COUNT(*)::int AS all_count,
       COUNT(*) FILTER (WHERE s.product_tag = '烧钱无单')::int AS pending_count,
       COUNT(*) FILTER (WHERE s.product_tag = '高潜新品')::int AS high_potential_count,
       COUNT(*) FILTER (WHERE s.product_tag = '烧钱无单')::int AS burn_no_order_count,
       COUNT(*) FILTER (WHERE s.product_tag = '有流量无转化')::int AS traffic_no_conversion_count,
       COUNT(*) FILTER (WHERE s.product_tag = '加购未成交')::int AS cart_no_order_count,
       COUNT(*) FILTER (WHERE s.product_tag = '低曝光新品')::int AS low_exposure_count,
       COUNT(*) FILTER (WHERE s.product_tag = '自然起量')::int AS natural_growth_count,
       COUNT(*) FILTER (WHERE s.is_ordered = TRUE)::int AS ordered_count,
       COUNT(*) FILTER (WHERE s.is_ordered = FALSE)::int AS not_ordered_count,
       COUNT(*) FILTER (WHERE s.product_tag = '数据未匹配')::int AS unmatched_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}`,
    [snapshotDate, ...values],
  );
  const result = await queryTemuDatabase(
    `SELECT s.product_tag, s.latest_recommendation_type, s.latest_recommendation_text,
            s.days_online, s.target_roas, s.ad_spend, s.impressions, s.clicks,
            s.ad_order_count, s.roas, s.natural_order_count
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}`,
    [snapshotDate, ...values],
  );
  const row = aggregate.rows[0] || {};
  const counts = {
    all: Number(row.all_count || 0),
    pending: Number(row.pending_count || 0),
    highPotential: Number(row.high_potential_count || 0),
    burnNoOrder: Number(row.burn_no_order_count || 0),
    trafficNoConversion: Number(row.traffic_no_conversion_count || 0),
    cartNoOrder: Number(row.cart_no_order_count || 0),
    lowExposure: Number(row.low_exposure_count || 0),
    naturalGrowth: Number(row.natural_growth_count || 0),
    ordered: Number(row.ordered_count || 0),
    notOrdered: Number(row.not_ordered_count || 0),
    unmatched: Number(row.unmatched_count || 0),
  };
  for (const row of result.rows) {
    const productTag = row.product_tag || '普通新品';
    counts[productTag] = (counts[productTag] || 0) + 1;
    const generated = strategyRecommendationForSnapshot(row);
    if (generated) {
      counts[generated.recommendationType] = (counts[generated.recommendationType] || 0) + 1;
      counts[generated.problemType] = (counts[generated.problemType] || 0) + 1;
    }
  }
  return { counts, snapshotDate, dataCutoffDate, dateMode };
}

export async function getAdStrategyExecution(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 50)));
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date = $1`, ...where].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.*, COUNT(*) OVER() AS total
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     ORDER BY s.days_online ASC, s.ad_spend DESC NULLS LAST, s.updated_at DESC
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [snapshotDate, ...values, pageSize, (page - 1) * pageSize],
  );
  const records = result.rows.map((row) => {
    const plan = adStagePlanForDays(row.days_online);
    return {
      ...toCamel(row),
      currentStage: plan.name,
      plannedTargetRoas: plan.targetRoas,
      actualTargetRoas: row.target_roas === null ? null : Number(row.target_roas),
      executionStatus: adStageExecutionStatus(row),
      stageEffect: row.ad_order_count > 0 ? '已有广告订单' : (row.natural_order_count > 0 ? '自然出单' : '待验证'),
      nextAction: strategyRecommendationForSnapshot(row)?.suggestedAction || '继续按阶段策略观察',
    };
  });
  return { records, total: Number(result.rows[0]?.total || 0), page, pageSize, snapshotDate, dataCutoffDate, dateMode };
}

export async function getAdStrategyReview(params = {}) {
  const { snapshotDate, dataCutoffDate, dateMode } = await resolveSnapshotDate(params);
  await ensureSnapshotForRead(snapshotDate);
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 50)));
  const { where, values } = buildScopeWhere(params, 2);
  const condition = [`s.snapshot_date <= $1::date`, `s.days_online BETWEEN 1 AND 30`, ...where].join(' AND ');
  const result = await queryTemuDatabase(
    `SELECT s.product_id, s.product_name, s.store_name, s.operator_name,
            CASE
              WHEN s.days_online BETWEEN 1 AND 7 THEN '第1周 冷启动期'
              WHEN s.days_online BETWEEN 8 AND 14 THEN '第2周 测试期'
              WHEN s.days_online BETWEEN 15 AND 21 THEN '第3周 控本期'
              ELSE '第4周 利润期'
            END AS stage_name,
            MIN(s.snapshot_date)::text AS stage_start_date,
            MAX(s.snapshot_date)::text AS stage_end_date,
            MAX(s.target_roas) AS actual_target_roas,
            COALESCE(SUM(s.ad_spend),0) AS ad_spend,
            COALESCE(SUM(s.ad_sales_amount),0) AS ad_sales_amount,
            COALESCE(SUM(s.ad_order_count),0) AS ad_order_count,
            COALESCE(SUM(s.natural_order_count),0) AS natural_order_count,
            COALESCE(SUM(s.impressions),0) AS impressions,
            COALESCE(SUM(s.clicks),0) AS clicks,
            COALESCE(SUM(s.add_to_cart_count),0) AS add_to_cart_count,
            CASE WHEN COALESCE(SUM(s.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(s.ad_sales_amount),0) / NULLIF(SUM(s.ad_spend),0) END AS roas,
            MIN(s.days_online) AS min_days_online,
            COUNT(*) OVER() AS total
     FROM temu_new_product_daily_snapshot s
     WHERE ${condition}
     GROUP BY s.product_id, s.product_name, s.store_name, s.operator_name,
              CASE
                WHEN s.days_online BETWEEN 1 AND 7 THEN '第1周 冷启动期'
                WHEN s.days_online BETWEEN 8 AND 14 THEN '第2周 测试期'
                WHEN s.days_online BETWEEN 15 AND 21 THEN '第3周 控本期'
                ELSE '第4周 利润期'
              END
     ORDER BY MAX(s.snapshot_date) DESC, SUM(s.ad_spend) DESC NULLS LAST
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [snapshotDate, ...values, pageSize, (page - 1) * pageSize],
  );
  const records = result.rows.map((row) => {
    const plan = adStagePlanForDays(row.min_days_online);
    const roas = row.roas === null ? null : Number(row.roas);
    const planned = plan.targetRoas;
    return {
      ...toCamel(row),
      stageDate: `${String(row.stage_start_date || '').slice(0, 10)} ~ ${String(row.stage_end_date || '').slice(0, 10)}`,
      plannedTargetRoas: planned,
      systemJudgement: planned && roas !== null && roas >= planned ? '阶段达标' : '继续优化',
      operatorAction: '-',
    };
  });
  return { records, total: Number(result.rows[0]?.total || 0), page, pageSize, snapshotDate, dataCutoffDate, dateMode };
}

function createWhereBuilder(startIndex = 1) {
  const values = [];
  const where = [];
  const push = (sql, value) => {
    values.push(value);
    where.push(sql.replace(/\?/g, `$${startIndex + values.length - 1}`));
  };
  return { values, where, push, startIndex };
}

function appendStoreScope(whereBuilder, alias, params = {}) {
  if (params.storeId) {
    whereBuilder.values.push(String(params.storeId));
    const placeholder = `$${whereBuilder.startIndex + whereBuilder.values.length - 1}`;
    whereBuilder.where.push(`(
      ${alias}.store_id::text = ${placeholder}
      OR ${alias}.store_id = (
        SELECT id
        FROM temu_stores
        WHERE id::text = ${placeholder} OR legacy_id = ${placeholder} OR store_name = ${placeholder}
        LIMIT 1
      )
      OR ${alias}.store_name = ${placeholder}
    )`);
  }
  if (params.storeName) {
    whereBuilder.values.push(params.storeName);
    const placeholder = `$${whereBuilder.startIndex + whereBuilder.values.length - 1}`;
    whereBuilder.where.push(`(
      ${alias}.store_name = ${placeholder}
      OR ${alias}.store_id = (
        SELECT id
        FROM temu_stores
        WHERE store_name = ${placeholder} OR legacy_id = ${placeholder}
        LIMIT 1
      )
    )`);
  }
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      whereBuilder.where.push('1 = 0');
    } else {
      const storeIds = params.storeIds.map((id) => String(id || '').trim()).filter(Boolean);
      if (storeIds.length === 0) {
        whereBuilder.where.push('1 = 0');
      } else {
        whereBuilder.values.push(storeIds);
        const placeholder = `$${whereBuilder.startIndex + whereBuilder.values.length - 1}`;
        whereBuilder.where.push(`(
          ${alias}.store_id::text = ANY(${placeholder}::text[])
          OR ${alias}.store_id IN (
            SELECT id
            FROM temu_stores
            WHERE id::text = ANY(${placeholder}::text[])
               OR legacy_id = ANY(${placeholder}::text[])
               OR store_name = ANY(${placeholder}::text[])
          )
          OR ${alias}.store_name = ANY(${placeholder}::text[])
        )`);
      }
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      whereBuilder.where.push('1 = 0');
    } else {
      whereBuilder.values.push(params.storeNames);
      const placeholder = `$${whereBuilder.startIndex + whereBuilder.values.length - 1}`;
      whereBuilder.where.push(`(
        ${alias}.store_name = ANY(${placeholder}::text[])
        OR ${alias}.store_id IN (
          SELECT id
          FROM temu_stores
          WHERE store_name = ANY(${placeholder}::text[])
             OR legacy_id = ANY(${placeholder}::text[])
        )
      )`);
    }
  }
}

async function backfillTemuImportBatchStores() {
  await queryTemuDatabase(
    `UPDATE temu_import_batches b
     SET store_id = s.id,
         store_name = s.store_name,
         updated_at = NOW()
     FROM temu_stores s
     WHERE b.import_type IN ('product_info', 'ad_product_daily')
       AND (b.store_id IS NULL OR COALESCE(b.store_name, '') = '')
       AND NULLIF(b.raw_data ->> 'storeName', '') = s.store_name`,
  );
}

let temuImportBatchStoreBackfillPromise = null;
let temuImportBatchStoreBackfillAt = 0;
const TEMU_IMPORT_BATCH_STORE_BACKFILL_TTL_MS = 10 * 60_000;

async function ensureTemuImportBatchStoreBackfill({ blocking = false } = {}) {
  const isExpired = Date.now() - temuImportBatchStoreBackfillAt > TEMU_IMPORT_BATCH_STORE_BACKFILL_TTL_MS;
  if (!temuImportBatchStoreBackfillPromise || isExpired) {
    temuImportBatchStoreBackfillPromise = (async () => {
      await runTemuMigrations();
      await backfillTemuImportBatchStores();
      temuImportBatchStoreBackfillAt = Date.now();
    })().catch((error) => {
      temuImportBatchStoreBackfillPromise = null;
      temuImportBatchStoreBackfillAt = 0;
      if (blocking) {
        throw error;
      }
      console.warn('[TEMU PostgreSQL] import batch store backfill skipped:', error?.message || error);
    });
  }
  return blocking ? temuImportBatchStoreBackfillPromise : undefined;
}

let temuProductStatsMaintenancePromise = null;
let temuProductStatsMaintenanceAt = 0;
const TEMU_PRODUCT_STATS_MAINTENANCE_TTL_MS = 5 * 60_000;

async function ensureTemuProductStatsMaintenance() {
  if (!temuProductStatsMaintenancePromise || Date.now() - temuProductStatsMaintenanceAt > TEMU_PRODUCT_STATS_MAINTENANCE_TTL_MS) {
    temuProductStatsMaintenancePromise = (async () => {
      await runTemuMigrations();
      await ensureTemuImportBatchStoreBackfill({ blocking: true });
      temuProductStatsMaintenanceAt = Date.now();
    })().catch((error) => {
      temuProductStatsMaintenancePromise = null;
      temuProductStatsMaintenanceAt = 0;
      throw error;
    });
  }
  return temuProductStatsMaintenancePromise;
}

export async function getProductImportOverview(params = {}) {
  await runTemuMigrations();
  const currentPage = Math.max(Number(params.page) || 1, 1);
  const size = Math.min(Math.max(Number(params.pageSize) || 50, 1), 2000);
  const offset = (currentPage - 1) * size;
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'product_rows', params);
  if (params.createdDateStart) filter.push('product_rows.created_time::date >= ?::date', params.createdDateStart);
  if (params.createdDateEnd) filter.push('product_rows.created_time::date <= ?::date', params.createdDateEnd);
  if (params.productStatus) filter.push('product_rows.product_status = ?', params.productStatus);
  if (params.categoryName) filter.push('product_rows.leaf_category_name ILIKE ?', `%${params.categoryName}%`);
  if (params.spuId) filter.push('product_rows.spu_id ILIKE ?', `%${params.spuId}%`);
  if (params.skuId) filter.push('product_rows.sku_id ILIKE ?', `%${params.skuId}%`);
  if (params.skuCode) filter.push('product_rows.sku_code ILIKE ?', `%${params.skuCode}%`);
  if (params.productTitle) filter.push('product_rows.product_title ILIKE ?', `%${params.productTitle}%`);
  const productCondition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';

  const batchFilter = createWhereBuilder(1);
  batchFilter.push('b.import_type = ?', 'product_info');
  if (params.storeId) {
    batchFilter.values.push(params.storeId);
    batchFilter.where.push(`(
      b.store_id = $${batchFilter.values.length}::uuid
      OR b.store_name = (SELECT store_name FROM temu_stores WHERE id = $${batchFilter.values.length}::uuid)
      OR b.raw_data ->> 'storeName' = (SELECT store_name FROM temu_stores WHERE id = $${batchFilter.values.length}::uuid)
    )`);
  }
  if (params.storeName) {
    batchFilter.push(`COALESCE(NULLIF(b.store_name, ''), b.raw_data ->> 'storeName') = ?`, params.storeName);
  }
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      batchFilter.where.push('1 = 0');
    } else {
      batchFilter.values.push(params.storeIds);
      batchFilter.where.push(`b.store_id = ANY($${batchFilter.values.length}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      batchFilter.where.push('1 = 0');
    } else {
      batchFilter.values.push(params.storeNames);
      batchFilter.where.push(`COALESCE(NULLIF(b.store_name, ''), b.raw_data ->> 'storeName') = ANY($${batchFilter.values.length}::text[])`);
    }
  }
  const batchCondition = `WHERE ${batchFilter.where.join(' AND ')}`;
  const batches = await queryTemuDatabase(
    `SELECT b.id, b.import_type, b.file_name, b.report_date::text AS report_date, b.store_id, b.store_name,
            b.total_rows, b.success_rows, b.error_rows, b.status, b.error_message,
            b.uploaded_by, b.uploaded_by_name, b.created_at, b.finished_at
     FROM temu_import_batches b
     ${batchCondition}
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    batchFilter.values,
  );
  const skuCreatedTimeFromRaw = `CASE WHEN NULLIF(s.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(s.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const productCreatedTimeFromRaw = `CASE WHEN NULLIF(p.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(p.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const baseCte = `WITH product_rows AS (
     SELECT s.id, s.product_id, s.store_id,
          COALESCE(NULLIF(s.product_title, ''), NULLIF(s.raw_data ->> '商品标题', ''), NULLIF(p.product_title, ''), NULLIF(p.raw_data ->> '商品标题', ''), p.product_name) AS product_title,
          COALESCE(NULLIF(s.spu_id, ''), NULLIF(s.raw_data ->> 'SPU ID', ''), NULLIF(p.spu_id, ''), NULLIF(p.raw_data ->> 'SPU ID', ''), p.temu_spu_id) AS spu_id,
          COALESCE(NULLIF(s.skc_id, ''), NULLIF(s.temu_skc_id, ''), NULLIF(s.raw_data ->> 'SKC ID', ''), NULLIF(p.skc_id, ''), NULLIF(p.temu_skc_id, ''), NULLIF(p.raw_data ->> 'SKC ID', '')) AS skc_id,
          COALESCE(NULLIF(s.sku_id, ''), NULLIF(s.raw_data ->> 'SKU ID', '')) AS sku_id,
          COALESCE(NULLIF(s.skc_code, ''), NULLIF(s.raw_data ->> 'SKC货号', ''), NULLIF(p.skc_code, ''), NULLIF(p.raw_data ->> 'SKC货号', '')) AS skc_code,
          COALESCE(NULLIF(s.sku_code, ''), NULLIF(s.raw_data ->> 'SKU货号', '')) AS sku_code,
          COALESCE(NULLIF(s.leaf_category_name, ''), NULLIF(s.raw_data ->> '叶子类目名称', ''), NULLIF(p.leaf_category_name, ''), NULLIF(p.raw_data ->> '叶子类目名称', ''), p.category_name) AS leaf_category_name,
          COALESCE(NULLIF(s.product_status, ''), NULLIF(s.raw_data ->> '商品状态', ''), NULLIF(p.product_status, ''), NULLIF(p.raw_data ->> '商品状态', '')) AS product_status,
          COALESCE(NULLIF(s.spec1_name, ''), NULLIF(s.raw_data ->> '规格1名称', '')) AS spec1_name,
          COALESCE(NULLIF(s.spec2_name, ''), NULLIF(s.raw_data ->> '规格2名称', '')) AS spec2_name,
          COALESCE(
            s.declared_price_cny,
            CASE WHEN (s.raw_data ->> '申报价格(CNY)') ~ '^\\s*-?\\d+(\\.\\d+)?\\s*$' THEN (s.raw_data ->> '申报价格(CNY)')::numeric ELSE NULL END,
            p.declared_price_cny,
            CASE WHEN (p.raw_data ->> '申报价格(CNY)') ~ '^\\s*-?\\d+(\\.\\d+)?\\s*$' THEN (p.raw_data ->> '申报价格(CNY)')::numeric ELSE NULL END,
            p.current_price
          ) AS declared_price_cny,
          COALESCE(NULLIF(s.declared_price_status, ''), NULLIF(s.raw_data ->> '申报价格状态', ''), NULLIF(p.declared_price_status, ''), NULLIF(p.raw_data ->> '申报价格状态', '')) AS declared_price_status,
          COALESCE(s.created_time, ${skuCreatedTimeFromRaw}, p.created_time, ${productCreatedTimeFromRaw}, p.first_online_at) AS created_time,
          s.store_name,
          s.updated_at
     FROM temu_product_skus s
     LEFT JOIN temu_products p ON p.id = s.product_id
   )`;
  const products = await queryTemuDatabase(
    `${baseCte}
     SELECT *, COUNT(*) OVER()::int AS total_count
     FROM product_rows
     ${productCondition}
     ORDER BY created_time DESC NULLS LAST, updated_at DESC, id DESC
     LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}`,
    [...filter.values, size, offset],
  );
  const summary = await queryTemuDatabase(
    `${baseCte}
     SELECT COUNT(DISTINCT product_id)::int AS product_count,
            COUNT(*)::int AS sku_count,
            COUNT(*) FILTER (WHERE sku_id IS NULL OR sku_id = '')::int AS missing_sku_id
     FROM product_rows
     ${productCondition}`,
    filter.values,
  );
  const categoryFilter = createWhereBuilder(1);
  appendStoreScope(categoryFilter, 'product_rows', params);
  const categoryCondition = categoryFilter.where.length ? `WHERE ${categoryFilter.where.join(' AND ')} AND` : 'WHERE';
  const categories = await queryTemuDatabase(
    `${baseCte}
     SELECT DISTINCT leaf_category_name
     FROM product_rows
     ${categoryCondition} NULLIF(leaf_category_name, '') IS NOT NULL
     ORDER BY leaf_category_name ASC
     LIMIT 200`,
    categoryFilter.values,
  );
  const records = products.rows.map(toCamel);
  return {
    batches: batches.rows.map(toCamel),
    records,
    total: Number(products.rows[0]?.total_count || 0),
    page: currentPage,
    pageSize: size,
    summary: toCamel(summary.rows[0] || {}),
    categoryOptions: categories.rows.map((row) => String(row.leaf_category_name || '')).filter(Boolean),
  };
}

export async function getProductImportRankingSummary(params = {}) {
  await runTemuMigrations();
  const month = String(params.month || '').match(/^\d{4}-\d{2}$/)?.[0] || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'product_rows', params);
  filter.push('product_rows.created_time::date >= ?::date', startDate);
  filter.push('product_rows.created_time::date <= ?::date', endDate);
  const condition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';
  const skuCreatedTimeFromRaw = `CASE WHEN NULLIF(s.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(s.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const productCreatedTimeFromRaw = `CASE WHEN NULLIF(p.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(p.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const result = await queryTemuDatabase(
    `WITH product_rows AS (
       SELECT COALESCE(s.product_id, p.id) AS product_id,
              s.store_id,
              s.store_name,
              COALESCE(s.created_time, ${skuCreatedTimeFromRaw}, p.created_time, ${productCreatedTimeFromRaw}, p.first_online_at) AS created_time
       FROM temu_product_skus s
       LEFT JOIN temu_products p ON p.id = s.product_id
     )
     SELECT store_id, store_name, COUNT(DISTINCT product_id)::int AS product_count
     FROM product_rows
     ${condition}
     GROUP BY store_id, store_name
     ORDER BY product_count DESC, store_name ASC`,
    filter.values,
  );

  return {
    month,
    records: result.rows.map((row) => ({
      storeId: row.store_id || '',
      storeName: row.store_name || '',
      productCount: Number(row.product_count || 0),
    })),
  };
}

export async function readEffectiveListingsFromProductImport(params = {}) {
  await runTemuMigrations();
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'product_rows', params);
  const recentDays = Number(params.recentDays || params.days || 0);
  const startDate = dateText(params.dateStart || params.startDate);
  const endDate = dateText(params.dateEnd || params.endDate);
  if (Number.isFinite(recentDays) && recentDays > 0) {
    filter.push('product_rows.created_time::date >= (bounds.latest_date - (?::int - 1))', Math.ceil(recentDays));
  }
  if (startDate) {
    filter.push('product_rows.created_time::date >= ?::date', startDate);
  }
  if (endDate) {
    filter.push('product_rows.created_time::date <= ?::date', endDate);
  }
  const condition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';
  const skuCreatedTimeFromRaw = `CASE WHEN NULLIF(s.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(s.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const productCreatedTimeFromRaw = `CASE WHEN NULLIF(p.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(p.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const result = await queryTemuDatabase(
    `WITH raw_sku_rows AS (
       SELECT
         COALESCE(s.product_id::text, NULLIF(s.temu_spu_id, ''), NULLIF(s.temu_product_id, ''), NULLIF(s.raw_data ->> 'SPU ID', ''), NULLIF(s.raw_data ->> '商品ID', ''), s.id::text) AS product_key,
         COALESCE(s.product_id, p.id) AS product_uuid,
         s.store_id,
         s.store_name,
         COALESCE(NULLIF(s.skc_id, ''), NULLIF(s.temu_skc_id, ''), NULLIF(s.raw_data ->> 'SKC ID', ''), NULLIF(p.skc_id, ''), NULLIF(p.temu_skc_id, ''), NULLIF(p.raw_data ->> 'SKC ID', '')) AS skc_id,
         COALESCE(NULLIF(s.skc_code, ''), NULLIF(s.raw_data ->> 'SKC货号', ''), NULLIF(p.skc_code, ''), NULLIF(p.raw_data ->> 'SKC货号', '')) AS skc_code,
         COALESCE(p.operator_id, NULL) AS product_operator_id,
         COALESCE(NULLIF(p.operator_name, ''), NULL) AS product_operator_name,
         COALESCE(s.created_time, ${skuCreatedTimeFromRaw}, p.created_time, ${productCreatedTimeFromRaw}, p.first_online_at) AS created_time,
         GREATEST(COALESCE(s.updated_at, '-infinity'::timestamptz), COALESCE(p.updated_at, '-infinity'::timestamptz)) AS updated_at
       FROM temu_product_skus s
       LEFT JOIN temu_products p ON p.id = s.product_id
     ),
     product_rows AS (
       SELECT
         r.product_key,
         (ARRAY_AGG(r.product_uuid ORDER BY r.product_uuid IS NULL))[1] AS product_id,
         (ARRAY_AGG(r.store_id ORDER BY r.store_id IS NULL))[1] AS store_id,
         (ARRAY_AGG(r.store_name ORDER BY r.store_name IS NULL, r.store_name))[1] AS store_name,
         (ARRAY_AGG(COALESCE(NULLIF(r.skc_id, ''), NULLIF(r.skc_code, ''), r.product_key) ORDER BY COALESCE(NULLIF(r.skc_id, ''), NULLIF(r.skc_code, ''), r.product_key)))[1] AS skc,
         (ARRAY_AGG(COALESCE(r.product_operator_id, relation.operator_id) ORDER BY COALESCE(r.product_operator_id, relation.operator_id) IS NULL))[1] AS operator_id,
         (ARRAY_AGG(COALESCE(r.product_operator_name, relation.operator_name) ORDER BY COALESCE(r.product_operator_name, relation.operator_name) IS NULL))[1] AS operator_name,
         MIN(r.created_time) AS created_time,
         MAX(r.updated_at) AS updated_at
       FROM raw_sku_rows r
       LEFT JOIN LATERAL (
         SELECT rel.operator_id, rel.operator_name
         FROM temu_store_operator_relations rel
         WHERE rel.status <> 'inactive'
           AND (
             rel.store_id = r.store_id
             OR (NULLIF(rel.store_name, '') IS NOT NULL AND rel.store_name = r.store_name)
           )
           AND (rel.start_date IS NULL OR rel.start_date <= COALESCE(r.created_time::date, CURRENT_DATE))
           AND (rel.end_date IS NULL OR rel.end_date >= COALESCE(r.created_time::date, CURRENT_DATE))
         ORDER BY CASE WHEN rel.role = 'primary' THEN 0 ELSE 1 END, rel.updated_at DESC
         LIMIT 1
       ) relation ON TRUE
       WHERE r.created_time IS NOT NULL
       GROUP BY r.product_key
     )
     , bounds AS (
       SELECT MAX(created_time::date) AS latest_date
       FROM product_rows
     )
     SELECT product_key, product_id, store_id, store_name, skc, operator_id, operator_name,
            created_time::date AS site_join_date, updated_at
     FROM product_rows
     CROSS JOIN bounds
     ${condition}
     ORDER BY site_join_date DESC, store_name ASC, skc ASC`,
    filter.values,
  );

  return result.rows.map((row) => ({
    id: `product-info-${row.product_key}`,
    platform: 'TEMU',
    storeId: row.store_id || '',
    storeName: row.store_name || '',
    operatorId: row.operator_id || '',
    operatorName: row.operator_name || '',
    siteJoinDate: dateText(row.site_join_date),
    skc: row.skc || row.product_id || row.product_key || '',
    remark: '来自商品信息导入',
    createdBy: '',
    createdByName: '商品信息导入',
    createdAt: dateText(row.site_join_date),
    updatedAt: row.updated_at,
  }));
}

const newProductFirstOrderStatsCache = new Map();
const NEW_PRODUCT_FIRST_ORDER_STATS_CACHE_TTL_MS = 2 * 60_000;

export function clearNewProductFirstOrderStatsCache() {
  newProductFirstOrderStatsCache.clear();
}

function getNewProductFirstOrderStatsCacheKey(params = {}) {
  return JSON.stringify(Object.entries({
    periodStart: dateText(params.periodStart),
    periodEnd: dateText(params.periodEnd),
    today: dateText(params.today),
    observeDays: Math.max(1, Number(params.observeDays || 30)),
    dateMode: params.dateMode === 'observeEnd' ? 'observeEnd' : 'listedAt',
    operatorId: params.operatorId || '',
    operatorName: params.operatorName || '',
    storeNames: Array.isArray(params.storeNames) ? [...params.storeNames].map((name) => String(name || '').trim()).filter(Boolean).sort().join(',') : '',
    storeIds: Array.isArray(params.storeIds) ? [...params.storeIds].map((id) => String(id || '').trim()).filter(Boolean).sort().join(',') : '',
  }).sort(([first], [second]) => first.localeCompare(second)));
}

export async function calculateNewProductFirstOrderStats(params = {}) {
  const cacheKey = getNewProductFirstOrderStatsCacheKey(params);
  const cached = newProductFirstOrderStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) newProductFirstOrderStatsCache.delete(cacheKey);
  await ensureTemuProductStatsMaintenance();
  const observeDays = Math.max(1, Number(params.observeDays || 30));
  const periodStart = dateText(params.periodStart) || `${new Date().toISOString().slice(0, 7)}-01`;
  const periodEnd = dateText(params.periodEnd) || periodStart;
  const today = dateText(params.today) || new Date().toISOString().slice(0, 10);
  const dateMode = params.dateMode === 'observeEnd' ? 'observeEnd' : 'listedAt';
  const rawFilter = createWhereBuilder(3);
  appendStoreScope(rawFilter, 's', params);
  const rawCondition = rawFilter.where.length ? `WHERE ${rawFilter.where.join(' AND ')}` : '';
  const filter = createWhereBuilder(3 + rawFilter.values.length);
  appendStoreScope(filter, 'product_rows', params);
  if (dateMode === 'observeEnd') {
    filter.push(`(product_rows.listed_at::date + ($1::int * INTERVAL '1 day'))::date >= ?::date`, periodStart);
    filter.push(`(product_rows.listed_at::date + ($1::int * INTERVAL '1 day'))::date <= ?::date`, periodEnd);
  } else {
    filter.push('product_rows.listed_at::date >= ?::date', periodStart);
    filter.push('product_rows.listed_at::date <= ?::date', periodEnd);
  }
  if (params.operatorId) {
    filter.push('(product_rows.operator_id::text = ? OR product_rows.legacy_operator_id = ?)', String(params.operatorId));
  }
  if (params.operatorName) {
    pushOperatorNameAliasesToBuilder(filter, 'product_rows.operator_name', params.operatorName);
  }
  const condition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';
  const skuCreatedTimeFromRaw = `CASE WHEN NULLIF(s.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(s.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const productCreatedTimeFromRaw = `CASE WHEN NULLIF(p.raw_data ->> '创建时间', '') ~ '^\\d{4}-\\d{1,2}-\\d{1,2}' THEN NULLIF(p.raw_data ->> '创建时间', '')::timestamptz ELSE NULL END`;
  const result = await queryTemuDatabase(
    `WITH raw_sku_rows AS (
       SELECT
         COALESCE(s.product_id::text, NULLIF(s.temu_spu_id, ''), NULLIF(s.temu_product_id, ''), NULLIF(s.raw_data ->> 'SPU ID', ''), NULLIF(s.raw_data ->> '商品ID', ''), s.id::text) AS product_key,
         COALESCE(s.product_id, p.id) AS product_uuid,
         s.id AS sku_row_id,
         s.store_id,
         s.store_name,
         COALESCE(NULLIF(s.product_title, ''), NULLIF(s.raw_data ->> '商品标题', ''), NULLIF(p.product_title, ''), NULLIF(p.raw_data ->> '商品标题', ''), p.product_name) AS product_name,
         COALESCE(NULLIF(s.spu_id, ''), NULLIF(s.raw_data ->> 'SPU ID', ''), NULLIF(p.spu_id, ''), NULLIF(p.raw_data ->> 'SPU ID', ''), p.temu_spu_id) AS spu_id,
         COALESCE(NULLIF(s.skc_id, ''), NULLIF(s.temu_skc_id, ''), NULLIF(s.raw_data ->> 'SKC ID', ''), NULLIF(p.skc_id, ''), NULLIF(p.temu_skc_id, ''), NULLIF(p.raw_data ->> 'SKC ID', '')) AS skc_id,
         COALESCE(NULLIF(s.sku_id, ''), NULLIF(s.raw_data ->> 'SKU ID', '')) AS sku_id,
         COALESCE(NULLIF(s.sku_code, ''), NULLIF(s.raw_data ->> 'SKU货号', '')) AS sku_code,
         COALESCE(p.operator_id, NULL) AS product_operator_id,
         COALESCE(NULLIF(p.operator_name, ''), NULL) AS product_operator_name,
         COALESCE(s.created_time, ${skuCreatedTimeFromRaw}, p.created_time, ${productCreatedTimeFromRaw}, p.first_online_at) AS listed_at,
         GREATEST(COALESCE(s.updated_at, '-infinity'::timestamptz), COALESCE(p.updated_at, '-infinity'::timestamptz)) AS updated_at
     FROM temu_product_skus s
     LEFT JOIN temu_products p ON p.id = s.product_id
     ${rawCondition}
     ),
     sku_rows AS (
       SELECT
         r.*,
         COALESCE(r.product_operator_id, relation.operator_id) AS operator_id,
         COALESCE(r.product_operator_name, relation.operator_name) AS operator_name,
         relation.legacy_operator_id
       FROM raw_sku_rows r
       LEFT JOIN LATERAL (
         SELECT rel.operator_id, rel.operator_name, rel.legacy_operator_id
         FROM temu_store_operator_relations rel
         WHERE rel.status <> 'inactive'
           AND (
             rel.store_id = r.store_id
             OR (NULLIF(rel.store_name, '') IS NOT NULL AND rel.store_name = r.store_name)
           )
           AND (rel.start_date IS NULL OR rel.start_date <= COALESCE(r.listed_at::date, CURRENT_DATE))
           AND (rel.end_date IS NULL OR rel.end_date >= COALESCE(r.listed_at::date, CURRENT_DATE))
         ORDER BY CASE WHEN rel.role = 'primary' THEN 0 ELSE 1 END, rel.updated_at DESC
         LIMIT 1
       ) relation ON TRUE
       WHERE r.listed_at IS NOT NULL
     ),
     product_rows AS (
       SELECT
         product_key,
         (ARRAY_AGG(product_uuid ORDER BY product_uuid IS NULL))[1] AS product_id,
         (ARRAY_AGG(store_id ORDER BY store_id IS NULL))[1] AS store_id,
         (ARRAY_AGG(store_name ORDER BY store_name IS NULL, store_name))[1] AS store_name,
         (ARRAY_AGG(operator_id ORDER BY operator_id IS NULL))[1] AS operator_id,
         (ARRAY_AGG(operator_name ORDER BY operator_name IS NULL, operator_name))[1] AS operator_name,
         (ARRAY_AGG(legacy_operator_id ORDER BY legacy_operator_id IS NULL))[1] AS legacy_operator_id,
         (ARRAY_AGG(product_name ORDER BY product_name IS NULL, product_name))[1] AS product_name,
         (ARRAY_AGG(spu_id ORDER BY spu_id IS NULL, spu_id))[1] AS spu_id,
         (ARRAY_AGG(skc_id ORDER BY skc_id IS NULL, skc_id))[1] AS skc_id,
         STRING_AGG(DISTINCT NULLIF(sku_id, ''), ', ' ORDER BY NULLIF(sku_id, '')) AS sku_id,
         MIN(listed_at) AS listed_at,
         MAX(updated_at) AS updated_at
       FROM sku_rows
       GROUP BY product_key
     ),
     scoped_products AS (
       SELECT *
       FROM product_rows
       ${condition}
     ),
     first_orders AS (
       SELECT p.product_key, MIN(o.order_date)::date AS first_order_at
       FROM scoped_products p
       JOIN sku_rows sr ON sr.product_key = p.product_key
       JOIN temu_order_items o ON o.is_valid_order = TRUE
        AND o.is_cancelled = FALSE
        AND o.order_date IS NOT NULL
        AND o.order_date >= p.listed_at::date
        AND o.order_date <= $2::date
        AND (
          o.store_id IS NULL
          OR sr.store_id IS NULL
          OR o.store_id = sr.store_id
          OR (
            NULLIF(o.store_name, '') IS NOT NULL
            AND NULLIF(sr.store_name, '') IS NOT NULL
            AND o.store_name = sr.store_name
          )
        )
        AND (
          (o.product_id IS NOT NULL AND o.product_id = sr.product_uuid)
          OR (o.product_sku_id IS NOT NULL AND o.product_sku_id = sr.sku_row_id)
          OR (
            o.store_id = sr.store_id
            AND (
              (NULLIF(o.sku_id, '') IS NOT NULL AND o.sku_id = sr.sku_id)
              OR (NULLIF(o.sku_code, '') IS NOT NULL AND o.sku_code = sr.sku_code)
            )
          )
        )
       GROUP BY p.product_key
     )
     SELECT
       scoped_products.product_key,
       scoped_products.product_id,
       scoped_products.product_name,
       scoped_products.spu_id,
       scoped_products.skc_id,
       scoped_products.sku_id,
       scoped_products.store_id,
       scoped_products.store_name,
       scoped_products.operator_id,
       scoped_products.operator_name,
       scoped_products.listed_at::date AS listed_at,
       (scoped_products.listed_at::date + ($1::int * INTERVAL '1 day'))::date AS observe_end_at,
       first_orders.first_order_at,
       CASE
         WHEN first_orders.first_order_at IS NOT NULL
          AND first_orders.first_order_at <= (scoped_products.listed_at::date + ($1::int * INTERVAL '1 day'))::date
           THEN 'FIRST_ORDER_SUCCESS'
         WHEN first_orders.first_order_at IS NOT NULL
          AND first_orders.first_order_at > (scoped_products.listed_at::date + ($1::int * INTERVAL '1 day'))::date
           THEN 'DELAYED_FIRST_ORDER'
         WHEN $2::date > (scoped_products.listed_at::date + ($1::int * INTERVAL '1 day'))::date
           THEN 'EXPIRED_NO_FIRST_ORDER'
         ELSE 'OBSERVING'
       END AS status,
       GREATEST(((scoped_products.listed_at::date + ($1::int * INTERVAL '1 day'))::date - $2::date), 0)::int AS remaining_observe_days,
       scoped_products.updated_at
     FROM scoped_products
     LEFT JOIN first_orders ON first_orders.product_key = scoped_products.product_key
     ORDER BY scoped_products.listed_at DESC, scoped_products.store_name ASC, scoped_products.product_name ASC`,
    [observeDays, today, ...rawFilter.values, ...filter.values],
  );
  const products = result.rows.map((row) => {
    const listedAt = dateText(row.listed_at);
    const observationDueDate = dateText(row.observe_end_at);
    const firstOrderAt = dateText(row.first_order_at);
    const convertedWithin30d = row.status === 'FIRST_ORDER_SUCCESS';
    const observationStatus = convertedWithin30d
      ? '到期已达成'
      : row.status === 'OBSERVING'
        ? '观察中'
        : '到期未达成';
    return {
      productId: row.product_id || row.product_key || '',
      productKey: row.product_key || '',
      productName: row.product_name || '',
      spuId: row.spu_id || '',
      skcId: row.skc_id || '',
      skuId: row.sku_id || '',
      operatorId: row.operator_id || '',
      operatorName: row.operator_name || '',
      storeId: row.store_id || '',
      storeName: row.store_name || '',
      listedAt,
      firstOnlineAt: listedAt,
      observeEndAt: observationDueDate,
      observationDueDate,
      kpiMonth: observationDueDate ? observationDueDate.slice(0, 7) : '',
      firstOrderAt,
      convertedWithin30d,
      observationStatus,
      status: row.status,
      remainingObserveDays: Number(row.remaining_observe_days || 0),
      updatedAt: row.updated_at,
    };
  });
  const firstOrderWithin30DaysCount = products.filter((item) => item.status === 'FIRST_ORDER_SUCCESS').length;
  const expiredNoFirstOrderCount = products.filter((item) => item.status === 'EXPIRED_NO_FIRST_ORDER').length;
  const delayedFirstOrderCount = products.filter((item) => item.status === 'DELAYED_FIRST_ORDER').length;
  const observingCount = products.filter((item) => item.status === 'OBSERVING').length;
  const decidableCount = firstOrderWithin30DaysCount + expiredNoFirstOrderCount + delayedFirstOrderCount;
  const value = {
    periodStart,
    periodEnd,
    observeDays,
    dateMode,
    newProductCount: products.length,
    firstOrderWithin30DaysCount,
    expiredNoFirstOrderCount,
    delayedFirstOrderCount,
    observingCount,
    decidableCount,
    firstOrderRate: decidableCount > 0 ? firstOrderWithin30DaysCount / decidableCount : null,
    products,
    dataUpdatedAt: products.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) || '',
  };
  newProductFirstOrderStatsCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + NEW_PRODUCT_FIRST_ORDER_STATS_CACHE_TTL_MS,
  });
  return value;
}

const AD_IMPORT_SORT_FIELDS = {
  adSpend: 'a.ad_spend',
  netAdSpend: 'a.net_ad_spend',
  globalSalesAmount: 'a.global_sales_amount',
  globalRoas: 'a.global_roas',
  globalAcos: 'a.global_acos',
  globalCpa: 'a.global_cpa',
  globalSubOrderCount: 'a.global_sub_order_count',
  globalUnitCount: 'a.global_unit_count',
  globalImpressions: 'a.global_impressions',
  globalClicks: 'a.global_clicks',
  globalCtr: 'a.global_ctr',
  globalCvr: 'a.global_cvr',
  globalAddToCartCount: 'a.global_add_to_cart_count',
  promoSalesAmount: 'a.promo_sales_amount',
  promoRoas: 'a.promo_roas',
  promoWeekRoas: 'a.promo_week_roas',
  targetRoas: 'a.target_roas',
  promoAcos: 'a.promo_acos',
  promoCpa: 'a.promo_cpa',
  promoSubOrderCount: 'a.promo_sub_order_count',
  promoUnitCount: 'a.promo_unit_count',
  promoImpressions: 'a.promo_impressions',
  promoClicks: 'a.promo_clicks',
  promoCtr: 'a.promo_ctr',
  promoCvr: 'a.promo_cvr',
  promoAddToCartCount: 'a.promo_add_to_cart_count',
  netPromoSalesAmount: 'a.net_promo_sales_amount',
  netPromoRoas: 'a.net_promo_roas',
  netPromoAcos: 'a.net_promo_acos',
  netPromoCpa: 'a.net_promo_cpa',
  netPromoSubOrderCount: 'a.net_promo_sub_order_count',
  netPromoUnitCount: 'a.net_promo_unit_count',
};

export async function getAdImportOverview(params = {}) {
  await runTemuMigrations();
  const topOnly = params.topOnly === true || String(params.topOnly || '').toLowerCase() === 'true';
  const lightweight = params.lightweight === true || String(params.lightweight || '').toLowerCase() === 'true';
  const fastPage = topOnly || lightweight;
  const currentPage = fastPage ? 1 : Math.max(Number(params.page) || 1, 1);
  const requestedSize = Number(params.limit || params.pageSize) || (topOnly ? 10 : 50);
  const size = topOnly
    ? Math.min(Math.max(requestedSize, 1), 50)
    : lightweight
      ? Math.min(Math.max(requestedSize, 1), 100)
      : Math.min(Math.max(Number(params.pageSize) || 50, 1), 2000);
  const offset = (currentPage - 1) * size;
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'a', params);
  if (params.reportDate) filter.push('a.report_date = ?::date', params.reportDate);
  if (!params.reportDate && params.startDate) filter.push('a.report_date >= ?::date', params.startDate);
  if (!params.reportDate && params.endDate) filter.push('a.report_date <= ?::date', params.endDate);
  if (params.operatorName) pushOperatorNameAliasesToBuilder(filter, 'a.operator_name', params.operatorName);
  if (params.spuId) filter.push('a.temu_spu_id ILIKE ?', `%${params.spuId}%`);
  if (params.productName) filter.push('a.product_name ILIKE ?', `%${params.productName}%`);
  if (params.matched === 'true') filter.where.push('a.product_id IS NOT NULL');
  if (params.matched === 'false') filter.where.push('a.product_id IS NULL');
  if (params.roasMet === 'true') filter.where.push('a.target_roas IS NOT NULL AND a.global_roas IS NOT NULL AND a.global_roas >= a.target_roas');
  if (params.roasMet === 'false') filter.where.push('a.target_roas IS NOT NULL AND a.global_roas IS NOT NULL AND a.global_roas < a.target_roas');
  if (params.roasMin) filter.push('a.global_roas >= ?', Number(params.roasMin));
  if (params.roasMax) filter.push('a.global_roas <= ?', Number(params.roasMax));
  if (params.adSpendMin) filter.push('a.ad_spend >= ?', Number(params.adSpendMin));
  if (params.adSpendMax) filter.push('a.ad_spend <= ?', Number(params.adSpendMax));
  if (params.promoOrderMin) filter.push('a.global_sub_order_count >= ?', Number(params.promoOrderMin));
  if (params.promoOrderMax) filter.push('a.global_sub_order_count <= ?', Number(params.promoOrderMax));
  if (topOnly) {
    filter.where.push('a.ad_spend > 0');
    filter.where.push('a.global_roas IS NOT NULL');
    filter.where.push('a.global_roas > 0');
  }
  const adCondition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : 'WHERE 1 = 0';
  const sortColumn = AD_IMPORT_SORT_FIELDS[params.sortField] || AD_IMPORT_SORT_FIELDS.adSpend;
  const sortDirection = String(params.sortDirection || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const includeSkuMeta = !fastPage && String(params.includeSkuMeta || 'true').toLowerCase() !== 'false';
  const recordTotalExpression = fastPage ? 'NULL::int' : 'COUNT(*) OVER()::int';

  const ads = await queryTemuDatabase(
    `WITH paged_ads AS (
       SELECT a.id, a.product_id, a.report_date, a.store_name, a.operator_name, a.temu_product_id, a.temu_spu_id,
              a.product_name, a.ad_spend, a.net_ad_spend,
              a.global_sales_amount, a.global_roas, a.global_acos, a.global_cpa, a.global_sub_order_count,
              a.global_unit_count, a.global_impressions, a.global_clicks, a.global_ctr, a.global_cvr,
              a.global_add_to_cart_count,
              a.promo_sales_amount, a.promo_roas, a.promo_week_roas, a.target_roas, a.promo_acos, a.promo_cpa,
              a.promo_sub_order_count, a.promo_unit_count, a.promo_impressions, a.promo_clicks, a.promo_ctr,
              a.promo_cvr, a.promo_add_to_cart_count,
              a.net_promo_sales_amount, a.net_promo_roas, a.net_promo_acos, a.net_promo_cpa,
              a.net_promo_sub_order_count, a.net_promo_unit_count,
              a.raw_data, a.updated_at, ${recordTotalExpression} AS total_count
       FROM temu_ad_product_daily a
       ${adCondition}
       ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, a.report_date DESC, a.updated_at DESC, a.id DESC
       LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}
     )
     SELECT pa.*,
            ${includeSkuMeta ? 'sku_meta.skc_ids' : 'NULL::text AS skc_ids'}
     FROM paged_ads pa
     ${includeSkuMeta ? `LEFT JOIN LATERAL (
       SELECT STRING_AGG(DISTINCT NULLIF(COALESCE(ps.skc_id, ps.temu_skc_id, ps.raw_data ->> 'SKC ID', p.skc_id, p.temu_skc_id, p.raw_data ->> 'SKC ID'), ''), ' / ') AS skc_ids
       FROM temu_product_skus ps
       LEFT JOIN temu_products p ON p.id = ps.product_id
       WHERE (
         (pa.product_id IS NOT NULL AND ps.product_id = pa.product_id)
         OR (
           NULLIF(pa.temu_spu_id, '') IS NOT NULL
           AND COALESCE(NULLIF(ps.spu_id, ''), NULLIF(ps.raw_data ->> 'SPU ID', ''), NULLIF(p.spu_id, ''), NULLIF(p.raw_data ->> 'SPU ID', ''), NULLIF(p.temu_spu_id, '')) = pa.temu_spu_id
           AND COALESCE(NULLIF(ps.store_name, ''), NULLIF(p.store_name, '')) = pa.store_name
         )
       )
     ) sku_meta ON TRUE` : ''}
     ORDER BY ${sortColumn.replace(/\ba\./g, 'pa.')} ${sortDirection} NULLS LAST, pa.report_date DESC, pa.updated_at DESC, pa.id DESC`,
    [...filter.values, size, offset],
  );
  if (topOnly) {
    return {
      batches: [],
      records: ads.rows.map(toCamel),
      total: ads.rows.length,
      page: 1,
      pageSize: size,
      summary: {},
      storeSummary: [],
      storeTrend: [],
      unmatched: [],
      reportDates: [],
    };
  }
  if (lightweight) {
    const [summary, storeSummary, storeTrend] = await Promise.all([
      queryTemuDatabase(
        `SELECT COUNT(*)::int AS ad_product_count,
                COALESCE(SUM(a.ad_spend),0) AS ad_spend,
                COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
                COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
                COALESCE(SUM(a.global_impressions),0) AS global_impressions,
                COALESCE(SUM(a.global_clicks),0) AS global_clicks,
                COALESCE(SUM(a.global_add_to_cart_count),0) AS global_add_to_cart_count,
                COALESCE(SUM(a.global_unit_count),0) AS global_unit_count,
                CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
                CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos,
                COUNT(*) FILTER (WHERE a.product_id IS NULL)::int AS unmatched_count,
                COUNT(*) FILTER (WHERE a.product_id IS NOT NULL)::int AS matched_count
         FROM temu_ad_product_daily a
         ${adCondition}`,
        filter.values,
      ),
      queryTemuDatabase(
        `SELECT a.store_name,
                COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
                COUNT(*)::int AS ad_product_count,
                COALESCE(SUM(a.ad_spend),0) AS ad_spend,
                COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
                COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
                COALESCE(SUM(a.global_impressions),0) AS global_impressions,
                COALESCE(SUM(a.global_clicks),0) AS global_clicks,
                COALESCE(SUM(a.global_add_to_cart_count),0) AS global_add_to_cart_count,
                COALESCE(SUM(a.global_unit_count),0) AS global_unit_count,
                CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
                CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos,
                CASE WHEN COALESCE(SUM(a.global_sub_order_count),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sub_order_count),0) END AS global_cpa,
                CASE WHEN COALESCE(SUM(a.global_clicks),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sub_order_count),0) / NULLIF(SUM(a.global_clicks),0) END AS global_cvr,
                COUNT(*) FILTER (WHERE a.product_id IS NULL)::int AS unmatched_count,
                COUNT(*) FILTER (WHERE a.product_id IS NOT NULL)::int AS matched_count
         FROM temu_ad_product_daily a
         ${adCondition}
         GROUP BY a.store_name
         ORDER BY ad_spend DESC NULLS LAST, a.store_name`,
        filter.values,
      ),
      queryTemuDatabase(
        `SELECT a.report_date::text AS report_date,
                a.store_name,
                COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
                COUNT(*)::int AS ad_product_count,
                COALESCE(SUM(a.ad_spend),0) AS ad_spend,
                COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
                COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
                COALESCE(SUM(a.global_clicks),0) AS global_clicks,
                CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
                CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos
         FROM temu_ad_product_daily a
         ${adCondition}
         GROUP BY a.report_date, a.store_name
         ORDER BY a.report_date ASC, a.store_name`,
        filter.values,
      ),
    ]);
    const summaryRow = summary.rows[0] || {};
    return {
      batches: [],
      records: ads.rows.map(toCamel),
      total: Number(summaryRow.ad_product_count || ads.rows.length),
      page: 1,
      pageSize: size,
      summary: toCamel(summaryRow),
      storeSummary: storeSummary.rows.map(toCamel),
      storeTrend: storeTrend.rows.map(toCamel),
      unmatched: [],
      reportDates: [],
    };
  }

  const batchFilter = createWhereBuilder(1);
  batchFilter.push('b.import_type = ?', 'ad_product_daily');
  if (params.storeId) batchFilter.push('b.store_id = ?::uuid', params.storeId);
  if (params.storeName) batchFilter.push('b.store_name = ?', params.storeName);
  if (params.reportDate) batchFilter.push('b.report_date = ?::date', params.reportDate);
  if (Array.isArray(params.storeIds)) {
    if (params.storeIds.length === 0) {
      batchFilter.where.push('1 = 0');
    } else {
      batchFilter.values.push(params.storeIds);
      batchFilter.where.push(`b.store_id = ANY($${batchFilter.values.length}::uuid[])`);
    }
  }
  if (Array.isArray(params.storeNames)) {
    if (params.storeNames.length === 0) {
      batchFilter.where.push('1 = 0');
    } else {
      batchFilter.values.push(params.storeNames);
      batchFilter.where.push(`b.store_name = ANY($${batchFilter.values.length}::text[])`);
    }
  }
  const batchCondition = `WHERE ${batchFilter.where.join(' AND ')}`;
  const batches = await queryTemuDatabase(
    `SELECT b.id, b.import_type, b.file_name, b.report_date::text AS report_date, b.store_id, b.store_name,
            b.total_rows, b.success_rows, b.error_rows, b.status, b.error_message,
            b.uploaded_by, b.uploaded_by_name, b.created_at, b.finished_at
     FROM temu_import_batches b
     ${batchCondition}
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    batchFilter.values,
  );
  const summary = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS ad_product_count,
            COALESCE(SUM(a.ad_spend),0) AS ad_spend,
            COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
            COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
            COALESCE(SUM(a.global_impressions),0) AS global_impressions,
            COALESCE(SUM(a.global_clicks),0) AS global_clicks,
            COALESCE(SUM(a.global_add_to_cart_count),0) AS global_add_to_cart_count,
            COALESCE(SUM(a.global_unit_count),0) AS global_unit_count,
            CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
            CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos,
            COUNT(*) FILTER (WHERE a.product_id IS NULL)::int AS unmatched_count,
            COUNT(*) FILTER (WHERE a.product_id IS NOT NULL)::int AS matched_count
     FROM temu_ad_product_daily a
     ${adCondition}`,
    filter.values,
  );
  const storeSummary = await queryTemuDatabase(
    `SELECT a.store_name,
            COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
            COUNT(*)::int AS ad_product_count,
            COALESCE(SUM(a.ad_spend),0) AS ad_spend,
            COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
            COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
            COALESCE(SUM(a.global_impressions),0) AS global_impressions,
            COALESCE(SUM(a.global_clicks),0) AS global_clicks,
            COALESCE(SUM(a.global_add_to_cart_count),0) AS global_add_to_cart_count,
            COALESCE(SUM(a.global_unit_count),0) AS global_unit_count,
            CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
            CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos,
            CASE WHEN COALESCE(SUM(a.global_sub_order_count),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sub_order_count),0) END AS global_cpa,
            CASE WHEN COALESCE(SUM(a.global_clicks),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sub_order_count),0) / NULLIF(SUM(a.global_clicks),0) END AS global_cvr,
            COUNT(*) FILTER (WHERE a.product_id IS NULL)::int AS unmatched_count,
            COUNT(*) FILTER (WHERE a.product_id IS NOT NULL)::int AS matched_count
     FROM temu_ad_product_daily a
     ${adCondition}
     GROUP BY a.store_name
     ORDER BY ad_spend DESC NULLS LAST, store_name`,
    filter.values,
  );
  const storeTrend = await queryTemuDatabase(
    `SELECT a.report_date::text AS report_date,
            a.store_name,
            COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
            COUNT(*)::int AS ad_product_count,
            COALESCE(SUM(a.ad_spend),0) AS ad_spend,
            COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
            COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
            COALESCE(SUM(a.global_clicks),0) AS global_clicks,
            CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
            CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos
     FROM temu_ad_product_daily a
     ${adCondition}
     GROUP BY a.report_date, a.store_name
     ORDER BY a.report_date ASC, a.store_name`,
    filter.values,
  );
  const unmatched = await queryTemuDatabase(
    `SELECT product_name, temu_product_id, temu_spu_id, 'SPU未匹配商品信息' AS error_reason
     FROM temu_ad_product_daily a
     ${adCondition} AND a.product_id IS NULL
     ORDER BY a.ad_spend DESC NULLS LAST, a.updated_at DESC
     LIMIT 50`,
    filter.values,
  );
  const dateFilter = createWhereBuilder(1);
  appendStoreScope(dateFilter, 'a', params);
  const dateCondition = dateFilter.where.length ? `WHERE ${dateFilter.where.join(' AND ')}` : '';
  const dates = await queryTemuDatabase(
    `SELECT DISTINCT report_date::text AS report_date
     FROM temu_ad_product_daily a
     ${dateCondition}
     ORDER BY report_date DESC
     LIMIT 30`,
    dateFilter.values,
  );
  return {
    batches: batches.rows.map(toCamel),
    records: ads.rows.map(toCamel),
    total: Number(ads.rows[0]?.total_count || 0),
    page: currentPage,
    pageSize: size,
    summary: toCamel(summary.rows[0] || {}),
    storeSummary: storeSummary.rows.map(toCamel),
    storeTrend: storeTrend.rows.map(toCamel),
    unmatched: unmatched.rows.map(toCamel),
    reportDates: dates.rows.map((row) => String(row.report_date || '').slice(0, 10)).filter(Boolean),
  };
}

function parseTrendStoreNames(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTrendMetricSortExpression(metric) {
  if (metric === 'roas') {
    return `CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END`;
  }
  if (metric === 'acos') {
    return `CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END`;
  }
  if (metric === 'adSalesAmount') return 'COALESCE(SUM(a.global_sales_amount),0)';
  return 'COALESCE(SUM(a.ad_spend),0)';
}

function buildAdTrendConclusions({ trendRows, selectedStores, metric }) {
  const rowsByStore = new Map();
  for (const row of trendRows) {
    const storeName = String(row.storeName || '').trim();
    if (!storeName) continue;
    const rows = rowsByStore.get(storeName) || [];
    rows.push(row);
    rowsByStore.set(storeName, rows);
  }
  const conclusions = [];
  for (const storeName of selectedStores) {
    const rows = (rowsByStore.get(storeName) || []).sort((a, b) => String(a.reportDate || '').localeCompare(String(b.reportDate || '')));
    if (rows.length < 2) continue;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const spendChange = Number(last.adSpend || 0) - Number(first.adSpend || 0);
    const salesChange = Number(last.globalSalesAmount || 0) - Number(first.globalSalesAmount || 0);
    const roasValues = rows.map((row) => Number(row.globalRoas || 0)).filter((value) => Number.isFinite(value) && value > 0);
    const acosValues = rows.map((row) => Number(row.globalAcos || 0)).filter((value) => Number.isFinite(value) && value > 0);
    if (spendChange > 0 && salesChange <= 0) {
      conclusions.push({ tone: 'risk', text: `${storeName}广告花费上涨，但申报价销售额没有同步增长` });
    }
    if (roasValues.length >= 3 && roasValues.slice(-3).every((value, index, list) => index === 0 || value < list[index - 1])) {
      conclusions.push({ tone: 'risk', text: `${storeName}投资回报率(ROAS)连续下降，建议检查投放商品` });
    }
    if (acosValues.slice(-3).filter((value) => value >= 0.3).length >= 3) {
      conclusions.push({ tone: 'warning', text: `${storeName}费比连续3天高于预警线` });
    }
    if (salesChange > 0 && spendChange >= 0) {
      conclusions.push({ tone: 'good', text: `${storeName}申报价销售额持续改善，可关注预算承接` });
    }
  }
  if (!conclusions.length && selectedStores.length) {
    conclusions.push({ tone: 'good', text: `当前筛选范围广告趋势整体平稳，暂无明显异常。` });
  }
  return conclusions.slice(0, 5);
}

export async function getAdImportTrend(params = {}) {
  await runTemuMigrations();
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'a', params);
  if (params.startDate) filter.push('a.report_date >= ?::date', params.startDate);
  if (params.endDate) filter.push('a.report_date <= ?::date', params.endDate);
  if (params.operatorName) pushOperatorNameAliasesToBuilder(filter, 'a.operator_name', params.operatorName);

  const manualStoreNames = parseTrendStoreNames(params.trendStoreNames || params.storeNamesForTrend);
  const rangeMode = String(params.trendStoreMode || 'topSpend5');
  const metric = String(params.metric || 'adSpend');
  const limit = Math.min(Math.max(Number(params.limit || 5), 1), 5);

  if (manualStoreNames.length > 0) {
    filter.values.push(manualStoreNames.slice(0, 5));
    filter.where.push(`a.store_name = ANY($${filter.startIndex + filter.values.length - 1}::text[])`);
  }

  const condition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : 'WHERE 1 = 0';
  const storeOrderMetric = rangeMode === 'roasLow5'
    ? getTrendMetricSortExpression('roas')
    : getTrendMetricSortExpression(metric);
  const storeOrderDirection = rangeMode === 'roasLow5' ? 'ASC NULLS LAST' : 'DESC NULLS LAST';

  const storeRanking = await queryTemuDatabase(
    `SELECT a.store_name,
            COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
            COUNT(DISTINCT a.report_date)::int AS report_day_count,
            COALESCE(SUM(a.ad_spend),0) AS ad_spend,
            COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
            CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
            CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos
     FROM temu_ad_product_daily a
     ${condition}
     GROUP BY a.store_name
     ORDER BY ${storeOrderMetric} ${storeOrderDirection}, a.store_name
     LIMIT $${filter.values.length + 1}`,
    [...filter.values, manualStoreNames.length ? Math.min(manualStoreNames.length, 5) : limit],
  );
  const selectedStores = storeRanking.rows.map((row) => String(row.store_name || '').trim()).filter(Boolean);
  let trendRows = [];
  if (selectedStores.length > 0) {
    const trendValues = [...filter.values, selectedStores];
    const selectedPlaceholder = `$${trendValues.length}`;
    const trend = await queryTemuDatabase(
      `SELECT a.report_date::text AS report_date,
              a.store_name,
              COALESCE(NULLIF(MAX(a.operator_name), ''), '-') AS operator_name,
              COUNT(*)::int AS ad_product_count,
              COALESCE(SUM(a.ad_spend),0) AS ad_spend,
              COALESCE(SUM(a.global_sales_amount),0) AS global_sales_amount,
              COALESCE(SUM(a.global_sub_order_count),0) AS global_sub_order_count,
              COALESCE(SUM(a.global_impressions),0) AS global_impressions,
              COALESCE(SUM(a.global_clicks),0) AS global_clicks,
              CASE WHEN COALESCE(SUM(a.ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(a.global_sales_amount),0) / NULLIF(SUM(a.ad_spend),0) END AS global_roas,
              CASE WHEN COALESCE(SUM(a.global_sales_amount),0) = 0 THEN NULL ELSE COALESCE(SUM(a.ad_spend),0) / NULLIF(SUM(a.global_sales_amount),0) END AS global_acos
       FROM temu_ad_product_daily a
       ${condition}
         AND a.store_name = ANY(${selectedPlaceholder}::text[])
       GROUP BY a.report_date, a.store_name
       ORDER BY a.report_date ASC, a.store_name`,
      trendValues,
    );
    trendRows = trend.rows.map(toCamel);
  }
  const dateRows = await queryTemuDatabase(
    `SELECT DISTINCT a.report_date::text AS report_date
     FROM temu_ad_product_daily a
     ${condition}
     ORDER BY report_date ASC`,
    filter.values,
  );
  return {
    records: trendRows,
    stores: storeRanking.rows.map(toCamel),
    selectedStores,
    conclusions: buildAdTrendConclusions({ trendRows, selectedStores, metric }),
    reportDates: dateRows.rows.map((row) => String(row.report_date || '').slice(0, 10)).filter(Boolean),
  };
}

export async function getAdSpendSummary(params = {}) {
  await runTemuMigrations();
  const spendExpression = 'COALESCE(NULLIF(a.ad_spend,0), NULLIF(a.net_ad_spend,0), 0)';
  const filter = createWhereBuilder(1);
  appendStoreScope(filter, 'a', params);
  if (params.startDate) filter.push('a.report_date >= ?::date', params.startDate);
  if (params.endDate) filter.push('a.report_date <= ?::date', params.endDate);
  const condition = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';
  const summary = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS record_count,
            COUNT(DISTINCT a.report_date)::int AS report_day_count,
            COUNT(*) FILTER (WHERE ${spendExpression} > 0)::int AS spend_record_count,
            COUNT(DISTINCT a.report_date) FILTER (WHERE ${spendExpression} > 0)::int AS spend_report_day_count,
            COALESCE(SUM(${spendExpression}),0) AS ad_spend,
            MAX(a.updated_at) AS data_updated_at
     FROM temu_ad_product_daily a
     ${condition}`,
    filter.values,
  );
  const stores = await queryTemuDatabase(
    `SELECT COALESCE(NULLIF(a.store_name, ''), s.store_name, a.store_id::text) AS store_name,
            COUNT(DISTINCT a.report_date)::int AS report_day_count,
            COUNT(*) FILTER (WHERE ${spendExpression} > 0)::int AS spend_record_count,
            COUNT(DISTINCT a.report_date) FILTER (WHERE ${spendExpression} > 0)::int AS spend_report_day_count,
            COALESCE(SUM(${spendExpression}),0) AS ad_spend
     FROM temu_ad_product_daily a
     LEFT JOIN temu_stores s ON s.id = a.store_id
     ${condition}
     GROUP BY COALESCE(NULLIF(a.store_name, ''), s.store_name, a.store_id::text)
     ORDER BY ad_spend DESC NULLS LAST, store_name`,
    filter.values,
  );
  const batchFilter = createWhereBuilder(1);
  batchFilter.push(`b.import_type = ?`, 'ad_product_daily');
  appendStoreScope(batchFilter, 'b', params);
  if (params.startDate) batchFilter.push('b.report_date >= ?::date', params.startDate);
  if (params.endDate) batchFilter.push('b.report_date <= ?::date', params.endDate);
  const batchCondition = batchFilter.where.length ? `WHERE ${batchFilter.where.join(' AND ')}` : '';
  const batches = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS import_batch_count,
            COUNT(DISTINCT b.report_date)::int AS import_batch_day_count,
            MAX(b.updated_at) AS latest_import_updated_at
     FROM temu_import_batches b
     ${batchCondition}`,
    batchFilter.values,
  );
  const dateOnlyFilter = createWhereBuilder(1);
  if (params.startDate) dateOnlyFilter.push('a.report_date >= ?::date', params.startDate);
  if (params.endDate) dateOnlyFilter.push('a.report_date <= ?::date', params.endDate);
  const dateOnlyCondition = dateOnlyFilter.where.length ? `WHERE ${dateOnlyFilter.where.join(' AND ')}` : '';
  const allRangeSummary = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS all_range_record_count,
            COUNT(DISTINCT a.report_date)::int AS all_range_report_day_count,
            COALESCE(SUM(${spendExpression}),0) AS all_range_ad_spend
     FROM temu_ad_product_daily a
     ${dateOnlyCondition}`,
    dateOnlyFilter.values,
  );
  const batchDateOnlyFilter = createWhereBuilder(1);
  batchDateOnlyFilter.push(`b.import_type = ?`, 'ad_product_daily');
  if (params.startDate) batchDateOnlyFilter.push('b.report_date >= ?::date', params.startDate);
  if (params.endDate) batchDateOnlyFilter.push('b.report_date <= ?::date', params.endDate);
  const batchDateOnlyCondition = batchDateOnlyFilter.where.length ? `WHERE ${batchDateOnlyFilter.where.join(' AND ')}` : '';
  const allRangeBatches = await queryTemuDatabase(
    `SELECT COUNT(*)::int AS all_range_import_batch_count,
            COUNT(DISTINCT b.report_date)::int AS all_range_import_batch_day_count
     FROM temu_import_batches b
     ${batchDateOnlyCondition}`,
    batchDateOnlyFilter.values,
  );
  return {
    ...toCamel(summary.rows[0] || {}),
    ...toCamel(batches.rows[0] || {}),
    ...toCamel(allRangeSummary.rows[0] || {}),
    ...toCamel(allRangeBatches.rows[0] || {}),
    stores: stores.rows.map(toCamel),
  };
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

export async function getProductDetail(productId, params = {}) {
  const scope = buildBaseDataScopeWhere(params, { store: 'p', operator: 'p' }, 2);
  const condition = ['p.id = $1', ...scope.where].join(' AND ');
  const product = await queryTemuDatabase(`SELECT * FROM temu_products p WHERE ${condition}`, [productId, ...scope.values]);
  if (!product.rows[0]) {
    return {
      product: null,
      skus: [],
      snapshots: [],
      ads: [],
      orders: [],
      recommendations: [],
      timeline: [],
    };
  }
  const skus = await queryTemuDatabase(`SELECT * FROM temu_product_skus WHERE product_id = $1 ORDER BY sku_code`, [productId]);
  const snapshots = await queryTemuDatabase(`SELECT * FROM temu_new_product_daily_snapshot WHERE product_id = $1 ORDER BY snapshot_date DESC LIMIT 30`, [productId]);
  const ads = await queryTemuDatabase(`SELECT * FROM temu_ad_product_daily WHERE product_id = $1 ORDER BY report_date DESC LIMIT 30`, [productId]);
  const orders = await queryTemuDatabase(
    `SELECT o.order_date, COUNT(DISTINCT o.order_no) AS order_count, COALESCE(SUM(o.quantity),0) AS quantity, COALESCE(SUM(o.item_amount),0) AS sales_amount
     FROM temu_order_items o
     LEFT JOIN temu_product_skus s ON o.product_sku_id = s.id OR (s.store_id = o.store_id AND (s.sku_id = o.sku_id OR s.sku_code = o.sku_code))
     WHERE o.is_valid_order = TRUE AND o.is_cancelled = FALSE AND s.product_id = $1
     GROUP BY o.order_date
     ORDER BY o.order_date DESC
     LIMIT 30`,
    [productId],
  );
  const recommendations = await queryTemuDatabase(`SELECT * FROM temu_ad_recommendations WHERE product_id = $1 ORDER BY recommendation_date DESC, created_at DESC`, [productId]);
  const timeline = await queryTemuDatabase(`SELECT * FROM temu_product_timeline WHERE product_id = $1 ORDER BY event_time DESC LIMIT 100`, [productId]);
  const adStageReviewRows = await queryTemuDatabase(
    `SELECT CASE
              WHEN days_online BETWEEN 1 AND 7 THEN '第1周 冷启动期'
              WHEN days_online BETWEEN 8 AND 14 THEN '第2周 测试期'
              WHEN days_online BETWEEN 15 AND 21 THEN '第3周 控本期'
              ELSE '第4周 利润期'
            END AS stage_name,
            MIN(snapshot_date)::text AS stage_start_date,
            MAX(snapshot_date)::text AS stage_end_date,
            MAX(target_roas) AS actual_target_roas,
            COALESCE(SUM(ad_spend),0) AS ad_spend,
            COALESCE(SUM(ad_sales_amount),0) AS ad_sales_amount,
            COALESCE(SUM(ad_order_count),0) AS ad_order_count,
            COALESCE(SUM(natural_order_count),0) AS natural_order_count,
            COALESCE(SUM(impressions),0) AS impressions,
            COALESCE(SUM(clicks),0) AS clicks,
            COALESCE(SUM(add_to_cart_count),0) AS add_to_cart_count,
            CASE WHEN COALESCE(SUM(ad_spend),0) = 0 THEN NULL ELSE COALESCE(SUM(ad_sales_amount),0) / NULLIF(SUM(ad_spend),0) END AS roas,
            MIN(days_online) AS min_days_online
     FROM temu_new_product_daily_snapshot
     WHERE product_id = $1 AND days_online BETWEEN 1 AND 30
     GROUP BY CASE
              WHEN days_online BETWEEN 1 AND 7 THEN '第1周 冷启动期'
              WHEN days_online BETWEEN 8 AND 14 THEN '第2周 测试期'
              WHEN days_online BETWEEN 15 AND 21 THEN '第3周 控本期'
              ELSE '第4周 利润期'
            END
     ORDER BY MIN(days_online) ASC`,
    [productId],
  );
  const adStageReview = adStageReviewRows.rows.map((row) => {
    const plan = adStagePlanForDays(row.min_days_online);
    const roas = row.roas === null ? null : Number(row.roas);
    return {
      ...toCamel(row),
      stageDate: `${String(row.stage_start_date || '').slice(0, 10)} ~ ${String(row.stage_end_date || '').slice(0, 10)}`,
      plannedTargetRoas: plan.targetRoas,
      systemJudgement: plan.targetRoas && roas !== null && roas >= plan.targetRoas ? '阶段达标' : '继续优化',
      operatorAction: '-',
    };
  });
  return {
    product: product.rows[0] ? toCamel(product.rows[0]) : null,
    skus: skus.rows.map(toCamel),
    snapshots: snapshots.rows.map(toCamel),
    ads: ads.rows.map(toCamel),
    orders: orders.rows.map(toCamel),
    recommendations: recommendations.rows.map(toCamel),
    timeline: timeline.rows.map(toCamel),
    adStageReview,
  };
}
