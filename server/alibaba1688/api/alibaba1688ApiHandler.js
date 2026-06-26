import { queryAlibaba1688Database } from '../postgresDatabase.js';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { alibaba1688ImageRecordRepository } from '../repositories/alibaba1688ImageRecordRepository.js';
import { alibaba1688ListingTaskRepository } from '../repositories/alibaba1688ListingTaskRepository.js';
import { alibaba1688ProductRepository } from '../repositories/alibaba1688ProductRepository.js';
import { alibaba1688SettingRepository } from '../repositories/alibaba1688SettingRepository.js';
import { alibaba1688SkuRepository } from '../repositories/alibaba1688SkuRepository.js';
import { alibaba1688StoreRepository } from '../repositories/alibaba1688StoreRepository.js';
import { alibaba1688SupplierRepository } from '../repositories/alibaba1688SupplierRepository.js';

const repositories = {
  products: alibaba1688ProductRepository,
  skus: alibaba1688SkuRepository,
  images: alibaba1688ImageRecordRepository,
  'product-images': alibaba1688ImageRecordRepository,
  suppliers: alibaba1688SupplierRepository,
  'listing-tasks': alibaba1688ListingTaskRepository,
  tasks: alibaba1688ListingTaskRepository,
  stores: alibaba1688StoreRepository,
  settings: alibaba1688SettingRepository,
};

const businessTables = [
  '1688_products',
  '1688_product_skus',
  '1688_product_images',
  '1688_suppliers',
  '1688_listing_tasks',
  '1688_stores',
  '1688_settings',
];

const imageUploadMaxBytes = 8 * 1024 * 1024;
const priceImportMaxBytes = 8 * 1024 * 1024;
const productExportImageSize = 80;
const productExportSkuImageSize = 120;
const productExportSkuImageSourceSize = 300;
const productExportImageColumnWidth = 14;
const productExportSkuImageColumnWidth = 20;
const productExportRowHeight = 70;
const productExportSkuImageRowHeight = 100;
const duplicateSkuMessage = 'SKU 编码已存在，请更换后再保存';
const allowedImageMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function parseRequestUrl(req) {
  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const parts = requestUrl.pathname.split('/').filter(Boolean);
  return {
    resource: parts[0] ?? '',
    id: parts[1] ? decodeURIComponent(parts[1]) : '',
    action: parts[2] ?? '',
    searchParams: requestUrl.searchParams,
  };
}

function searchParamsToObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

function canManageAlibaba1688Data(currentUser) {
  return ['admin', 'leader'].includes(String(currentUser?.role ?? '').toLowerCase());
}

function isAlibaba1688Admin(currentUser) {
  return String(currentUser?.role ?? '').toLowerCase() === 'admin';
}

function canWriteAlibaba1688Resource(currentUser, resource) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  const menuMap = {
    products: '1688-products',
    skus: '1688-products',
    images: '1688-images',
    'product-images': '1688-images',
    'listing-tasks': '1688-listing-tasks',
    tasks: '1688-listing-tasks',
  };
  const menuKey = menuMap[resource];
  const allowedMenus = new Set(Array.isArray(currentUser?.allowedMenuKeys) ? currentUser.allowedMenuKeys : []);
  const operations = new Set(Array.isArray(currentUser?.operationPermissionKeys) ? currentUser.operationPermissionKeys : []);
  const platforms = new Set(Array.isArray(currentUser?.platformKeys) ? currentUser.platformKeys : []);
  const roleCode = String(currentUser?.roleCode ?? '');
  const has1688Platform = currentUser?.platform === '1688' || platforms.has('1688') || roleCode.startsWith('1688_');

  return Boolean(menuKey) &&
    has1688Platform &&
    allowedMenus.has(menuKey) &&
    operations.has('create') &&
    operations.has('edit');
}

function sanitizeSupplierRecordForUser(record, currentUser) {
  if (canManageAlibaba1688Data(currentUser) || !record) {
    return record;
  }

  const next = { ...record };
  for (const key of Object.keys(next)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'costvisiblelevel' ||
      normalizedKey.includes('cost') ||
      normalizedKey.includes('purchaseprice')
    ) {
      delete next[key];
    }
  }
  return next;
}

function sanitizeSupplierPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  return {
    ...page,
    records: page.records.map((record) => sanitizeSupplierRecordForUser(record, currentUser)),
  };
}

function sanitizeSkuRecordForUser(record, currentUser) {
  if (canManageAlibaba1688Data(currentUser) || !record) {
    return record;
  }

  const next = { ...record };
  delete next.purchasePrice;
  return next;
}

function sanitizeSkuWritePayloadForUser(payload, currentUser) {
  if (canManageAlibaba1688Data(currentUser) || !payload) {
    return payload;
  }

  const next = { ...payload };
  delete next.purchasePrice;
  delete next.wholesalePrice;
  delete next.suggestedPrice;
  delete next.supplierSkuCode;
  delete next.platformSkuCode;
  delete next.remark;
  return next;
}

function normalizeSkuCodeForDuplicateCheck(value) {
  return String(value ?? '').trim();
}

async function findDuplicateSkuCode(skuCode, excludeSkuId = '') {
  const normalizedSku = normalizeSkuCodeForDuplicateCheck(skuCode);
  if (!normalizedSku) {
    return null;
  }

  const values = [normalizedSku];
  const excludeClause = excludeSkuId ? 'AND id::text <> $2' : '';
  if (excludeSkuId) {
    values.push(String(excludeSkuId));
  }

  const result = await queryAlibaba1688Database(
    `
      SELECT id::text, product_id::text, sku_code
      FROM "1688_product_skus"
      WHERE LOWER(TRIM(sku_code)) = LOWER(TRIM($1))
        AND COALESCE(TRIM(sku_code), '') <> ''
        ${excludeClause}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    values,
  );

  return result.rows[0] ?? null;
}

async function assertUniqueSkuCode(payload, options = {}) {
  const skuCode = normalizeSkuCodeForDuplicateCheck(payload?.skuCode ?? payload?.sku_code);
  if (!skuCode) {
    return;
  }

  const duplicate = await findDuplicateSkuCode(skuCode, options.skuId);
  if (!duplicate) {
    return;
  }

  console.warn(JSON.stringify({
    scope: '1688-product-sku-check',
    message: 'duplicate sku',
    sku: skuCode,
    skuId: options.skuId || '',
    productId: options.productId || payload?.productId || payload?.product_id || '',
    duplicateSkuId: duplicate.id,
    duplicateProductId: duplicate.product_id,
  }));

  const error = new Error(duplicateSkuMessage);
  error.statusCode = 409;
  error.code = 'DUPLICATE_SKU';
  throw error;
}

function sanitizeProductWritePayloadForUser(payload, currentUser) {
  const next = { ...payload };
  for (const key of ['supplierId', 'supplier_id', 'storeId', 'store_id', 'categoryId', 'category_id']) {
    if (next[key] === '') {
      next[key] = null;
    }
  }
  if (!canManageAlibaba1688Data(currentUser)) {
    delete next.supplierId;
    delete next.supplier_id;
  }
  return next;
}

function canCreateProductChildResource(currentUser, resource, body) {
  return ['skus', 'images', 'product-images'].includes(resource) &&
    Boolean(body?.productId) &&
    canWriteAlibaba1688Resource(currentUser, 'products');
}

function sanitizeSkuPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  return {
    ...page,
    records: page.records.map((record) => sanitizeSkuRecordForUser(record, currentUser)),
  };
}

function sanitizeProductRecordForUser(record, currentUser) {
  if (canManageAlibaba1688Data(currentUser) || !record) {
    return record;
  }

  const next = { ...record };
  delete next.supplierId;
  delete next.minPurchasePrice;
  delete next.maxPurchasePrice;
  delete next.missingCostCount;
  return next;
}

function sanitizeProductPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  return {
    ...page,
    records: page.records.map((record) => sanitizeProductRecordForUser(record, currentUser)),
  };
}

function requireAlibaba1688Manager(res, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  const message = '褰撳墠璐﹀彿鍙兘鏌ョ湅 1688 璁剧疆锛屾棤鏉冩柊澧炪€佺紪杈戞垨鍒犻櫎';
  sendJson(res, 403, { ok: false, success: false, message, error: message });
  return false;
}

function requireAlibaba1688ResourceWriter(res, currentUser, resource) {
  if (canWriteAlibaba1688Resource(currentUser, resource)) {
    return true;
  }

  return requireAlibaba1688Manager(res, currentUser);
}

function createForbiddenError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function createUploadStorageError(message, cause) {
  const error = new Error(message);
  error.statusCode = 500;
  error.cause = cause;
  return error;
}

function logAlibaba1688Upload(level, message, details = {}) {
  const payload = {
    scope: 'alibaba-1688-upload',
    message,
    ...details,
  };
  const logger = level === 'error' ? console.error : console.info;
  logger(JSON.stringify(payload));
}

function logAlibaba1688ProductUpdate(level, message, details = {}) {
  const payload = {
    scope: 'product-update',
    message,
    ...details,
  };
  const logger = level === 'error' ? console.error : console.info;
  logger(JSON.stringify(payload));
}

async function directoryExists(directoryPath) {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function buildUploadFileName(originalName, contentType) {
  const fallbackExtension = allowedImageMimeTypes.get(contentType) || 'png';
  const parsed = path.parse(String(originalName ?? 'product-image').replace(/[\\/]/g, ''));
  const sourceName = parsed.name || 'product-image';
  const safeStem = sourceName
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'product-image';
  const originalExtension = parsed.ext.replace(/^\./, '').toLowerCase();
  const extension = Array.from(allowedImageMimeTypes.values()).includes(originalExtension)
    ? originalExtension
    : fallbackExtension;
  const uniquePart = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeStem}-${uniquePart}.${extension}`;
}

async function saveAlibaba1688ProductImageUpload(body) {
  const dataUrl = String(body?.dataUrl ?? '');
  logAlibaba1688Upload('info', 'upload endpoint called', {
    cwd: process.cwd(),
    mode: 'json-data-url',
    expectedField: 'dataUrl',
    hasDataUrl: Boolean(dataUrl),
    hasReqFile: false,
    bodyFileName: body?.fileName || '',
    bodyContentType: body?.contentType || '',
    bodySize: body?.size || 0,
  });

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/i);
  if (!match) {
    logAlibaba1688Upload('error', 'invalid upload payload', {
      bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
      dataUrlPrefix: dataUrl.slice(0, 32),
    });
    throw createBadRequestError('请上传 JPG、PNG、WEBP 或 GIF 图片');
  }

  const contentType = match[1].toLowerCase();
  if (!allowedImageMimeTypes.has(contentType)) {
    logAlibaba1688Upload('error', 'unsupported mime type', { contentType });
    throw createBadRequestError('图片格式不支持，请上传 JPG、PNG、WEBP 或 GIF');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw createBadRequestError('图片文件为空');
  }
  if (buffer.length > imageUploadMaxBytes) {
    throw createBadRequestError('图片不能超过 8MB');
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fileName = buildUploadFileName(body?.fileName, contentType);
  const uploadRelativeDir = path.join('alibaba-1688', year, month);
  const uploadRoot = path.resolve(process.env.UPLOADS_1688_DIR || path.join(process.cwd(), 'public', 'uploads', 'alibaba-1688'));
  const uploadDir = path.join(uploadRoot, year, month);
  const filePath = path.join(uploadDir, fileName);
  const safeRoot = path.resolve(uploadRoot);
  const safeFilePath = path.resolve(filePath);
  const uploadDirExistsBefore = await directoryExists(uploadDir);

  logAlibaba1688Upload('info', 'resolved upload target', {
    cwd: process.cwd(),
    uploadRoot,
    uploadDir,
    uploadDirExistsBefore,
    fileName,
    contentType,
    decodedSize: buffer.length,
  });

  if (!safeFilePath.startsWith(`${safeRoot}${path.sep}`)) {
    logAlibaba1688Upload('error', 'unsafe upload path rejected', {
      safeRoot,
      safeFilePath,
    });
    throw createBadRequestError('图片文件名不合法');
  }

  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, buffer);
  } catch (error) {
    logAlibaba1688Upload('error', 'failed to write upload file', {
      cwd: process.cwd(),
      uploadRoot,
      uploadDir,
      uploadDirExistsAfterMkdir: await directoryExists(uploadDir),
      fileName,
      contentType,
      decodedSize: buffer.length,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      throw createUploadStorageError('服务器上传目录不可写，请检查 uploads 目录权限', error);
    }
    throw createUploadStorageError('服务器保存图片失败，请检查上传目录配置', error);
  }

  logAlibaba1688Upload('info', 'upload file saved', {
    uploadDir,
    fileName,
    fileUrl: `/uploads/${uploadRelativeDir.replace(/\\/g, '/')}/${fileName}`,
    decodedSize: buffer.length,
  });

  return {
    fileName,
    filePath,
    fileUrl: `/uploads/${uploadRelativeDir.replace(/\\/g, '/')}/${fileName}`,
    contentType,
    size: buffer.length,
  };
}

