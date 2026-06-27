import type {
  TemuOrderDetail,
  TemuOrderImportBatch,
  TemuOrderImportDetailPage,
  TemuOrderImportRecordPage,
  TemuOrderImportResult,
  TemuOrderImportStore,
} from '../types/order';
import type { SalesOrderRecord } from '../types/fact';
import { buildStandardSalesOrders } from '../utils/factDataStandardization';
import { readPersistentJson, readPersistentJsonAsync, writePersistentJson, writePersistentJsonAsync } from './fileStorageDataSource';

export const TEMU_ORDER_IMPORT_STORAGE_KEY = 'temuOrderImportResult';
export const TEMU_ORDER_IMPORT_STORAGE_EVENT = 'temu-order-import-storage-change';
const TEMU_ORDER_IMPORT_BROADCAST_CHANNEL = 'temu-order-import-storage';
const ORDER_IMPORT_FILE_KEY = 'orderImportStore';
const recentStoreCache = new Map<string, Promise<TemuOrderImportStore>>();

function notifyStorageChange() {
  recentStoreCache.clear();
  window.dispatchEvent(new Event(TEMU_ORDER_IMPORT_STORAGE_EVENT));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(TEMU_ORDER_IMPORT_BROADCAST_CHANNEL);
    channel.postMessage(TEMU_ORDER_IMPORT_STORAGE_EVENT);
    channel.close();
  }
}

export function subscribeOrderImportStorageChange(callback: () => void) {
  const handleCustomEvent = () => callback();
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === TEMU_ORDER_IMPORT_STORAGE_KEY) {
      callback();
    }
  };
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(TEMU_ORDER_IMPORT_BROADCAST_CHANNEL) : null;

  channel?.addEventListener('message', handleCustomEvent);
  window.addEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);
  window.addEventListener('focus', handleCustomEvent);
  document.addEventListener('visibilitychange', handleCustomEvent);

  return () => {
    channel?.removeEventListener('message', handleCustomEvent);
    channel?.close();
    window.removeEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
    window.removeEventListener('focus', handleCustomEvent);
    document.removeEventListener('visibilitychange', handleCustomEvent);
  };
}

function emptyStore(): TemuOrderImportStore {
  return { batches: [] };
}

function isStore(value: unknown): value is TemuOrderImportStore {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as TemuOrderImportStore).batches));
}

function isLegacyImport(value: unknown): value is TemuOrderImportResult {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as TemuOrderImportResult).orders));
}

function sumSales(orders: TemuOrderDetail[]) {
  return Number(orders.reduce((total, order) => total + order.salesAmount, 0).toFixed(2));
}

function recalcBatch(batch: TemuOrderImportBatch): TemuOrderImportBatch {
  return {
    ...batch,
    validRows: batch.orders.length,
    duplicateRows: 0,
  };
}

function normalizeStoreName(value: unknown) {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .trim();

  if (!name) {
    return '未知店铺';
  }

  if (name.includes('�')) {
    const fallbackName = name.replace(/�+/g, '').trim();

    if (/^[a-z0-9]+$/i.test(fallbackName)) {
      return `${fallbackName}店`;
    }
  }

  return name;
}

function normalizeStore(store: TemuOrderImportStore) {
  let changed = false;
  const batches = store.batches.map((batch) => ({
    ...batch,
    orders: batch.orders.map((order) => {
      const storeName = normalizeStoreName(order.storeName);

      if (storeName === order.storeName) {
        return order;
      }

      changed = true;
      return { ...order, storeName };
    }),
  }));

  return {
    changed,
    store: changed ? ({ batches } satisfies TemuOrderImportStore) : store,
  };
}

function getPairs(orders: TemuOrderDetail[]) {
  return new Set(orders.map((order) => `${order.storeName}|${order.orderDate}`));
}

