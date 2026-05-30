import type { OperatorRecord } from '../types/operator';
import type { StoreRecord } from '../types/store';
import type { StoreOperatorRelation } from '../types/storeOperator';

const ttlMs = 5 * 60 * 1000;

type CacheEntry<T> = {
  data?: T;
  expiresAt: number;
  pending?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

async function fetchCached<T>(key: string, url: string, fallback: T): Promise<T> {
  const now = Date.now();
  const current = cache.get(key) as CacheEntry<T> | undefined;

  if (current?.data !== undefined && current.expiresAt > now) {
    return current.data;
  }
  if (current?.pending) {
    return current.pending;
  }

  const pending = fetch(url, { credentials: 'include' })
    .then(async (response) => (response.ok ? await response.json() as T : fallback))
    .catch(() => fallback)
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      return data;
    });

  cache.set(key, { data: current?.data, expiresAt: current?.expiresAt ?? 0, pending });
  return pending;
}

export const referenceDataService = {
  loadStores() {
    return fetchCached<StoreRecord[]>('stores', '/api/stores', []);
  },

  loadCompanyStores() {
    return fetchCached<StoreRecord[]>('company-stores', '/api/stores?scope=company-dashboard', []);
  },

  loadOperators() {
    return fetchCached<OperatorRecord[]>('operators', '/api/operators', []);
  },

  loadCompanyOperators() {
    return fetchCached<OperatorRecord[]>('company-operators', '/api/operators?scope=company-dashboard', []);
  },

  loadStoreOperatorRelations() {
    return fetchCached<StoreOperatorRelation[]>('store-operator-relations', '/api/store-operator-relations', []);
  },

  loadCompanyStoreOperatorRelations() {
    return fetchCached<StoreOperatorRelation[]>('company-store-operator-relations', '/api/store-operator-relations?scope=company-dashboard', []);
  },

  async loadAll() {
    const [stores, operators, relations] = await Promise.all([
      this.loadStores(),
      this.loadOperators(),
      this.loadStoreOperatorRelations(),
    ]);
    return { stores, operators, relations };
  },

  invalidate(key?: 'stores' | 'operators' | 'store-operator-relations') {
    if (key) {
      cache.delete(key);
      return;
    }
    cache.clear();
  },
};