function getUserStoreScopeValues(currentUser) {
  return new Set([
    currentUser?.userId,
    currentUser?.username,
    currentUser?.operatorId,
    currentUser?.displayName,
    ...(Array.isArray(currentUser?.allowedStoreIds) ? currentUser.allowedStoreIds : []),
  ].map((item) => String(item ?? '').trim()).filter(Boolean));
}

function filterStorePageForUser(page, currentUser) {
  if (['admin', 'leader'].includes(String(currentUser?.role ?? '').toLowerCase())) {
    return page;
  }

  const scopeValues = getUserStoreScopeValues(currentUser);
  const records = page.records.filter((store) => (
    scopeValues.has(String(store.id ?? '')) ||
    scopeValues.has(String(store.storeName ?? '')) ||
    scopeValues.has(String(store.ownerUserId ?? ''))
  ));

  return {
    ...page,
    records,
    total: records.length,
  };
}

function canReadStoreRecord(store, currentUser) {
  return filterStorePageForUser({ records: [store], total: 1 }, currentUser).records.length > 0;
}

function canReadProductRecord(product, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  const scopeValues = getUserStoreScopeValues(currentUser);
  return (
    scopeValues.has(String(product.storeId ?? '')) ||
    scopeValues.has(String(product.createdBy ?? ''))
  );
}

function filterProductPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  const records = page.records.filter((product) => canReadProductRecord(product, currentUser));
  return {
    ...page,
    records,
  };
}

