import fs from 'fs';
import path from 'path';
import { handleAlibaba1688Api } from '../server/alibaba1688/api/alibaba1688ApiHandler.js';
import { closeAlibaba1688Pool, queryAlibaba1688Database } from '../server/alibaba1688/postgresDatabase.js';

const expectedTables = {
  '1688_products': ['id', 'product_code', 'product_name', 'status', 'listing_status', 'store_id', 'supplier_id', 'created_at', 'updated_at'],
  '1688_product_skus': ['id', 'product_id', 'sku_code', 'purchase_price', 'wholesale_price', 'suggested_price', 'is_active', 'created_at', 'updated_at'],
  '1688_product_images': ['id', 'product_id', 'sku_id', 'image_type', 'image_status', 'sort_order', 'is_main', 'created_at', 'updated_at'],
  '1688_suppliers': ['id', 'supplier_name', 'cost_visible_level', 'is_active', 'created_at', 'updated_at'],
  '1688_listing_tasks': ['id', 'product_id', 'store_id', 'task_title', 'task_status', 'created_at', 'updated_at'],
  '1688_stores': ['id', 'store_name', 'shop_url', 'owner_user_id', 'is_active', 'created_at', 'updated_at'],
  '1688_settings': ['id', 'setting_group', 'setting_key', 'setting_value', 'sort_order', 'is_active', 'created_at', 'updated_at'],
};

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function createRequest(method, url, body) {
  return {
    method,
    url,
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(text = '') {
      this.payload = String(text);
    },
  };
}

const adminVerifierUser = {
  userId: 'codex-verifier',
  username: 'codex-verifier',
  displayName: 'Codex Verifier',
  role: 'admin',
  roleCode: 'admin',
};

const operatorVerifierUser = {
  userId: 'codex-operator-verifier',
  username: 'codex-operator-verifier',
  displayName: 'Codex Operator Verifier',
  role: 'operator',
  roleCode: '1688_sales',
};

const leaderVerifierUser = {
  userId: 'codex-leader-verifier',
  username: 'codex-leader-verifier',
  displayName: 'Codex Leader Verifier',
  role: 'leader',
  roleCode: '1688_lead',
};

async function callApiAsUser(user, method, url, body, options = {}) {
  const req = createRequest(method, url, body);
  const res = createResponse();

  await handleAlibaba1688Api(req, res, {
    getCurrentUser: () => user,
    readBody: async (request) => request.body || '',
    requireOperation: () => true,
  });

  const data = res.payload ? JSON.parse(res.payload) : null;
  if (res.statusCode >= 400 && !options.allowError) {
    throw new Error(`${method} ${url} failed: HTTP ${res.statusCode} ${data?.message || data?.error || res.payload}`);
  }

  return {
    statusCode: res.statusCode,
    data,
  };
}