function toBatch(importResult: TemuOrderImportResult): TemuOrderImportBatch {
  return {
    ...importResult,
    batchId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

function buildImportResult(store: TemuOrderImportStore): TemuOrderImportResult | null {
  const batches = store.batches;

  if (batches.length === 0) {
    return null;
  }

  const orders = batches.flatMap((batch) => batch.orders);
  const latestImportedAt = batches
    .map((batch) => batch.importedAt)
    .sort()
    .at(-1)!;
  const latestImportDate = latestImportedAt.slice(0, 10);
  const displayOrders = batches
    .filter((batch) => batch.importedAt.slice(0, 10) === latestImportDate)
    .flatMap((batch) => batch.orders);

  return {
    fileName: `${batches.length}个导入批次`,
    importedAt: latestImportedAt,
    totalRows: orders.length,
    validRows: orders.length,
    duplicateRows: 0,
    orders,
    displayOrders,
  };
}

export const orderImportStorageDataSource = {
  loadStore(): TemuOrderImportStore {
    if (typeof window === 'undefined') {
      return emptyStore();
    }

    const fileStore = readPersistentJson<TemuOrderImportStore>(ORDER_IMPORT_FILE_KEY, emptyStore());

    if (fileStore.batches.length > 0) {
      const normalized = normalizeStore(fileStore);

      if (normalized.changed) {
        writePersistentJson(ORDER_IMPORT_FILE_KEY, normalized.store);
      }

      return normalized.store;
    }

    const raw = window.localStorage.getItem(TEMU_ORDER_IMPORT_STORAGE_KEY);

    if (!raw) {
      return fileStore;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;

      if (isStore(parsed)) {
        const normalized = normalizeStore(parsed);
        writePersistentJson(ORDER_IMPORT_FILE_KEY, normalized.store);
        return normalized.store;
      }

      if (isLegacyImport(parsed)) {
        const store = normalizeStore({ batches: [toBatch(parsed)] }).store;
        writePersistentJson(ORDER_IMPORT_FILE_KEY, store);
        return store;
      }
    } catch {
      return emptyStore();
    }

    return fileStore;
  },

  async loadStoreAsync(): Promise<TemuOrderImportStore> {
    if (typeof window === 'undefined') {
      return emptyStore();
    }

    const fileStore = await readPersistentJsonAsync<TemuOrderImportStore>(ORDER_IMPORT_FILE_KEY, emptyStore());

    if (fileStore.batches.length > 0) {
      const normalized = normalizeStore(fileStore);

      if (normalized.changed) {
        await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, normalized.store);
      }

      return normalized.store;
    }

    const raw = window.localStorage.getItem(TEMU_ORDER_IMPORT_STORAGE_KEY);

    if (!raw) {
      return fileStore;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;

      if (isStore(parsed)) {
        const normalized = normalizeStore(parsed);
        await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, normalized.store);
        return normalized.store;
      }

      if (isLegacyImport(parsed)) {
        const store = normalizeStore({ batches: [toBatch(parsed)] }).store;
        await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, store);
        return store;
      }
    } catch {
      return emptyStore();
    }

    return fileStore;
  },

  async loadRecentStore(options: { recentDays?: number; limit?: number } = {}): Promise<TemuOrderImportStore> {
    if (typeof window === 'undefined') {
      return emptyStore();
    }

    const params = new URLSearchParams({
      recentDays: String(options.recentDays ?? 30),
      limit: String(options.limit ?? 500),
    });
    const cacheKey = params.toString();
    const cached = recentStoreCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = (async () => {
      try {
        const response = await fetch(`/api/persistent-data/${ORDER_IMPORT_FILE_KEY}?${params.toString()}&t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = response.ok ? await response.json() as unknown : emptyStore();
        return isStore(data) ? normalizeStore(data).store : emptyStore();
      } catch {
        return emptyStore();
      }
    })();

    recentStoreCache.set(cacheKey, request);
    return request;
  },

  async loadRecordPage(options: {
    page?: number;
    pageSize?: number;
    storeName?: string;
    orderDate?: string;
    importDate?: string;
    fileName?: string;
    status?: string;
  } = {}): Promise<TemuOrderImportRecordPage> {
    const params = new URLSearchParams({
      view: 'records',
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 20),
    });

    if (options.storeName) params.set('storeName', options.storeName);
    if (options.orderDate) params.set('orderDate', options.orderDate);
    if (options.importDate) params.set('importDate', options.importDate);
    if (options.fileName) params.set('fileName', options.fileName);
    if (options.status) params.set('status', options.status);

    try {
      const response = await fetch(`/api/persistent-data/${ORDER_IMPORT_FILE_KEY}?${params.toString()}&t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('订单导入记录读取失败');
      }

      return await response.json() as TemuOrderImportRecordPage;
    } catch {
      return {
        records: [],
        total: 0,
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 20,
        summary: {
          todayStoreCount: 0,
          todaySalesAmount: 0,
          todayFirstOrderCount: 0,
          batchCount: 0,
          abnormalStoreCount: 0,
          missingOrderItems: [],
          storeOptions: [],
          dateOptions: [],
        },
        filteredSummary: {
          dateCount: 0,
          storeCount: 0,
          batchCount: 0,
          detailCount: 0,
          salesAmount: 0,
        },
      };
    }
  },

  async loadBatchDetail(options: {
    batchId: string;
    storeName: string;
    orderDate: string;
    page?: number;
    pageSize?: number;
  }): Promise<TemuOrderImportDetailPage> {
    const params = new URLSearchParams({
      view: 'detail',
      batchId: options.batchId,
      storeName: options.storeName,
      orderDate: options.orderDate,
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 50),
    });

    try {
      const response = await fetch(`/api/persistent-data/${ORDER_IMPORT_FILE_KEY}?${params.toString()}&t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('订单明细读取失败');
      }

      return await response.json() as TemuOrderImportDetailPage;
    } catch {
      return {
        batchId: options.batchId,
        storeName: options.storeName,
        orderDate: options.orderDate,
        orders: [],
        total: 0,
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 50,
      };
    }
  },

  buildImportResult(store: TemuOrderImportStore): TemuOrderImportResult | null {
    return buildImportResult(store);
  },

  buildStandardSalesOrdersFromStore(store: TemuOrderImportStore): SalesOrderRecord[] {
    return buildStandardSalesOrders(
      store.batches.flatMap((batch) =>
        batch.orders.map((order) => ({ ...order, batchId: batch.batchId })),
      ),
    );
  },

  load(): TemuOrderImportResult | null {
    const batches = this.loadStore().batches;

    if (batches.length === 0) {
      return null;
    }

    const orders = batches.flatMap((batch) => batch.orders);
    const latestImportedAt = batches
      .map((batch) => batch.importedAt)
      .sort()
      .at(-1)!;
    const latestImportDate = latestImportedAt.slice(0, 10);
    const displayOrders = batches
      .filter((batch) => batch.importedAt.slice(0, 10) === latestImportDate)
      .flatMap((batch) => batch.orders);

    return {
      fileName: `${batches.length}个导入批次`,
      importedAt: latestImportedAt,
      totalRows: orders.length,
      validRows: orders.length,
      duplicateRows: 0,
      orders,
      displayOrders,
    };
  },

  loadStandardSalesOrders(): SalesOrderRecord[] {
    return this.buildStandardSalesOrdersFromStore(this.loadStore());
  },

  save(importResult: TemuOrderImportResult) {
    const newBatch = normalizeStore({ batches: [toBatch(importResult)] }).store.batches[0];
    const replacePairs = getPairs(newBatch.orders);
    const batches = this.loadStore().batches
      .map((batch) =>
        recalcBatch({
          ...batch,
          orders: batch.orders.filter((order) => !replacePairs.has(`${order.storeName}|${order.orderDate}`)),
        }),
      )
      .filter((batch) => batch.orders.length > 0);

    writePersistentJson(ORDER_IMPORT_FILE_KEY, { batches: [...batches, newBatch] } satisfies TemuOrderImportStore);
    notifyStorageChange();
  },

  async saveAsync(importResult: TemuOrderImportResult) {
    const newBatch = normalizeStore({ batches: [toBatch(importResult)] }).store.batches[0];
    await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, { batches: [newBatch] } satisfies TemuOrderImportStore, {
      appendImportBatch: true,
    });
    notifyStorageChange();
  },

  deleteBatch(batchId: string) {
    const store = this.loadStore();
    const target = store.batches.find((batch) => batch.batchId === batchId);
    if (!target) {
      throw new Error('未找到对应导入批次，请刷新页面后重试。');
    }

    const batches = store.batches.filter((batch) => batch.batchId !== batchId);
    const requestPayload = { batches } satisfies TemuOrderImportStore;
    console.log('[order-import-delete-request]', {
      batchId,
      fileName: target.fileName,
      importedAt: target.importedAt,
      stores: Array.from(new Set(target.orders.map((order) => order.storeName))),
      dates: Array.from(new Set(target.orders.map((order) => order.orderDate))),
      requestPayload,
    });
    const responseText = writePersistentJson(ORDER_IMPORT_FILE_KEY, requestPayload, { deleteImportData: true });
    const response = responseText ? JSON.parse(responseText) as { deleteSummary?: { removedRecordCount?: number; removedOrderCount?: number } } : null;
    console.log('[order-import-delete-response]', response);
    if (response?.deleteSummary && !response.deleteSummary.removedRecordCount && !response.deleteSummary.removedOrderCount) {
      throw new Error('未找到对应导入批次，请刷新页面后重试。');
    }
    notifyStorageChange();
  },

  async deleteBatchAsync(batchId: string) {
    const store = await this.loadStoreAsync();
    const target = store.batches.find((batch) => batch.batchId === batchId);
    if (!target) {
      throw new Error('未找到对应导入批次，请刷新页面后重试。');
    }

    const batches = store.batches.filter((batch) => batch.batchId !== batchId);
    const requestPayload = { batches } satisfies TemuOrderImportStore;
    console.log('[order-import-delete-request]', {
      batchId,
      fileName: target.fileName,
      importedAt: target.importedAt,
      stores: Array.from(new Set(target.orders.map((order) => order.storeName))),
      dates: Array.from(new Set(target.orders.map((order) => order.orderDate))),
      requestPayload,
    });
    const responseText = await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, requestPayload, { deleteImportData: true });
    const response = responseText ? JSON.parse(responseText) as { deleteSummary?: { removedRecordCount?: number; removedOrderCount?: number } } : null;
    console.log('[order-import-delete-response]', response);
    if (response?.deleteSummary && !response.deleteSummary.removedRecordCount && !response.deleteSummary.removedOrderCount) {
      throw new Error('未找到对应导入批次，请刷新页面后重试。');
    }
    notifyStorageChange();
  },

  deleteByScope(scope: { date?: string; storeName?: string }) {
    if (!scope.date && !scope.storeName) {
      return;
    }

    const batches = this.loadStore().batches
      .map((batch) =>
        recalcBatch({
          ...batch,
          orders: batch.orders.filter((order) => {
            const matchedDate = !scope.date || order.orderDate === scope.date;
            const matchedStore = !scope.storeName || order.storeName === scope.storeName;
            return !(matchedDate && matchedStore);
          }),
        }),
      )
      .filter((batch) => batch.orders.length > 0);

    writePersistentJson(ORDER_IMPORT_FILE_KEY, { batches }, { deleteImportData: true });
    notifyStorageChange();
  },

  async deleteByScopeAsync(scope: { date?: string; storeName?: string }) {
    if (!scope.date && !scope.storeName) {
      return;
    }

    const batches = (await this.loadStoreAsync()).batches
      .map((batch) =>
        recalcBatch({
          ...batch,
          orders: batch.orders.filter((order) => {
            const matchedDate = !scope.date || order.orderDate === scope.date;
            const matchedStore = !scope.storeName || order.storeName === scope.storeName;
            return !(matchedDate && matchedStore);
          }),
        }),
      )
      .filter((batch) => batch.orders.length > 0);

    await writePersistentJsonAsync(ORDER_IMPORT_FILE_KEY, { batches }, { deleteImportData: true });
    notifyStorageChange();
  },

  clear() {
    writePersistentJson(ORDER_IMPORT_FILE_KEY, emptyStore());
    notifyStorageChange();
  },

  sumSales,
};