function buildProductWhere(params = {}, currentUser) {
  const clauses = [];
  const values = [];

  function addParam(value) {
    values.push(value);
    return `$${values.length}`;
  }

  if (params.keyword) {
    const keyword = `%${String(params.keyword).trim()}%`;
    const placeholder = addParam(keyword);
    clauses.push(`(
      p.product_code ILIKE ${placeholder} OR
      p.product_name ILIKE ${placeholder} OR
      p.listing_title ILIKE ${placeholder} OR
      p.keywords ILIKE ${placeholder}
    )`);
  }

  if (params.status) {
    clauses.push(`p.status = ${addParam(params.status)}`);
  }

  if (params.categoryId) {
    clauses.push(`p.category_id = ${addParam(params.categoryId)}`);
  }

  if (params.supplierId) {
    if (String(params.supplierId) === '__unbound__') {
      clauses.push('p.supplier_id IS NULL');
    } else {
      clauses.push(`p.supplier_id::text = ${addParam(params.supplierId)}`);
    }
  }

  if (params.createdBy) {
    clauses.push(`p.created_by = ${addParam(params.createdBy)}`);
  }

  if (Array.isArray(params.selectedIds) && params.selectedIds.length > 0) {
    clauses.push(`p.id::text = ANY(${addParam(params.selectedIds.map((id) => String(id)))}::text[])`);
  }

  if (params.storeId) {
    clauses.push(`p.store_id::text = ${addParam(params.storeId)}`);
  }

  if (!canManageAlibaba1688Data(currentUser)) {
    const scopeValues = Array.from(getUserStoreScopeValues(currentUser));
    if (scopeValues.length === 0) {
      clauses.push('FALSE');
    } else {
      const placeholder = addParam(scopeValues);
      clauses.push(`(p.store_id::text = ANY(${placeholder}::text[]) OR p.created_by = ANY(${placeholder}::text[]))`);
    }
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function normalizeProductPage(value) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeProductPageSize(value) {
  const pageSize = Number(value);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return 20;
  }
  return Math.min(Math.floor(pageSize), 100);
}

function camelizeDatabaseRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

async function listProductPage(params = {}, currentUser) {
  const page = normalizeProductPage(params.page);
  const pageSize = normalizeProductPageSize(params.pageSize);
  const offset = (page - 1) * pageSize;
  const where = buildProductWhere(params, currentUser);
  const totalResult = await queryAlibaba1688Database(
    `SELECT COUNT(*)::int AS total
     FROM "1688_products" p
     ${where.sql}`,
    where.values,
  );
  const dataValues = [...where.values, pageSize, offset];
  const recordsResult = await queryAlibaba1688Database(
    `SELECT p.*
     FROM "1688_products" p
     ${where.sql}
     ORDER BY p.created_at DESC
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues,
  );

  return {
    records: recordsResult.rows.map(camelizeDatabaseRow),
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

function formatDateForFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function formatExcelDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (next) => String(next).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function productStatusLabel(status) {
  const labels = {
    missing_cost: '待补充成本',
    pending_price: '待定销售价',
    priced: '已定价',
    ready: '可上架',
    discarded: '已淘汰',
    draft: '待补充成本',
    disabled: '已淘汰',
    manual_listing: '人工上架中',
    listed: '已上架',
    failed: '上架失败',
  };
  return labels[status] || status || '-';
}

function normalizeExportValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function formatMoneyRangeValue(min, max) {
  const minValue = Number(min);
  const maxValue = Number(max);
  const hasMin = Number.isFinite(minValue) && minValue > 0;
  const hasMax = Number.isFinite(maxValue) && maxValue > 0;
  if (!hasMin && !hasMax) return '-';
  if (hasMin && hasMax && minValue !== maxValue) return `${minValue.toFixed(2)} - ${maxValue.toFixed(2)}`;
  return hasMin ? minValue : maxValue;
}

function calculateExportMargin(purchase, sale) {
  const purchaseValue = Number(purchase);
  const saleValue = Number(sale);
  if (!Number.isFinite(purchaseValue) || !Number.isFinite(saleValue) || purchaseValue <= 0 || saleValue <= 0) {
    return '-';
  }
  return `${Math.round(((saleValue - purchaseValue) / saleValue) * 100)}%`;
}

function buildSkuSummary(row) {
  if (row.sku_id) {
    const summary = [row.sku_color, row.sku_code].map((item) => String(item ?? '').trim()).filter(Boolean).join(' / ');
    return summary || '-';
  }
  const colors = String(row.sku_colors ?? '').split('、').map((item) => item.trim()).filter(Boolean);
  const skuCount = Number(row.sku_count ?? 0);
  if (colors.length > 0) {
    const preview = colors.slice(0, 5).join('、');
    return `${preview}${colors.length > 5 ? '等' : ''}，共 ${skuCount || colors.length} 个 SKU`;
  }
  return skuCount > 0 ? `共 ${skuCount} 个 SKU` : '-';
}

function getExportSalePrice(row) {
  return row.sku_id
    ? formatMoneyRangeValue(row.sku_wholesale_price, row.sku_wholesale_price)
    : formatMoneyRangeValue(row.min_wholesale_price, row.max_wholesale_price);
}

function getExportPurchasePrice(row) {
  return row.sku_id
    ? formatMoneyRangeValue(row.sku_purchase_price, row.sku_purchase_price)
    : formatMoneyRangeValue(row.min_purchase_price, row.max_purchase_price);
}

function getExportMargin(row) {
  return row.sku_id
    ? calculateExportMargin(row.sku_purchase_price, row.sku_wholesale_price)
    : calculateExportMargin(row.min_purchase_price, row.min_wholesale_price);
}

function recordProductExportSpan(spans, productId, rowNumber) {
  const key = String(productId || '');
  if (!key) return;
  const span = spans.get(key);
  if (span) {
    span.end = rowNumber;
    return;
  }
  spans.set(key, { start: rowNumber, end: rowNumber });
}

function mergeProductExportColumn(worksheet, spans, columnIndex, alignment = { vertical: 'middle', horizontal: 'center' }) {
  if (columnIndex < 0) return;
  for (const span of spans.values()) {
    if (span.end <= span.start) continue;
    worksheet.mergeCells(span.start, columnIndex + 1, span.end, columnIndex + 1);
    worksheet.getCell(span.start, columnIndex + 1).alignment = alignment;
  }
}

function getProductExportColumnDefinitions(canExportSensitive) {
  return [
    { header: '主图', key: 'image', width: productExportImageColumnWidth },
    { header: '产品名称', key: 'productName', width: 28 },
    { header: '产品编码 / 主 SKU', key: 'productCode', width: 24 },
    { header: 'SKU数量', key: 'skuCount', width: 10 },
    { header: '颜色/SKU摘要', key: 'skuSummary', width: 28 },
    { header: 'SKU图', key: 'skuImage', width: productExportSkuImageColumnWidth },
    { header: '销售价', key: 'salePrice', width: 14 },
    ...(canExportSensitive ? [
      { header: '进货价', key: 'purchasePrice', width: 14 },
      { header: '毛利率', key: 'margin', width: 10 },
      { header: '供应商', key: 'supplierName', width: 22 },
    ] : []),
    { header: '状态', key: 'status', width: 14 },
    { header: '创建人', key: 'createdBy', width: 16 },
    { header: '最近更新时间', key: 'updatedAt', width: 18 },
    { header: '主图地址', key: 'imageUrl', width: 42 },
    { header: '备注', key: 'remark', width: 28 },
  ];
}

function normalizeImageCandidates(row) {
  return [
    row.main_image_file_path,
    row.main_image_file_url,
    row.main_image_url,
    row.fallback_image_file_path,
    row.fallback_image_file_url,
    row.image_url,
    row.image,
    row.main_image,
    row.image_path,
    row.product_image,
    row.local_path,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
}

function normalizeSkuImageCandidates(row) {
  return [
    row.sku_image_file_path,
    row.sku_image_file_url,
    row.sku_image_url,
    row.sku_image,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
}

function isProductMainImageCandidate(image) {
  return image?.imageType === 'main_image' || (Boolean(image?.isMain) && image?.imageType !== 'sku_image');
}

function pickProductMainImageUrl(images = []) {
  return [...images]
    .filter(isProductMainImageCandidate)
    .sort((left, right) => {
      const leftRank = left.imageType === 'main_image' && left.isMain ? 0 : left.imageType === 'main_image' ? 1 : 2;
      const rightRank = right.imageType === 'main_image' && right.isMain ? 0 : right.imageType === 'main_image' ? 1 : 2;
      return leftRank - rightRank ||
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) ||
        String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''));
    })
    .map((image) => image.fileUrl || image.filePath || '')
    .find(Boolean) || '';
}

function resolveLocalImagePathCandidates(source) {
  const value = String(source ?? '').trim();
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return [];
  }

  const normalized = value.replace(/\\/g, '/');
  const withoutQuery = normalized.split('?')[0];
  const genericUploadRoot = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'public', 'uploads'));
  const alibabaUploadRoot = path.resolve(process.env.UPLOADS_1688_DIR || path.join(genericUploadRoot, 'alibaba-1688'));
  const legacyAlibabaUploadRoot = path.resolve(path.join(process.cwd(), 'public', 'uploads', 'alibaba-1688'));
  const legacyGenericUploadRoot = path.resolve(path.join(process.cwd(), 'public', 'uploads'));
  const candidates = [];

  if (path.isAbsolute(value)) {
    candidates.push(path.resolve(value));
  }
  if (withoutQuery.startsWith('/uploads/alibaba-1688/')) {
    const relativeUploadPath = withoutQuery.replace(/^\/uploads\/alibaba-1688\//, '');
    candidates.push(path.join(alibabaUploadRoot, relativeUploadPath));
    candidates.push(path.join(genericUploadRoot, 'alibaba-1688', relativeUploadPath));
    candidates.push(path.join(legacyAlibabaUploadRoot, relativeUploadPath));
  }
  if (withoutQuery.startsWith('/uploads/')) {
    const relativeUploadPath = withoutQuery.replace(/^\/uploads\//, '');
    candidates.push(path.join(genericUploadRoot, relativeUploadPath));
    candidates.push(path.join(legacyGenericUploadRoot, relativeUploadPath));
  }
  if (!withoutQuery.startsWith('/')) {
    candidates.push(path.resolve(process.cwd(), withoutQuery));
    candidates.push(path.join(alibabaUploadRoot, withoutQuery));
    candidates.push(path.join(genericUploadRoot, withoutQuery));
    candidates.push(path.join(legacyAlibabaUploadRoot, withoutQuery));
  }

  return Array.from(new Set(candidates.map((candidate) => path.resolve(candidate))));
}

async function readImageBuffer(source) {
  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  for (const localPath of resolveLocalImagePathCandidates(source)) {
    try {
      return await fs.readFile(localPath);
    } catch {
      continue;
    }
  }
  return null;
}

async function buildProductImageThumbnail(row) {
  const candidates = normalizeImageCandidates(row);
  for (const source of candidates) {
    const imageBuffer = await readImageBuffer(source);
    if (!imageBuffer) continue;
    try {
      return await sharp(imageBuffer)
        .rotate()
        .resize(productExportImageSize, productExportImageSize, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
    } catch {
      continue;
    }
  }
  return null;
}

async function buildSkuImageThumbnail(row) {
  const candidates = normalizeSkuImageCandidates(row);
  for (const source of candidates) {
    const imageBuffer = await readImageBuffer(source);
    if (!imageBuffer) continue;
    try {
      return await sharp(imageBuffer)
        .rotate()
        .resize(productExportSkuImageSourceSize, productExportSkuImageSourceSize, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
    } catch {
      continue;
    }
  }
  return null;
}

async function loadProductsForExport(params, currentUser, options = {}) {
  const where = buildProductWhere(params, currentUser);
  const includeSkuRows = Boolean(options.includeSkuRows);
  const skuExportSelect = includeSkuRows
    ? `,
       sku_export.sku_id::text AS sku_id,
       sku_export.sku_code,
       sku_export.sku_color,
       sku_export.sku_purchase_price,
       sku_export.sku_wholesale_price,
       sku_export.sku_image_file_url,
       sku_export.sku_image_file_path`
    : '';
  const skuExportJoin = includeSkuRows
    ? `LEFT JOIN LATERAL (
       SELECT
         skus.id AS sku_id,
         skus.sku_code,
         skus.color AS sku_color,
         skus.purchase_price AS sku_purchase_price,
         skus.wholesale_price AS sku_wholesale_price,
         sku_image.file_url AS sku_image_file_url,
         sku_image.file_path AS sku_image_file_path,
         skus.created_at AS sku_created_at
       FROM "1688_product_skus" skus
       LEFT JOIN LATERAL (
         SELECT file_url, file_path
         FROM "1688_product_images"
         WHERE id = skus.sku_image_id
            OR (sku_id = skus.id AND image_type = 'sku_image')
         ORDER BY
           CASE WHEN id = skus.sku_image_id THEN 0 ELSE 1 END,
           updated_at DESC,
           created_at DESC
         LIMIT 1
       ) sku_image ON TRUE
       WHERE skus.product_id = p.id
         AND skus.is_active
       ORDER BY skus.created_at
     ) sku_export ON TRUE`
    : '';
  const orderBy = includeSkuRows
    ? 'ORDER BY p.updated_at DESC, p.created_at DESC, sku_export.sku_created_at NULLS LAST'
    : 'ORDER BY p.updated_at DESC, p.created_at DESC';
  const result = await queryAlibaba1688Database(
    `SELECT
       p.id::text,
       p.product_code,
       p.product_name,
       p.category_id,
       p.status,
       p.supplier_id::text,
       p.created_by,
       p.remark,
       p.updated_at,
       category.setting_value AS category_name,
       supplier.supplier_name,
       sku_summary.sku_count,
       sku_summary.first_sku_code,
       sku_summary.sku_colors,
       sku_summary.min_purchase_price,
       sku_summary.max_purchase_price,
       sku_summary.min_wholesale_price,
       sku_summary.max_wholesale_price,
       image_summary.main_image_file_url,
       image_summary.main_image_file_path,
       image_summary.fallback_image_file_url,
       image_summary.fallback_image_file_path
       ${skuExportSelect},
       GREATEST(
         p.updated_at,
         COALESCE(sku_summary.latest_sku_updated_at, p.updated_at),
         COALESCE(image_summary.latest_image_updated_at, p.updated_at)
       ) AS latest_updated_at
     FROM "1688_products" p
     LEFT JOIN "1688_settings" category
       ON category.setting_group = 'product_category'
      AND category.setting_key = p.category_id
     LEFT JOIN "1688_suppliers" supplier ON supplier.id = p.supplier_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE skus.is_active)::int AS sku_count,
         (ARRAY_AGG(skus.sku_code ORDER BY skus.created_at) FILTER (WHERE skus.is_active AND COALESCE(skus.sku_code, '') <> ''))[1] AS first_sku_code,
         STRING_AGG(DISTINCT NULLIF(skus.color, ''), '、') FILTER (WHERE skus.is_active) AS sku_colors,
         MIN(skus.purchase_price) FILTER (WHERE skus.is_active AND skus.purchase_price > 0) AS min_purchase_price,
         MAX(skus.purchase_price) FILTER (WHERE skus.is_active AND skus.purchase_price > 0) AS max_purchase_price,
         MIN(skus.wholesale_price) FILTER (WHERE skus.is_active AND skus.wholesale_price > 0) AS min_wholesale_price,
         MAX(skus.wholesale_price) FILTER (WHERE skus.is_active AND skus.wholesale_price > 0) AS max_wholesale_price,
         MAX(skus.updated_at) AS latest_sku_updated_at
       FROM "1688_product_skus" skus
       WHERE skus.product_id = p.id
     ) sku_summary ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         (ARRAY_AGG(file_url ORDER BY CASE WHEN image_type = 'main_image' AND is_main THEN 0 WHEN image_type = 'main_image' THEN 1 ELSE 2 END, sort_order, updated_at DESC, created_at DESC)
           FILTER (WHERE COALESCE(NULLIF(file_url, ''), NULLIF(file_path, '')) IS NOT NULL))[1] AS main_image_file_url,
         (ARRAY_AGG(file_path ORDER BY CASE WHEN image_type = 'main_image' AND is_main THEN 0 WHEN image_type = 'main_image' THEN 1 ELSE 2 END, sort_order, updated_at DESC, created_at DESC)
           FILTER (WHERE COALESCE(NULLIF(file_url, ''), NULLIF(file_path, '')) IS NOT NULL))[1] AS main_image_file_path,
         (ARRAY_AGG(file_url ORDER BY CASE WHEN COALESCE(image_type, '') = 'main_image' THEN 0 WHEN is_main THEN 1 ELSE 2 END, sort_order, updated_at DESC, created_at DESC)
           FILTER (WHERE COALESCE(image_type, '') <> 'sku_image' AND COALESCE(NULLIF(file_url, ''), NULLIF(file_path, '')) IS NOT NULL))[1] AS fallback_image_file_url,
         (ARRAY_AGG(file_path ORDER BY CASE WHEN COALESCE(image_type, '') = 'main_image' THEN 0 WHEN is_main THEN 1 ELSE 2 END, sort_order, updated_at DESC, created_at DESC)
           FILTER (WHERE COALESCE(image_type, '') <> 'sku_image' AND COALESCE(NULLIF(file_url, ''), NULLIF(file_path, '')) IS NOT NULL))[1] AS fallback_image_file_path,
         MAX(updated_at) AS latest_image_updated_at
       FROM "1688_product_images"
       WHERE product_id = p.id
     ) image_summary ON TRUE
     ${skuExportJoin}
     ${where.sql}
     ${orderBy}`,
    where.values,
  );
  return result.rows;
}

async function exportProductsToExcel(body, currentUser) {
  if (!isAlibaba1688Admin(currentUser)) {
    throw createForbiddenError('只有管理员可以导出 1688 产品信息');
  }

  const selectedIds = Array.isArray(body?.selectedIds)
    ? body.selectedIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const isSelectionExport = selectedIds.length > 0;
  const params = {
    keyword: isSelectionExport ? '' : String(body?.keyword ?? '').trim(),
    status: isSelectionExport ? '' : String(body?.status ?? '').trim(),
    categoryId: isSelectionExport ? '' : String(body?.categoryId ?? '').trim(),
    supplierId: !isSelectionExport && canManageAlibaba1688Data(currentUser) ? String(body?.supplierId ?? '').trim() : '',
    createdBy: !isSelectionExport && canManageAlibaba1688Data(currentUser) ? String(body?.createdBy ?? '').trim() : '',
    selectedIds,
  };
  const canExportSensitive = canManageAlibaba1688Data(currentUser);
  const availableColumns = getProductExportColumnDefinitions(canExportSensitive);
  const requestedFields = Array.isArray(body?.fields)
    ? body.fields.map((field) => String(field ?? '').trim()).filter(Boolean)
    : [];
  const requestedFieldSet = new Set(requestedFields);
  const columns = requestedFields.length > 0
    ? availableColumns.filter((column) => requestedFieldSet.has(column.key))
    : availableColumns;
  if (columns.length === 0) {
    throw createBadRequestError('请选择至少一个可导出的字段');
  }
  const selectedFieldSet = new Set(columns.map((column) => column.key));
  const includeSkuRows = selectedFieldSet.has('skuImage');
  const rows = await loadProductsForExport(params, currentUser, { includeSkuRows });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TEMU运营数据大屏';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('1688产品库', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns;
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  const imageColumnIndex = columns.findIndex((column) => column.key === 'image');
  const skuImageColumnIndex = columns.findIndex((column) => column.key === 'skuImage');
  const supplierColumnIndex = columns.findIndex((column) => column.key === 'supplierName');
  const mergedProductSpans = new Map();
  const productIdsWithMainImage = new Set();

  for (const row of rows) {
    const imageUrl = row.main_image_file_url || row.main_image_file_path || row.fallback_image_file_url || row.fallback_image_file_path || '';
    const skuImageUrl = row.sku_image_file_url || row.sku_image_file_path || '';
    const productCode = [row.product_code, includeSkuRows ? row.sku_code : row.first_sku_code].filter(Boolean).join(' / ');
    const isFirstProductRow = !includeSkuRows || !productIdsWithMainImage.has(row.id);
    const values = {
      image: isFirstProductRow ? '图片缺失' : '',
      productName: normalizeExportValue(row.product_name),
      productCode: normalizeExportValue(productCode),
      skuCount: Number(row.sku_count ?? 0),
      skuSummary: buildSkuSummary(row),
      skuImage: '图片缺失',
      salePrice: getExportSalePrice(row),
      status: productStatusLabel(row.status),
      createdBy: normalizeExportValue(row.created_by),
      updatedAt: formatExcelDateTime(row.latest_updated_at || row.updated_at),
      imageUrl: normalizeExportValue(imageUrl),
      remark: normalizeExportValue(row.remark),
    };
    if (canExportSensitive) {
      values.purchasePrice = getExportPurchasePrice(row);
      values.margin = getExportMargin(row);
      values.supplierName = isFirstProductRow ? normalizeExportValue(row.supplier_name) : '';
    }

    const excelRow = worksheet.addRow(values);
    if (includeSkuRows) {
      recordProductExportSpan(mergedProductSpans, row.id, excelRow.number);
    }
    excelRow.height = selectedFieldSet.has('skuImage')
      ? productExportSkuImageRowHeight
      : selectedFieldSet.has('image')
        ? productExportRowHeight
        : undefined;
    excelRow.alignment = { vertical: 'middle', wrapText: true };
    if (selectedFieldSet.has('image')) {
      excelRow.getCell('image').alignment = { vertical: 'middle', horizontal: 'center' };
    }
    if (selectedFieldSet.has('skuImage')) {
      excelRow.getCell('skuImage').alignment = { vertical: 'middle', horizontal: 'center' };
    }
    if (selectedFieldSet.has('salePrice')) {
      excelRow.getCell('salePrice').numFmt = '#,##0.00';
    }
    if (canExportSensitive && selectedFieldSet.has('purchasePrice')) {
      excelRow.getCell('purchasePrice').numFmt = '#,##0.00';
    }

    const thumbnail = selectedFieldSet.has('image') && isFirstProductRow ? await buildProductImageThumbnail(row) : null;
    if (thumbnail && imageColumnIndex >= 0) {
      excelRow.getCell('image').value = '';
      const imageId = workbook.addImage({ buffer: thumbnail, extension: 'jpeg' });
      const rowIndex = excelRow.number;
      worksheet.addImage(imageId, {
        tl: { col: imageColumnIndex + 0.18, row: rowIndex - 0.88 },
        ext: { width: productExportImageSize, height: productExportImageSize },
        editAs: 'oneCell',
      });
    }
    if (includeSkuRows) {
      productIdsWithMainImage.add(row.id);
    }

    const skuThumbnail = selectedFieldSet.has('skuImage') ? await buildSkuImageThumbnail(row) : null;
    if (skuThumbnail && skuImageColumnIndex >= 0) {
      excelRow.getCell('skuImage').value = '';
      const imageId = workbook.addImage({ buffer: skuThumbnail, extension: 'jpeg' });
      const rowIndex = excelRow.number;
      worksheet.addImage(imageId, {
        tl: { col: skuImageColumnIndex + 0.18, row: rowIndex - 0.88 },
        ext: { width: productExportSkuImageSize, height: productExportSkuImageSize },
        editAs: 'oneCell',
      });
    }
  }

  if (includeSkuRows) {
    mergeProductExportColumn(worksheet, mergedProductSpans, imageColumnIndex);
    mergeProductExportColumn(worksheet, mergedProductSpans, supplierColumnIndex, { vertical: 'middle', horizontal: 'left', wrapText: true });
  }

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  return {
    fileName: `1688产品库_${formatDateForFileName()}.xlsx`,
    buffer: await workbook.xlsx.writeBuffer(),
  };
}

function normalizeImportHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[／]/g, '/');
}

function findImportColumn(headerMap, candidates) {
  for (const candidate of candidates) {
    const column = headerMap.get(normalizeImportHeader(candidate));
    if (column) return column;
  }
  return 0;
}

function normalizeImportedSkuCode(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  const slashParts = text.split('/').map((part) => part.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    return slashParts[slashParts.length - 1];
  }
  return text;
}

function normalizeImportedMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replace(/[,，￥¥\s]/g, '').trim();
  if (!text || text === '-') return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : null;
}

function dataUrlToBuffer(dataUrl, options = {}) {
  const value = String(dataUrl ?? '');
  const match = value.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw createBadRequestError('导入文件格式错误，请重新选择 Excel 文件');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (options.maxBytes && buffer.length > options.maxBytes) {
    throw createBadRequestError('导入文件过大，请控制在 8MB 以内');
  }
  return buffer;
}

async function importProductPricesFromExcel(body, currentUser) {
  if (!isAlibaba1688Admin(currentUser)) {
    throw createForbiddenError('只有管理员可以导入 1688 产品信息');
  }

  const fileName = String(body?.fileName ?? '').trim();
  if (!/\.(xlsx|xls)$/i.test(fileName)) {
    throw createBadRequestError('请上传 .xlsx 或 .xls 格式的 Excel 文件');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(dataUrlToBuffer(body?.dataUrl, { maxBytes: priceImportMaxBytes }));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw createBadRequestError('Excel 文件中没有可读取的工作表');
  }

  const headerMap = new Map();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = normalizeImportHeader(cell.text || cell.value);
    if (header) headerMap.set(header, columnNumber);
  });

  const skuColumn = findImportColumn(headerMap, ['SKU 编号', 'SKU编码', 'SKU', '产品编码 / 主 SKU', '产品编码/主SKU']);
  const productSkuColumn = findImportColumn(headerMap, ['产品编码 / 主 SKU', '产品编码/主SKU']);
  const purchaseColumn = findImportColumn(headerMap, ['进货价', '采购价', '成本价']);
  const wholesaleColumn = findImportColumn(headerMap, ['销售价', '批发价']);
  if (!skuColumn && !productSkuColumn) {
    throw createBadRequestError('Excel 缺少 SKU 编号或产品编码 / 主 SKU 列');
  }
  if (!purchaseColumn && !wholesaleColumn) {
    throw createBadRequestError('Excel 缺少进货价或销售价列');
  }

  const rows = [];
  const skuCounts = new Map();
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const skuCode = normalizeImportedSkuCode(row.getCell(skuColumn || productSkuColumn).text || row.getCell(skuColumn || productSkuColumn).value);
    const purchasePrice = purchaseColumn ? normalizeImportedMoney(row.getCell(purchaseColumn).value ?? row.getCell(purchaseColumn).text) : null;
    const wholesalePrice = wholesaleColumn ? normalizeImportedMoney(row.getCell(wholesaleColumn).value ?? row.getCell(wholesaleColumn).text) : null;
    if (!skuCode && purchasePrice === null && wholesalePrice === null) return;
    rows.push({ rowNumber, skuCode, purchasePrice, wholesalePrice });
    if (skuCode) {
      const key = skuCode.toLowerCase();
      skuCounts.set(key, (skuCounts.get(key) ?? 0) + 1);
    }
  });

  const recognizedRows = rows.length;
  const details = [];
  const validSkuCodes = Array.from(new Set(rows.map((row) => row.skuCode.trim().toLowerCase()).filter(Boolean)));
  const skuResult = validSkuCodes.length > 0
    ? await queryAlibaba1688Database(
        `SELECT id::text, sku_code, purchase_price, wholesale_price
         FROM "1688_product_skus"
         WHERE LOWER(TRIM(sku_code)) = ANY($1::text[])`,
        [validSkuCodes],
      )
    : { rows: [] };
  const skuRowsByCode = new Map();
  for (const sku of skuResult.rows) {
    const key = String(sku.sku_code ?? '').trim().toLowerCase();
    if (!key) continue;
    const current = skuRowsByCode.get(key) ?? [];
    current.push(sku);
    skuRowsByCode.set(key, current);
  }

  let updatedRows = 0;
  for (const row of rows) {
    if (!row.skuCode) {
      details.push({ rowNumber: row.rowNumber, skuCode: '', status: 'failed', reason: 'SKU 编号为空' });
      continue;
    }
    const skuKey = row.skuCode.toLowerCase();
    if ((skuCounts.get(skuKey) ?? 0) > 1) {
      details.push({ rowNumber: row.rowNumber, skuCode: row.skuCode, status: 'skipped', reason: 'Excel 中 SKU 编号重复' });
      continue;
    }
    if (row.purchasePrice === null && row.wholesalePrice === null) {
      details.push({ rowNumber: row.rowNumber, skuCode: row.skuCode, status: 'skipped', reason: '进货价和销售价均为空或非法' });
      continue;
    }

    const matchedSkus = skuRowsByCode.get(skuKey) ?? [];
    if (matchedSkus.length === 0) {
      details.push({ rowNumber: row.rowNumber, skuCode: row.skuCode, status: 'skipped', reason: '系统中未找到该 SKU' });
      continue;
    }
    if (matchedSkus.length > 1) {
      details.push({ rowNumber: row.rowNumber, skuCode: row.skuCode, status: 'skipped', reason: '系统中该 SKU 不唯一' });
      continue;
    }

    const sku = matchedSkus[0];
    const currentPurchase = Number(sku.purchase_price ?? 0);
    const currentWholesale = Number(sku.wholesale_price ?? 0);
    const fields = [];
    const values = [];
    if (row.purchasePrice !== null && (!Number.isFinite(currentPurchase) || currentPurchase <= 0)) {
      values.push(row.purchasePrice);
      fields.push(`purchase_price = $${values.length}`);
    }
    if (row.wholesalePrice !== null && (!Number.isFinite(currentWholesale) || currentWholesale <= 0)) {
      values.push(row.wholesalePrice);
      fields.push(`wholesale_price = $${values.length}`);
    }

    if (fields.length === 0) {
      details.push({ rowNumber: row.rowNumber, skuCode: row.skuCode, status: 'skipped', reason: '系统已有进货价/销售价，未覆盖' });
      continue;
    }

    values.push(sku.id);
    await queryAlibaba1688Database(
      `UPDATE "1688_product_skus"
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values,
    );
    updatedRows += 1;
    details.push({
      rowNumber: row.rowNumber,
      skuCode: row.skuCode,
      status: 'updated',
      reason: fields.map((field) => field.startsWith('purchase_price') ? '进货价' : '销售价').join('、'),
      purchasePrice: row.purchasePrice ?? undefined,
      wholesalePrice: row.wholesalePrice ?? undefined,
    });
  }

  const skippedRows = details.filter((detail) => detail.status === 'skipped').length;
  const failedRows = details.filter((detail) => detail.status === 'failed').length;
  return {
    ok: true,
    totalRows: Math.max(worksheet.rowCount - 1, 0),
    recognizedRows,
    updatedRows,
    skippedRows,
    failedRows,
    details,
  };
}

