import { queryAlibaba1688Database } from '../postgresDatabase.js';
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

  return Boolean(menuKey) &&
    (currentUser?.platform === '1688' || platforms.has('1688')) &&
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

function sanitizeSkuPageForUser(page, currentUser) {
  if (canManageAlibaba1688Data(currentUser)) {
    return page;
  }

  return {
    ...page,
    records: page.records.map((record) => sanitizeSkuRecordForUser(record, currentUser)),
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
    total: records.length,
  };
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

  return {
    ...product,
    skus: skus.records,
    images: images.records,
    listingTasks: tasks.records,
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

  try {
    const currentUser = options.getCurrentUser?.() ?? null;
    if (!currentUser) {
      sendJson(res, 403, { ok: false, success: false, message: '璇峰厛鐧诲綍' });
      return;
    }

    const { resource, id, action, searchParams } = parseRequestUrl(req);

    if (resource === 'status') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method not allowed');
        return;
      }

      sendJson(res, 200, await getDatabaseStatus());
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
          ...detail,
          skus: detail.skus.map((sku) => sanitizeSkuRecordForUser(sku, currentUser)),
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

      const page = await repository.list(searchParamsToObject(searchParams));
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
      const outputPage = resource === 'skus' ? sanitizeSkuPageForUser(scopedPage, currentUser) : scopedPage;
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

    if (req.method === 'POST') {
      if (!requireAlibaba1688ResourceWriter(res, currentUser, resource)) {
        return;
      }

      const body = await readJsonBody(req, options);
      const payload = ['products', 'images', 'product-images', 'listing-tasks', 'tasks'].includes(resource)
        ? { createdBy: currentUser.userId || currentUser.username || '', ...body }
        : body;
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

      const next = await repository.update(id, await readJsonBody(req, options));
      if (!next) {
        sendJson(res, 404, { ok: false, message: 'Not found' });
        return;
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
      sendJson(res, 200, { ok: await repository.remove(id) });
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    const statusCode = error?.statusCode || (String(error?.message ?? '').includes('required') ? 400 : 500);
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, statusCode, {
      ok: false,
      success: false,
      message,
      error: message,
    });
  }
}
