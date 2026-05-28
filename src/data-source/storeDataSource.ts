import type { StoreRecord } from '../types/store';
import { referenceDataService } from '../services/referenceDataService';

const apiBase = '/api/stores';
let cachedStores: { data: StoreRecord[]; expiresAt: number } | null = null;
const ttlMs = 5 * 60 * 1000;

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  xhr.open(method, `${apiBase}${path}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '店铺数据请求失败');
}

export const storeDataSource = {
  load(): StoreRecord[] {
    if (typeof window === 'undefined') {
      return [];
    }

    if (cachedStores && cachedStores.expiresAt > Date.now()) {
      return cachedStores.data;
    }
    const data = request<StoreRecord[]>('GET');
    cachedStores = { data, expiresAt: Date.now() + ttlMs };
    return data;
  },

  create(store: Partial<StoreRecord>) {
    const result = request<StoreRecord>('POST', '', store);
    cachedStores = null;
    referenceDataService.invalidate('stores');
    return result;
  },

  update(id: string, store: Partial<StoreRecord>) {
    const result = request<StoreRecord>('PUT', `/${encodeURIComponent(id)}`, store);
    cachedStores = null;
    referenceDataService.invalidate('stores');
    return result;
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
    cachedStores = null;
    referenceDataService.invalidate('stores');
  },
};