async function getProductPageStats(params, currentUser) {
  const where = buildProductWhere(params, currentUser);
  const result = await queryAlibaba1688Database(
    `SELECT
       COUNT(*)::int AS total_products,
       COUNT(*) FILTER (WHERE p.status = 'listed' OR p.listing_status = 'listed')::int AS listed_products,
       COUNT(*) FILTER (
         WHERE p.status IN ('missing_cost', 'draft')
           OR EXISTS (
             SELECT 1
             FROM "1688_product_skus" skus
             WHERE skus.product_id = p.id
               AND skus.is_active
               AND skus.purchase_price <= 0
           )
       )::int AS missing_cost_products,
       COUNT(*) FILTER (WHERE p.status IN ('priced', 'ready'))::int AS priced_products
     FROM "1688_products" p
     ${where.sql}`,
    where.values,
  );
  const row = result.rows[0] ?? {};

  return {
    totalProducts: row.total_products ?? 0,
    listedProducts: row.listed_products ?? 0,
    missingCostProducts: row.missing_cost_products ?? 0,
    pricedProducts: row.priced_products ?? 0,
  };
}

async function addProductListAggregates(records) {
  if (records.length === 0) {
    return records;
  }

  const ids = records.map((product) => product.id);
  const result = await queryAlibaba1688Database(
    `WITH selected_products AS (
       SELECT id, position
       FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, position)
     )
     SELECT
       selected_products.id::text AS id,
       COALESCE(sku_summary.sku_count, 0)::int AS sku_count,
       sku_summary.first_sku_code,
       sku_summary.sku_colors,
       sku_summary.min_purchase_price,
       sku_summary.max_purchase_price,
       sku_summary.min_wholesale_price,
       sku_summary.max_wholesale_price,
       sku_summary.missing_cost_count,
       sku_summary.missing_price_count,
       image_summary.main_image_url,
       GREATEST(
         p.updated_at,
         COALESCE(sku_summary.latest_sku_updated_at, p.updated_at),
         COALESCE(image_summary.latest_image_updated_at, p.updated_at)
       ) AS latest_updated_at
     FROM selected_products
     JOIN "1688_products" p ON p.id = selected_products.id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE is_active)::int AS sku_count,
         (ARRAY_AGG(sku_code ORDER BY created_at) FILTER (WHERE is_active AND COALESCE(sku_code, '') <> ''))[1] AS first_sku_code,
         STRING_AGG(DISTINCT NULLIF(color, ''), '、') FILTER (WHERE is_active) AS sku_colors,
         MIN(purchase_price) FILTER (WHERE is_active AND purchase_price > 0) AS min_purchase_price,
         MAX(purchase_price) FILTER (WHERE is_active AND purchase_price > 0) AS max_purchase_price,
         MIN(wholesale_price) FILTER (WHERE is_active AND wholesale_price > 0) AS min_wholesale_price,
         MAX(wholesale_price) FILTER (WHERE is_active AND wholesale_price > 0) AS max_wholesale_price,
         COUNT(*) FILTER (WHERE is_active AND purchase_price <= 0)::int AS missing_cost_count,
         COUNT(*) FILTER (WHERE is_active AND wholesale_price <= 0)::int AS missing_price_count,
         MAX(updated_at) AS latest_sku_updated_at
       FROM "1688_product_skus"
       WHERE product_id = p.id
     ) sku_summary ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         (ARRAY_AGG(
           COALESCE(NULLIF(file_url, ''), NULLIF(file_path, ''))
           ORDER BY
             CASE
               WHEN image_type = 'main_image' AND is_main THEN 0
               WHEN image_type = 'main_image' THEN 1
               ELSE 2
             END,
             sort_order,
             updated_at DESC,
             created_at DESC
         ) FILTER (WHERE COALESCE(NULLIF(file_url, ''), NULLIF(file_path, '')) IS NOT NULL))[1] AS main_image_url,
         MAX(updated_at) AS latest_image_updated_at
       FROM "1688_product_images"
       WHERE product_id = p.id
         AND (image_type = 'main_image' OR (is_main = true AND COALESCE(image_type, '') <> 'sku_image'))
     ) image_summary ON TRUE
     ORDER BY selected_products.position`,
    [ids],
  );
  const aggregatesById = new Map(result.rows.map((row) => [row.id, row]));

  return records.map((product) => {
    const aggregate = aggregatesById.get(product.id) ?? {};
    return {
      ...product,
      mainImageUrl: aggregate.main_image_url || '',
      skuCount: aggregate.sku_count ?? 0,
      skuColors: Array.isArray(aggregate.sku_colors)
        ? aggregate.sku_colors.filter(Boolean)
        : String(aggregate.sku_colors ?? '').split('、').map((item) => item.trim()).filter(Boolean),
      firstSkuCode: aggregate.first_sku_code || '',
      minWholesalePrice: aggregate.min_wholesale_price === null || aggregate.min_wholesale_price === undefined
        ? undefined
        : Number(aggregate.min_wholesale_price),
      maxWholesalePrice: aggregate.max_wholesale_price === null || aggregate.max_wholesale_price === undefined
        ? undefined
        : Number(aggregate.max_wholesale_price),
      minPurchasePrice: aggregate.min_purchase_price === null || aggregate.min_purchase_price === undefined
        ? undefined
        : Number(aggregate.min_purchase_price),
      maxPurchasePrice: aggregate.max_purchase_price === null || aggregate.max_purchase_price === undefined
        ? undefined
        : Number(aggregate.max_purchase_price),
      missingCostCount: aggregate.missing_cost_count ?? 0,
      missingPriceCount: aggregate.missing_price_count ?? 0,
      latestUpdatedAt: aggregate.latest_updated_at || product.updatedAt,
    };
  });
}

