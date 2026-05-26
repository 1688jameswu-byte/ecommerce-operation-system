import type { TemuOrderDetail, TemuOrderImportBatch, TemuOrderImportResult, TemuOrderImportStore } from '../types/order';
import type { SalesOrderRecord } from '../types/fact';
import { buildStandardSalesOrders } from '../utils/factDataStandardization';
import { readPersistentJson, writePersistentJson } from './fileStorageDataSource';

export const TEMU_ORDER_IMPORT_STORAGE_KEY = 'temuOrderImportResult';
export const TEMU_ORDER_IMPORT_STORAGE_EVENT = 'temu-order-import-storage-change';
const TEMU_ORDER_IMPORT_BROADCAST_CHANNEL = 'temu-order-import-storage';
const ORDER_IMPORT_FILE_KEY = 'orderImportStore';

function notifyStorageChange() {
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
    return buildStandardSalesOrders(
      this.loadStore().batches.flatMap((batch) =>
        batch.orders.map((order) => ({ ...order, batchId: batch.batchId })),
      ),
    );
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

  deleteBatch(batchId: string) {
    const batches = this.loadStore().batches.filter((batch) => batch.batchId !== batchId);
    writePersistentJson(ORDER_IMPORT_FILE_KEY, { batches });
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

    writePersistentJson(ORDER_IMPORT_FILE_KEY, { batches });
    notifyStorageChange();
  },

  clear() {
    writePersistentJson(ORDER_IMPORT_FILE_KEY, emptyStore());
    notifyStorageChange();
  },

  sumSales,
};