async function callApi(method, url, body) {
  const result = await callApiAsUser(adminVerifierUser, method, url, body);
  return result.data;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertTableStructure() {
  const names = Object.keys(expectedTables);
  const result = await queryAlibaba1688Database(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [names],
  );

  const columnsByTable = new Map();
  for (const row of result.rows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  for (const [tableName, columns] of Object.entries(expectedTables)) {
    const actual = columnsByTable.get(tableName);
    assert(actual, `Missing table: ${tableName}`);
    for (const column of columns) {
      assert(actual.has(column), `Missing column: ${tableName}.${column}`);
    }
  }

  return names.length;
}

async function verifyCrud() {
  const stamp = Date.now();
  const created = {
    setting: '',
    store: '',
    otherStore: '',
    supplier: '',
    product: '',
    otherProduct: '',
    sku: '',
    image: '',
    task: '',
    otherTask: '',
    extraTasks: [],
    extraImages: [],
    extraSkus: [],
    extraProducts: [],
  };

  try {
    const setting = await callApi('POST', '/settings', {
      settingGroup: 'codex_verification',
      settingKey: `setting_${stamp}`,
      settingValue: `验证配置 ${stamp}`,
      sortOrder: 1,
      isActive: true,
    });
    created.setting = setting.id;
    assert(setting.settingValue.includes(String(stamp)), 'settings create failed');

    const store = await callApi('POST', '/stores', {
      storeName: `1688验证店铺 ${stamp}`,
      shopUrl: 'https://example.1688.com',
      ownerUserId: 'codex-verifier',
      isActive: true,
      remark: 'Codex PostgreSQL CRUD verification',
    });
    created.store = store.id;
    assert(store.storeName.includes(String(stamp)), 'stores create failed');

    const supplier = await callApi('POST', '/suppliers', {
      supplierName: `验证供应商 ${stamp}`,
      contactName: '测试联系人',
      contactPhone: '00000000000',
      mainCategories: '验证分类',
      minOrderQuantity: 1,
      leadTimeDays: 2,
      costVisibleLevel: 'restricted',
      isActive: true,
    });
    created.supplier = supplier.id;
    assert(supplier.supplierName.includes(String(stamp)), 'suppliers create failed');

    async function createVerificationProduct(suffix, { withSku = true, withImage = true } = {}) {
      const nextProduct = await callApi('POST', '/products', {
        productCode: `P-${suffix}-${stamp}`,
        productName: `验证闭环产品 ${suffix} ${stamp}`,
        categoryId: setting.id,
        status: 'draft',
        listingStatus: 'not_listed',
        storeId: store.id,
        supplierId: supplier.id,
        listingTitle: `验证上架标题 ${suffix} ${stamp}`,
        keywords: `验证,闭环,${suffix}`,
        sellingPoints: `验证卖点 ${suffix}`,
        detailDescription: `验证详情文案 ${suffix}`,
      });
      created.extraProducts.push(nextProduct.id);

      let nextSku = null;
      if (withSku) {
        nextSku = await callApi('POST', '/skus', {
          productId: nextProduct.id,
          skuCode: `SKU-${suffix}-${stamp}`,
          color: '金色',
          size: '10cm',
          purchasePrice: 1.23,
          wholesalePrice: 2.34,
          suggestedPrice: 3.45,
          minOrderQuantity: 1,
          stockQuantity: 10,
          isActive: true,
        });
        created.extraSkus.push(nextSku.id);
      }

      let nextImage = null;
      if (withImage) {
        nextImage = await callApi('POST', '/images', {
          productId: nextProduct.id,
          skuId: nextSku?.id,
          imageType: 'main_image',
          imageStatus: 'ready',
          fileName: `verify-${suffix}-${stamp}.jpg`,
          fileUrl: `https://example.com/verify-${suffix}.jpg`,
          sortOrder: 1,
          isMain: true,
        });
        created.extraImages.push(nextImage.id);
      }

      return { product: nextProduct, sku: nextSku, image: nextImage };
    }

    const product = await callApi('POST', '/products', {
      productCode: `P-${stamp}`,
      productName: `验证产品 ${stamp}`,
      categoryId: setting.id,
      productType: 'verification',
      material: '验证材质',
      craft: '验证工艺',
      status: 'draft',
      listingStatus: 'not_listed',
      storeId: store.id,
      supplierId: supplier.id,
      remark: 'Codex PostgreSQL CRUD verification',
    });
    created.product = product.id;
    assert(product.productCode === `P-${stamp}`, 'products create failed');
    assert(product.supplierId === supplier.id, 'product supplier association failed');

    const sku = await callApi('POST', '/skus', {
      productId: product.id,
      skuCode: `SKU-${stamp}`,
      color: '金色',
      size: '10cm',
      purchasePrice: 1.23,
      wholesalePrice: 2.34,
      suggestedPrice: 3.45,
      minOrderQuantity: 1,
      stockQuantity: 10,
      isActive: true,
    });
    created.sku = sku.id;
    assert(sku.productId === product.id, 'skus create failed');

    const image = await callApi('POST', '/images', {
      productId: product.id,
      skuId: sku.id,
      imageType: 'sku_image',
      imageStatus: 'ready',
      fileName: `verify-${stamp}.jpg`,
      fileUrl: 'https://example.com/verify.jpg',
      sortOrder: 1,
      isMain: true,
    });
    created.image = image.id;
    assert(image.skuId === sku.id, 'images create failed');

    const task = await callApi('POST', '/listing-tasks', {
      productId: product.id,
      storeId: store.id,
      taskTitle: `验证上架任务 ${stamp}`,
      taskStatus: 'pending',
      assigneeUserId: 'codex-verifier',
    });
    created.task = task.id;
    assert(task.productId === product.id, 'listing tasks create failed');

    const otherStore = await callApi('POST', '/stores', {
      storeName: `1688验证非范围店铺 ${stamp}`,
      ownerUserId: 'codex-other-owner',
      isActive: true,
    });
    created.otherStore = otherStore.id;

    const otherProduct = await callApi('POST', '/products', {
      productCode: `P-OTHER-${stamp}`,
      productName: `验证非范围产品 ${stamp}`,
      status: 'draft',
      listingStatus: 'not_listed',
      storeId: otherStore.id,
      supplierId: supplier.id,
    });
    created.otherProduct = otherProduct.id;

    const otherTask = await callApi('POST', '/listing-tasks', {
      productId: otherProduct.id,
      storeId: otherStore.id,
      taskTitle: `验证非范围上架任务 ${stamp}`,
      taskStatus: 'pending',
      assigneeUserId: 'codex-other-owner',
    });
    created.otherTask = otherTask.id;

    const resources = [
      ['settings', created.setting, { settingValue: `验证配置已更新 ${stamp}` }],
      ['stores', created.store, { remark: 'updated by Codex verification' }],
      ['suppliers', created.supplier, { supplyStability: 'stable' }],
      ['products', created.product, { listingTitle: `验证标题 ${stamp}` }],
      ['skus', created.sku, { stockQuantity: 11 }],
      ['images', created.image, { remark: 'updated by Codex verification' }],
      ['listing-tasks', created.task, { taskStatus: 'need_more_info' }],
    ];

    for (const [resource, id, update] of resources) {
      const page = await callApi('GET', `/${resource}?page=1&pageSize=5`);
      assert(Array.isArray(page.records), `${resource} list failed`);
      const record = await callApi('GET', `/${resource}/${id}`);
      assert(record.id === id, `${resource} get failed`);
      const updated = await callApi('PUT', `/${resource}/${id}`, update);
      assert(updated.id === id, `${resource} update failed`);
    }

    const scopedOperatorUser = {
      ...operatorVerifierUser,
      allowedStoreIds: [store.id],
    };

    const missingSkuCase = await createVerificationProduct('missing-sku', { withSku: false, withImage: false });
    const missingSkuCheck = await callApi('GET', `/products/${missingSkuCase.product.id}/listing-check?markReady=true`);
    assert(!missingSkuCheck.ok, 'listing check should fail when SKU is missing');
    assert(missingSkuCheck.missingItems.some((item) => String(item).includes('SKU')), 'missing SKU check should report SKU');
    const missingSkuTask = await callApiAsUser(adminVerifierUser, 'POST', `/products/${missingSkuCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
    }, { allowError: true });
    assert(missingSkuTask.statusCode === 400, 'missing SKU product should not generate listing task');

    const missingImageCase = await createVerificationProduct('missing-image', { withSku: true, withImage: false });
    const missingImageCheck = await callApi('GET', `/products/${missingImageCase.product.id}/listing-check?markReady=true`);
    assert(!missingImageCheck.ok, 'listing check should fail when image is missing');
    assert(missingImageCheck.missingItems.some((item) => String(item).includes('图片')), 'missing image check should report image');
    const missingImageTask = await callApiAsUser(adminVerifierUser, 'POST', `/products/${missingImageCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
    }, { allowError: true });
    assert(missingImageTask.statusCode === 400, 'missing image product should not generate listing task');

    const completeCase = await createVerificationProduct('complete', { withSku: true, withImage: true });
    const completeCheck = await callApi('GET', `/products/${completeCase.product.id}/listing-check?markReady=true`);
    assert(completeCheck.ok, 'complete product listing check should pass');
    const readyProduct = await callApi('GET', `/products/${completeCase.product.id}`);
    assert(readyProduct.status === 'ready', 'complete check should mark product as ready');

    const generated = await callApi('POST', `/products/${completeCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
      dueDate: '2099-12-31',
      taskTitle: `生成上架任务 ${stamp}`,
    });
    created.extraTasks.push(generated.task.id);
    assert(generated.task.productId === completeCase.product.id, 'generate listing task should create task');
    assert(generated.product.status === 'manual_listing', 'generate listing task should update product status to manual_listing');

    const duplicateGenerated = await callApiAsUser(adminVerifierUser, 'POST', `/products/${completeCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
    }, { allowError: true });
    assert(duplicateGenerated.statusCode === 409, 'unfinished listing task should block duplicate generation');

    const operatorGenerateTask = await callApiAsUser(scopedOperatorUser, 'POST', `/products/${completeCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
    }, { allowError: true });
    assert(operatorGenerateTask.statusCode === 403, 'operator product listing task generation should return 403');

    const operatorFillListingUrl = await callApiAsUser(scopedOperatorUser, 'PATCH', `/listing-tasks/${generated.task.id}/listing-url`, {
      listingUrl: `https://example.1688.com/listed-${stamp}.html`,
    });
    assert(operatorFillListingUrl.statusCode === 200, 'operator assigned listing task link fill should be allowed');
    assert(operatorFillListingUrl.data.taskStatus === 'listed', 'filled listing task should become listed');
    const listedProduct = await callApi('GET', `/products/${completeCase.product.id}`);
    assert(listedProduct.status === 'listed', 'filled listing task should update product status to listed');
    assert(listedProduct.listingStatus === 'listed', 'filled listing task should update product listingStatus to listed');
    assert(listedProduct.listingUrl.includes(`listed-${stamp}`), 'filled listing task should update product listingUrl');

    const failedCase = await createVerificationProduct('failed', { withSku: true, withImage: true });
    const failedGenerated = await callApi('POST', `/products/${failedCase.product.id}/listing-task`, {
      assigneeUserId: operatorVerifierUser.userId,
      storeId: store.id,
      taskTitle: `失败上架任务 ${stamp}`,
    });
    created.extraTasks.push(failedGenerated.task.id);
    const operatorMarkFailed = await callApiAsUser(scopedOperatorUser, 'PATCH', `/listing-tasks/${failedGenerated.task.id}/failure`, {
      failureReason: `验证失败原因 ${stamp}`,
    });
    assert(operatorMarkFailed.statusCode === 200, 'operator assigned listing task failure should be allowed');
    assert(operatorMarkFailed.data.taskStatus === 'failed', 'failed listing task should become failed');
    assert(operatorMarkFailed.data.failureReason.includes(String(stamp)), 'failed listing task should record failure reason');
    const failedProduct = await callApi('GET', `/products/${failedCase.product.id}`);
    assert(failedProduct.status !== 'listed', 'failed listing task should not mark product as listed');

    const operatorSupplierPage = await callApiAsUser(operatorVerifierUser, 'GET', '/suppliers?page=1&pageSize=100');
    assert(operatorSupplierPage.statusCode === 200, 'operator supplier list should be readable');
    const operatorSupplier = operatorSupplierPage.data.records.find((record) => record.id === created.supplier);
    assert(operatorSupplier, 'operator supplier list should include created supplier');
    assert(!Object.prototype.hasOwnProperty.call(operatorSupplier, 'costVisibleLevel'), 'operator supplier list should hide costVisibleLevel');

    const operatorSupplierDetail = await callApiAsUser(operatorVerifierUser, 'GET', `/suppliers/${created.supplier}`);
    assert(operatorSupplierDetail.statusCode === 200, 'operator supplier detail should be readable');
    assert(!Object.prototype.hasOwnProperty.call(operatorSupplierDetail.data, 'costVisibleLevel'), 'operator supplier detail should hide costVisibleLevel');

    const operatorCreateSupplier = await callApiAsUser(operatorVerifierUser, 'POST', '/suppliers', {
      supplierName: `operator forbidden supplier ${stamp}`,
    }, { allowError: true });
    assert(operatorCreateSupplier.statusCode === 403, 'operator supplier create should return 403');

    const operatorUpdateSupplier = await callApiAsUser(operatorVerifierUser, 'PUT', `/suppliers/${created.supplier}`, {
      remark: 'operator update should be forbidden',
    }, { allowError: true });
    assert(operatorUpdateSupplier.statusCode === 403, 'operator supplier update should return 403');

    const operatorDeleteSupplier = await callApiAsUser(operatorVerifierUser, 'DELETE', `/suppliers/${created.supplier}`, undefined, { allowError: true });
    assert(operatorDeleteSupplier.statusCode === 403, 'operator supplier delete should return 403');

    const operatorProductDetail = await callApiAsUser(scopedOperatorUser, 'GET', `/products/${created.product}`);
    assert(operatorProductDetail.statusCode === 200, 'operator scoped product detail should be readable');
    assert(operatorProductDetail.data.skus.length >= 1, 'operator scoped product detail should include readable skus');
    assert(!Object.prototype.hasOwnProperty.call(operatorProductDetail.data.skus[0], 'purchasePrice'), 'operator product detail should hide sku purchasePrice');

    const operatorSkuDetail = await callApiAsUser(scopedOperatorUser, 'GET', `/skus/${created.sku}`);
    assert(operatorSkuDetail.statusCode === 200, 'operator scoped sku detail should be readable');
    assert(!Object.prototype.hasOwnProperty.call(operatorSkuDetail.data, 'purchasePrice'), 'operator sku detail should hide purchasePrice');

    const operatorImagePage = await callApiAsUser(scopedOperatorUser, 'GET', '/images?page=1&pageSize=100');
    assert(operatorImagePage.statusCode === 200, 'operator scoped image list should be readable');
    assert(operatorImagePage.data.records.some((record) => record.id === created.image), 'operator scoped image list should include created image');

    const operatorImageDetail = await callApiAsUser(scopedOperatorUser, 'GET', `/images/${created.image}`);
    assert(operatorImageDetail.statusCode === 200, 'operator scoped image detail should be readable');

    const operatorTaskPage = await callApiAsUser(scopedOperatorUser, 'GET', '/listing-tasks?page=1&pageSize=100');
    assert(operatorTaskPage.statusCode === 200, 'operator scoped listing task list should be readable');
    assert(operatorTaskPage.data.records.some((record) => record.id === created.task), 'operator scoped listing task list should include owned store task');
    assert(!operatorTaskPage.data.records.some((record) => record.id === created.otherTask), 'operator scoped listing task list should exclude other store task');

    const operatorTaskDetail = await callApiAsUser(scopedOperatorUser, 'GET', `/listing-tasks/${created.task}`);
    assert(operatorTaskDetail.statusCode === 200, 'operator scoped listing task detail should be readable');

    const operatorOtherTaskDetail = await callApiAsUser(scopedOperatorUser, 'GET', `/listing-tasks/${created.otherTask}`, undefined, { allowError: true });
    assert(operatorOtherTaskDetail.statusCode === 403, 'operator out-of-scope listing task detail should return 403');

    const operatorCreateImage = await callApiAsUser(scopedOperatorUser, 'POST', '/images', {
      productId: product.id,
      imageType: 'main_image',
      filePath: `operator-forbidden-${stamp}.jpg`,
    }, { allowError: true });
    assert(operatorCreateImage.statusCode === 403, 'operator image create should return 403');

    const operatorUpdateImage = await callApiAsUser(scopedOperatorUser, 'PUT', `/images/${created.image}`, {
      remark: 'operator update should be forbidden',
    }, { allowError: true });
    assert(operatorUpdateImage.statusCode === 403, 'operator image update should return 403');

    const operatorDeleteImage = await callApiAsUser(scopedOperatorUser, 'DELETE', `/images/${created.image}`, undefined, { allowError: true });
    assert(operatorDeleteImage.statusCode === 403, 'operator image delete should return 403');

    const operatorCreateTask = await callApiAsUser(scopedOperatorUser, 'POST', '/listing-tasks', {
      productId: product.id,
      storeId: store.id,
      taskTitle: `operator forbidden task ${stamp}`,
    }, { allowError: true });
    assert(operatorCreateTask.statusCode === 403, 'operator listing task create should return 403');

    const operatorUpdateTask = await callApiAsUser(scopedOperatorUser, 'PUT', `/listing-tasks/${created.task}`, {
      remark: 'operator update should be forbidden',
    }, { allowError: true });
    assert(operatorUpdateTask.statusCode === 403, 'operator listing task update should return 403');

    const operatorDeleteTask = await callApiAsUser(scopedOperatorUser, 'DELETE', `/listing-tasks/${created.task}`, undefined, { allowError: true });
    assert(operatorDeleteTask.statusCode === 403, 'operator listing task delete should return 403');

    const leaderUpdateProduct = await callApiAsUser(leaderVerifierUser, 'PUT', `/products/${created.product}`, {
      supplierId: supplier.id,
      remark: 'leader update verified',
    });
    assert(leaderUpdateProduct.statusCode === 200, 'leader product update should be allowed');
    assert(leaderUpdateProduct.data.supplierId === supplier.id, 'leader product supplier update failed');

    const leaderImage = await callApiAsUser(leaderVerifierUser, 'POST', '/images', {
      productId: product.id,
      imageType: 'main_image',
      imageStatus: 'ready',
      fileName: `leader-verify-${stamp}.jpg`,
      filePath: `F:/codex/leader-verify-${stamp}.jpg`,
      sortOrder: 2,
      isMain: false,
    });
    assert(leaderImage.statusCode === 200, 'leader image create should be allowed');
    const leaderImageId = leaderImage.data.id;
    const leaderUpdatedImage = await callApiAsUser(leaderVerifierUser, 'PUT', `/images/${leaderImageId}`, {
      imageStatus: 'need_redo',
    });
    assert(leaderUpdatedImage.statusCode === 200, 'leader image update should be allowed');
    const leaderDeleteImage = await callApiAsUser(leaderVerifierUser, 'DELETE', `/images/${leaderImageId}`);
    assert(leaderDeleteImage.statusCode === 200 && leaderDeleteImage.data.ok, 'leader image delete should be allowed');

    const leaderTask = await callApiAsUser(leaderVerifierUser, 'POST', '/listing-tasks', {
      productId: product.id,
      storeId: store.id,
      taskTitle: `leader verify task ${stamp}`,
      taskStatus: 'manual_listing',
      assigneeUserId: 'codex-leader-verifier',
    });
    assert(leaderTask.statusCode === 200, 'leader listing task create should be allowed');
    const leaderTaskId = leaderTask.data.id;
    const leaderUpdatedTask = await callApiAsUser(leaderVerifierUser, 'PUT', `/listing-tasks/${leaderTaskId}`, {
      taskStatus: 'listed',
      listingUrl: 'https://example.1688.com/leader-task',
    });
    assert(leaderUpdatedTask.statusCode === 200, 'leader listing task update should be allowed');
    const leaderDeleteTask = await callApiAsUser(leaderVerifierUser, 'DELETE', `/listing-tasks/${leaderTaskId}`);
    assert(leaderDeleteTask.statusCode === 200 && leaderDeleteTask.data.ok, 'leader listing task delete should be allowed');

    const detail = await callApi('GET', `/products/${created.product}`);
    assert(detail.skus.length >= 1, 'product detail skus failed');
    assert(detail.images.length >= 1, 'product detail images failed');
    assert(detail.listingTasks.length >= 1, 'product detail listingTasks failed');

    return created;
  } finally {
    const cleanupOrder = [
      ...created.extraTasks.map((id) => ['listing-tasks', id]),
      ['listing-tasks', created.otherTask],
      ['listing-tasks', created.task],
      ...created.extraImages.map((id) => ['images', id]),
      ['images', created.image],
      ...created.extraSkus.map((id) => ['skus', id]),
      ['skus', created.sku],
      ...created.extraProducts.map((id) => ['products', id]),
      ['products', created.otherProduct],
      ['products', created.product],
      ['suppliers', created.supplier],
      ['stores', created.otherStore],
      ['stores', created.store],
      ['settings', created.setting],
    ];

    for (const [resource, id] of cleanupOrder) {
      if (!id) {
        continue;
      }

      try {
        await callApi('DELETE', `/${resource}/${id}`);
      } catch (error) {
        console.warn(`Cleanup skipped for ${resource}/${id}: ${error.message}`);
      }
    }

    if (stamp) {
      const residueResult = await queryAlibaba1688Database(
        `SELECT
           (
             (SELECT COUNT(*)::int FROM "1688_settings" WHERE setting_key LIKE $1 OR setting_value LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_stores" WHERE store_name LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_suppliers" WHERE supplier_name LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_products" WHERE product_code LIKE $1 OR product_name LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_product_skus" WHERE sku_code LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_product_images" WHERE file_name LIKE $1) +
             (SELECT COUNT(*)::int FROM "1688_listing_tasks" WHERE task_title LIKE $1)
           ) AS residue_count`,
        [`%${stamp}%`],
      );
      const residueCount = residueResult.rows[0]?.residue_count ?? 0;
      assert(residueCount === 0, `verification cleanup residue count should be 0, got ${residueCount}`);
      console.log(`1688 verification cleanup residue count: ${residueCount}`);
    }
  }
}

async function verifyMissingDatabaseUrlMessage() {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const res = createResponse();
    await handleAlibaba1688Api(createRequest('GET', '/status'), res, {
      getCurrentUser: () => ({ userId: 'codex-verifier', username: 'codex-verifier', role: 'admin', roleCode: 'admin' }),
      readBody: async () => '',
      requireOperation: () => true,
    });
    const data = JSON.parse(res.payload);
    assert(res.statusCode === 503, 'DATABASE_URL missing should return HTTP 503');
    assert(String(data.message || '').includes('DATABASE_URL'), 'DATABASE_URL missing message should mention DATABASE_URL');
    return data.message;
  } finally {
    if (original) {
      process.env.DATABASE_URL = original;
    }
  }
}

async function main() {
  loadLocalEnv();
  const missingUrlMessage = await verifyMissingDatabaseUrlMessage();

  if (!process.env.DATABASE_URL) {
    console.log('1688 PostgreSQL verification skipped: DATABASE_URL is not configured.');
    console.log(`Missing DATABASE_URL message verified: ${missingUrlMessage}`);
    return;
  }

  const tableCount = await assertTableStructure();
  await callApi('GET', '/status');
  await verifyCrud();

  console.log(`1688 PostgreSQL verification passed: ${tableCount} tables migrated, API CRUD passed for all business resources.`);
}

main()
  .catch((error) => {
    console.error(`1688 PostgreSQL verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAlibaba1688Pool();
  });