async function canReadSkuRecord(sku, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  const product = await alibaba1688ProductRepository.getById(sku.productId);
  return product ? canReadProductRecord(product, currentUser) : false;
}

async function filterSkuPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  const records = [];
  for (const sku of page.records) {
    if (await canReadSkuRecord(sku, currentUser)) {
      records.push(sku);
    }
  }

  return {
    ...page,
    records,
    total: records.length,
  };
}

async function canReadImageRecord(image, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  if (image.productId) {
    const product = await alibaba1688ProductRepository.getById(image.productId);
    return product ? canReadProductRecord(product, currentUser) : false;
  }

  if (image.skuId) {
    const sku = await alibaba1688SkuRepository.getById(image.skuId);
    return sku ? await canReadSkuRecord(sku, currentUser) : false;
  }

  const scopeValues = getUserStoreScopeValues(currentUser);
  return scopeValues.has(String(image.createdBy ?? ''));
}

async function filterImagePageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  const records = [];
  for (const image of page.records) {
    if (await canReadImageRecord(image, currentUser)) {
      records.push(image);
    }
  }

  return {
    ...page,
    records,
    total: records.length,
  };
}

async function canReadListingTaskRecord(task, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return true;
  }

  const scopeValues = getUserStoreScopeValues(currentUser);
  if (
    scopeValues.has(String(task.storeId ?? '')) ||
    scopeValues.has(String(task.assigneeUserId ?? '')) ||
    scopeValues.has(String(task.createdBy ?? ''))
  ) {
    return true;
  }

  const product = await alibaba1688ProductRepository.getById(task.productId);
  return product ? canReadProductRecord(product, currentUser) : false;
}

async function filterListingTaskPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  const records = [];
  for (const task of page.records) {
    if (await canReadListingTaskRecord(task, currentUser)) {
      records.push(task);
    }
  }

  return {
    ...page,
    records,
    total: records.length,
  };
}

async function getDatabaseStatus() {
  const result = await queryAlibaba1688Database(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [businessTables],
  );
  const existingTables = new Set(result.rows.map((row) => row.table_name));
  const tables = businessTables.map((tableName) => ({
    tableName,
    exists: existingTables.has(tableName),
  }));

  const countResult = await queryAlibaba1688Database(
    `SELECT
       (SELECT COUNT(*)::int FROM "1688_settings") AS settings_count,
       (SELECT COUNT(*)::int FROM "1688_stores") AS stores_count`,
  );
  const row = countResult.rows[0] ?? {};

  return {
    ok: true,
    configured: true,
    migrated: tables.every((table) => table.exists),
    tables,
    settingsCount: row.settings_count ?? 0,
    storesCount: row.stores_count ?? 0,
    message: '1688业务 PostgreSQL 连接正常，迁移脚本已执行。',
  };
}

async function readJsonBody(req, options) {
  return JSON.parse((await options.readBody(req)) || '{}');
}

async function readProductExportBody(req, options) {
  const rawBody = (await options.readBody(req)) || '';
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const payload = new URLSearchParams(rawBody).get('payload') || '{}';
    return JSON.parse(payload);
  }

  return JSON.parse(rawBody || '{}');
}

async function getProductDetail(productId) {
  const product = await alibaba1688ProductRepository.getById(productId);
  if (!product) {
    return null;
  }

  const [skus, images, tasks] = await Promise.all([
    alibaba1688SkuRepository.list({ productId, page: 1, pageSize: 100 }),
    alibaba1688ImageRecordRepository.list({ productId, page: 1, pageSize: 100 }),
    alibaba1688ListingTaskRepository.list({ productId, page: 1, pageSize: 100 }),
  ]);
  const imagesById = new Map(images.records.map((image) => [image.id, image]));
  const skuImagesBySkuId = new Map();
  for (const image of images.records) {
    if (image.skuId && image.imageType === 'sku_image' && !skuImagesBySkuId.has(image.skuId)) {
      skuImagesBySkuId.set(image.skuId, image);
    }
  }
  const skusWithImages = skus.records.map((sku) => {
    const skuImage = (sku.skuImageId && imagesById.get(sku.skuImageId)) || skuImagesBySkuId.get(sku.id) || null;
    return {
      ...sku,
      skuImageId: sku.skuImageId || skuImage?.id || undefined,
      skuImageUrl: skuImage?.fileUrl || skuImage?.filePath || '',
      skuImage: skuImage || undefined,
    };
  });

  return {
    ...product,
    mainImageUrl: pickProductMainImageUrl(images.records),
    skus: skusWithImages,
    images: images.records,
    listingTasks: tasks.records,
  };
}

async function replaceProductMainImage(productId, body, currentUser) {
  logAlibaba1688ProductUpdate('info', 'replace main image called', {
    productId,
    bodyFields: body && typeof body === 'object' ? Object.keys(body) : [],
    containsImageFields: Boolean(body?.fileUrl || body?.filePath || body?.imageUrl || body?.mainImageUrl),
  });
  const product = await alibaba1688ProductRepository.getById(productId);
  if (!product) {
    return null;
  }
  if (!canReadProductRecord(product, currentUser) || !canWriteAlibaba1688Resource(currentUser, 'products')) {
    throw createForbiddenError('当前账号无权更换该产品主图');
  }
  if (!String(body?.fileUrl || body?.filePath || '').trim()) {
    logAlibaba1688ProductUpdate('error', 'replace main image missing image url', {
      productId,
      bodyFields: body && typeof body === 'object' ? Object.keys(body) : [],
    });
    throw createBadRequestError('主图地址不能为空，请重新选择图片后保存');
  }

  const imagePayload = {
    productId,
    imageType: 'main_image',
    imageStatus: 'ready',
    isMain: true,
    sortOrder: 0,
    fileName: body.fileName,
    filePath: body.filePath,
    fileUrl: body.fileUrl,
    createdBy: currentUser.userId || currentUser.username || '',
    remark: body.remark,
  };

  const existingMainImage = await queryAlibaba1688Database(
    `SELECT id::text, file_url, file_path
     FROM "1688_product_images"
     WHERE product_id = $1
       AND (image_type = 'main_image' OR (is_main = true AND COALESCE(image_type, '') <> 'sku_image'))
     ORDER BY
       CASE WHEN image_type = 'main_image' AND is_main = true THEN 0 WHEN image_type = 'main_image' THEN 1 ELSE 2 END,
       sort_order,
       updated_at DESC,
       created_at DESC
     LIMIT 1`,
    [productId],
  );

  const mainImageId = existingMainImage.rows[0]?.id;
  const oldMainImageUrl = existingMainImage.rows[0]?.file_url || existingMainImage.rows[0]?.file_path || '';
  const image = mainImageId
    ? await alibaba1688ImageRecordRepository.update(mainImageId, imagePayload)
    : await alibaba1688ImageRecordRepository.create(imagePayload);

  await queryAlibaba1688Database(
    `UPDATE "1688_product_images"
     SET is_main = false,
         sort_order = GREATEST(COALESCE(sort_order, 0), 0) + 1,
         updated_at = NOW()
     WHERE product_id = $1
       AND id::text <> $2`,
    [productId, image.id],
  );

  const productUpdateResult = await queryAlibaba1688Database(
    `UPDATE "1688_products"
     SET updated_at = NOW()
     WHERE id = $1
     RETURNING updated_at`,
    [productId],
  );

  const mainImageUrl = image.fileUrl || image.filePath || '';
  logAlibaba1688ProductUpdate('info', 'replace main image saved', {
    productId,
    imageId: image.id,
    oldMainImageUrl,
    newMainImageUrl: mainImageUrl,
    imageFields: Object.keys(imagePayload),
  });
  return {
    image,
    product: {
      id: productId,
      mainImageUrl,
      latestUpdatedAt: productUpdateResult.rows[0]?.updated_at || image.updatedAt,
      updatedAt: productUpdateResult.rows[0]?.updated_at || image.updatedAt,
    },
  };
}

function isPositiveNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0;
}

function buildProductListingCheck(detail) {
  const activeSkus = detail.skus.filter((sku) => sku.isActive);
  const availableImages = detail.images.filter((image) => (
    ['ready', 'used'].includes(String(image.imageStatus ?? '')) &&
    (
      image.isMain ||
      ['main_image', 'white_background', 'sku_image', 'detail_image', 'detail_page_image'].includes(String(image.imageType ?? ''))
    )
  ));

  const missingItems = [];
  if (!String(detail.productName ?? '').trim()) missingItems.push('产品名称');
  if (!String(detail.categoryId ?? '').trim()) missingItems.push('产品分类');
  if (!String(detail.storeId ?? '').trim()) missingItems.push('上架店铺');
  if (!String(detail.supplierId ?? '').trim()) missingItems.push('供应商');
  if (activeSkus.length === 0) missingItems.push('至少 1 个启用 SKU');
  if (activeSkus.some((sku) => !isPositiveNumber(sku.wholesalePrice))) missingItems.push('SKU 批发价');
  if (activeSkus.some((sku) => !isPositiveNumber(sku.minOrderQuantity))) missingItems.push('SKU 起批量');
  if (activeSkus.some((sku) => !isPositiveNumber(sku.stockQuantity))) missingItems.push('SKU 库存数量');
  if (availableImages.length === 0) missingItems.push('至少 1 张可用主图或可上架图片');
  if (!String(detail.listingTitle ?? '').trim()) missingItems.push('上架标题');
  if (!String(detail.sellingPoints ?? '').trim() && !String(detail.detailDescription ?? '').trim()) {
    missingItems.push('商品卖点或详情文案');
  }

  return {
    ok: missingItems.length === 0,
    missingItems,
    activeSkuCount: activeSkus.length,
    availableImageCount: availableImages.length,
    message: missingItems.length === 0 ? '资料完整，可以生成上架任务。' : '资料不完整，暂不能生成上架任务。',
  };
}

async function checkProductListingReady(productId, currentUser, { markReady = false } = {}) {
  if (!canWriteAlibaba1688Resource(currentUser, 'products')) {
    throw createForbiddenError('当前账号无权执行 1688 产品完整性检查');
  }

  const detail = await getProductDetail(productId);
  if (!detail) {
    return null;
  }
  if (!canReadProductRecord(detail, currentUser)) {
    throw createForbiddenError('当前账号无权检查该 1688 产品');
  }

  const check = buildProductListingCheck(detail);
  let product = detail;
  if (markReady && check.ok && detail.status !== 'ready') {
    product = await alibaba1688ProductRepository.update(productId, {
      status: 'ready',
      listingStatus: detail.listingStatus === 'listed' ? 'listed' : 'ready',
    });
  }

  return {
    ...check,
    product,
  };
}

function hasUnfinishedListingTask(tasks) {
  return tasks.some((task) => ['pending', 'manual_listing'].includes(String(task.taskStatus ?? '')));
}

async function generateListingTask(productId, body, currentUser) {
  const check = await checkProductListingReady(productId, currentUser, { markReady: true });
  if (!check) {
    return null;
  }
  if (!check.ok) {
    const error = new Error(`资料不完整，缺少：${check.missingItems.join('、')}`);
    error.statusCode = 400;
    error.details = check;
    throw error;
  }

  const existingTasks = await alibaba1688ListingTaskRepository.list({ productId, page: 1, pageSize: 100 });
  if (hasUnfinishedListingTask(existingTasks.records)) {
    const error = new Error('该产品已有未完成上架任务，不能重复生成');
    error.statusCode = 409;
    throw error;
  }

  const product = check.product;
  const storeId = body.storeId || product.storeId;
  const assigneeUserId = String(body.assigneeUserId ?? '').trim();
  if (!storeId) {
    throw new Error('storeId is required');
  }
  if (!assigneeUserId) {
    throw new Error('assigneeUserId is required');
  }

  const task = await alibaba1688ListingTaskRepository.create({
    productId,
    storeId,
    assigneeUserId,
    dueDate: body.dueDate || undefined,
    taskTitle: String(body.taskTitle ?? product.listingTitle ?? product.productName ?? '1688 上架任务').trim(),
    taskStatus: 'pending',
    createdBy: currentUser.userId || currentUser.username || '',
    remark: body.remark,
  });

  const updatedProduct = await alibaba1688ProductRepository.update(productId, {
    status: 'manual_listing',
    listingStatus: 'manual_listing',
  });

  return {
    task,
    product: updatedProduct,
    check,
  };
}

function isTaskAssignee(task, currentUser) {
  const scopeValues = getUserStoreScopeValues(currentUser);
  return scopeValues.has(String(task.assigneeUserId ?? ''));
}

async function canUpdateListingProgress(task, currentUser) {
  return canManageAlibaba1688Data(currentUser) || (
    isTaskAssignee(task, currentUser) && await canReadListingTaskRecord(task, currentUser)
  );
}

async function fillListingUrl(taskId, body, currentUser) {
  const listingUrl = String(body.listingUrl ?? body.listing_url ?? '').trim();
  if (!listingUrl) {
    throw new Error('listingUrl is required');
  }

  const currentTask = await alibaba1688ListingTaskRepository.getById(taskId);
  if (!currentTask) {
    return null;
  }
  if (!(await canUpdateListingProgress(currentTask, currentUser))) {
    throw createForbiddenError('当前账号无权回填该 1688 上架任务链接');
  }

  const task = await alibaba1688ListingTaskRepository.update(taskId, {
    listingUrl,
    taskStatus: 'listed',
    completedAt: new Date().toISOString(),
    remark: body.remark,
  });

  if (!task) {
    return null;
  }

  await queryAlibaba1688Database(
    `UPDATE "1688_products"
     SET listing_url = $1,
         status = $2,
         listing_status = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [listingUrl, 'listed', task.productId],
  );

  return {
    ...task,
    listingUrl,
    completedBy: currentUser?.userId ?? '',
  };
}

async function markListingFailed(taskId, body, currentUser) {
  const failureReason = String(body.failureReason ?? body.failure_reason ?? '').trim();
  if (!failureReason) {
    throw new Error('failureReason is required');
  }

  const currentTask = await alibaba1688ListingTaskRepository.getById(taskId);
  if (!currentTask) {
    return null;
  }
  if (!(await canUpdateListingProgress(currentTask, currentUser))) {
    throw createForbiddenError('当前账号无权标记该 1688 上架任务失败');
  }

  const task = await alibaba1688ListingTaskRepository.update(taskId, {
    taskStatus: 'failed',
    failureReason,
    completedAt: new Date().toISOString(),
    remark: body.remark,
  });

  await queryAlibaba1688Database(
    `UPDATE "1688_products"
     SET status = $1,
         listing_status = $1,
         updated_at = NOW()
     WHERE id = $2
       AND status <> 'listed'`,
    ['failed', task.productId],
  );

  return {
    ...task,
    failureReason,
    failedBy: currentUser?.userId ?? '',
  };
}

export async function handleAlibaba1688Api(req, res, options = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const requestContext = parseRequestUrl(req);

  try {
    const currentUser = options.getCurrentUser?.() ?? null;
    if (!currentUser) {
      sendJson(res, 403, { ok: false, success: false, message: '璇峰厛鐧诲綍' });
      return;
    }

    const { resource, id, action, searchParams } = requestContext;

    if (resource === 'status') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method not allowed');
        return;
      }

      sendJson(res, 200, await getDatabaseStatus());
      return;
    }

    if (resource === 'upload-image') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method not allowed');
        return;
      }

      if (!canWriteAlibaba1688Resource(currentUser, 'products')) {
        requireAlibaba1688ResourceWriter(res, currentUser, 'products');
        return;
      }

      const upload = await saveAlibaba1688ProductImageUpload(await readJsonBody(req, options));
      sendJson(res, 200, { ok: true, ...upload });
      return;
    }

    if (req.method === 'POST' && resource === 'products' && id === 'export') {
      const { fileName, buffer } = await exportProductsToExcel(await readProductExportBody(req, options), currentUser);
      const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(fileBuffer.length));
      res.end(fileBuffer);
      return;
    }

    if (req.method === 'POST' && resource === 'products' && id === 'import-prices') {
      const result = await importProductPricesFromExcel(await readJsonBody(req, options), currentUser);
      sendJson(res, 200, result);
      return;
    }

    const repository = repositories[resource];

    if (!repository) {
      sendJson(res, 404, { ok: false, message: '鏈煡鐨?1688 涓氬姟璧勬簮' });
      return;
    }

    if (req.method === 'GET') {
      if (resource === 'products' && id && action === 'listing-check') {
        const check = await checkProductListingReady(id, currentUser, {
          markReady: searchParams.get('markReady') === 'true',
        });
        if (!check) {
          sendJson(res, 404, { ok: false, message: 'Not found' });
          return;
        }
        sendJson(res, 200, check);
        return;
      }

      if (resource === 'products' && id) {
        const detail = await getProductDetail(id);
        if (!detail) {
          sendJson(res, 404, { ok: false, message: 'Not found' });
          return;
        }
        if (!canReadProductRecord(detail, currentUser)) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 浜у搧' });
          return;
        }
        sendJson(res, 200, {
          ...sanitizeProductRecordForUser(detail, currentUser),
          skus: detail.skus.map((sku) => sanitizeSkuRecordForUser(sku, currentUser)),
          images: detail.images,
          listingTasks: detail.listingTasks,
        });
        return;
      }

      if (id) {
        const record = await repository.getById(id);
        if (!record) {
          sendJson(res, 404, { ok: false, message: 'Not found' });
          return;
        }
        if (resource === 'stores' && !canReadStoreRecord(record, currentUser)) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 搴楅摵鏄犲皠' });
          return;
        }
        if (resource === 'products' && !canReadProductRecord(record, currentUser)) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 浜у搧' });
          return;
        }
        if (resource === 'skus' && !(await canReadSkuRecord(record, currentUser))) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 SKU' });
          return;
        }
        if ((resource === 'images' || resource === 'product-images') && !(await canReadImageRecord(record, currentUser))) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 鍥剧墖绱犳潗' });
          return;
        }
        if ((resource === 'listing-tasks' || resource === 'tasks') && !(await canReadListingTaskRecord(record, currentUser))) {
          sendJson(res, 403, { ok: false, message: '褰撳墠璐﹀彿鏃犳潈鏌ョ湅璇?1688 涓婃灦浠诲姟' });
          return;
        }
        const output = resource === 'suppliers'
          ? sanitizeSupplierRecordForUser(record, currentUser)
          : resource === 'skus'
            ? sanitizeSkuRecordForUser(record, currentUser)
            : record;
        sendJson(res, 200, output);
        return;
      }

      const params = searchParamsToObject(searchParams);
      const page = resource === 'products'
        ? await listProductPage(params, currentUser)
        : await repository.list(params);
      const scopedPage = resource === 'stores'
        ? filterStorePageForUser(page, currentUser)
        : resource === 'products'
          ? filterProductPageForUser(page, currentUser)
          : resource === 'skus'
            ? await filterSkuPageForUser(page, currentUser)
            : resource === 'images' || resource === 'product-images'
              ? await filterImagePageForUser(page, currentUser)
              : resource === 'listing-tasks' || resource === 'tasks'
                ? await filterListingTaskPageForUser(page, currentUser)
                : resource === 'suppliers'
                  ? sanitizeSupplierPageForUser(page, currentUser)
                  : page;
      const outputPage = resource === 'products'
        ? {
          ...scopedPage,
          records: sanitizeProductPageForUser({
            records: await addProductListAggregates(scopedPage.records),
            total: scopedPage.total,
          }, currentUser).records,
          stats: await getProductPageStats(params, currentUser),
        }
        : resource === 'skus' ? sanitizeSkuPageForUser(scopedPage, currentUser) : scopedPage;
      sendJson(res, 200, outputPage);
      return;
    }

    if (req.method === 'POST' && resource === 'products' && id && action === 'listing-task') {
      if (!requireAlibaba1688ResourceWriter(res, currentUser, 'listing-tasks')) {
        return;
      }

      const result = await generateListingTask(id, await readJsonBody(req, options), currentUser);
      if (!result) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && resource === 'products' && id && action === 'main-image') {
      const image = await replaceProductMainImage(id, await readJsonBody(req, options), currentUser);
      if (!image) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, image);
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req, options);
      const canWriteResource = canWriteAlibaba1688Resource(currentUser, resource) ||
        canCreateProductChildResource(currentUser, resource, body);
      if (!canWriteResource) {
        requireAlibaba1688ResourceWriter(res, currentUser, resource);
        return;
      }

      const safeBody = resource === 'skus'
        ? sanitizeSkuWritePayloadForUser(body, currentUser)
        : resource === 'products'
          ? sanitizeProductWritePayloadForUser(body, currentUser)
          : body;
      if (resource === 'skus') {
        await assertUniqueSkuCode(safeBody, {
          productId: safeBody?.productId || safeBody?.product_id || body?.productId || body?.product_id || '',
        });
      }
      const payload = ['products', 'images', 'product-images', 'listing-tasks', 'tasks'].includes(resource)
        ? { createdBy: currentUser.userId || currentUser.username || '', ...safeBody }
        : safeBody;
      const created = await repository.create(payload);
      if (resource === 'stores') {
        options.syncStore?.(created);
      }
      sendJson(res, 200, created);
      return;
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && id && action === 'listing-url' && ['listing-tasks', 'tasks'].includes(resource)) {
      const next = await fillListingUrl(id, await readJsonBody(req, options), currentUser);
      if (!next) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, next);
      return;
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && id && action === 'failure' && ['listing-tasks', 'tasks'].includes(resource)) {
      const next = await markListingFailed(id, await readJsonBody(req, options), currentUser);
      if (!next) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      sendJson(res, 200, next);
      return;
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && id) {
      if (!requireAlibaba1688ResourceWriter(res, currentUser, resource)) {
        return;
      }

      const body = await readJsonBody(req, options);
      const safeBody = resource === 'skus'
        ? sanitizeSkuWritePayloadForUser(body, currentUser)
        : resource === 'products'
          ? sanitizeProductWritePayloadForUser(body, currentUser)
          : body;
      if (resource === 'skus') {
        await assertUniqueSkuCode(safeBody, {
          skuId: id,
          productId: safeBody?.productId || safeBody?.product_id || body?.productId || body?.product_id || '',
        });
      }
      if (resource === 'products') {
        logAlibaba1688ProductUpdate('info', 'product update called', {
          productId: id,
          bodyFields: body && typeof body === 'object' ? Object.keys(body) : [],
          safeBodyFields: safeBody && typeof safeBody === 'object' ? Object.keys(safeBody) : [],
          containsImageFields: Boolean(
            body?.fileUrl ||
            body?.filePath ||
            body?.imageUrl ||
            body?.mainImageUrl ||
            body?.image ||
            body?.mainImage
          ),
        });
      }
      const next = await repository.update(id, safeBody);
      if (!next) {
        if (resource === 'products') {
          logAlibaba1688ProductUpdate('error', 'product update not found', { productId: id });
        }
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
      }
      if (resource === 'products') {
        logAlibaba1688ProductUpdate('info', 'product update saved', {
          productId: id,
          updatedAt: next.updatedAt,
        });
      }
      if (resource === 'stores') {
        options.syncStore?.(next);
      }
      sendJson(res, 200, next);
      return;
    }

    if (req.method === 'DELETE' && id) {
      if (!requireAlibaba1688ResourceWriter(res, currentUser, resource)) {
        return;
      }
      if (resource === 'products' && String(currentUser?.role ?? '').toLowerCase() !== 'admin') {
        throw createForbiddenError('只有管理员可以删除产品');
      }
      sendJson(res, 200, { ok: await repository.remove(id) });
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    const statusCode = error?.statusCode || (String(error?.message ?? '').includes('required') ? 400 : 500);
    const message = error instanceof Error ? error.message : String(error);
    if (requestContext.resource === 'products') {
      logAlibaba1688ProductUpdate('error', 'product request failed', {
        productId: requestContext.id,
        action: requestContext.action,
        statusCode,
        errorMessage: message,
        errorCode: error?.code,
      });
    }
    console.error(JSON.stringify({
      scope: 'alibaba-1688-api',
      message: 'request failed',
      statusCode,
      errorMessage: message,
      errorCode: error?.code,
      errorStack: error?.stack,
    }));
    sendJson(res, statusCode, {
      ok: false,
      success: false,
      code: error?.code,
      message,
      error: message,
    });
  }
}
