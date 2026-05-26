import type { StoreRecord } from '../types/store';

const apiBase = '/api/stores';

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
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

    return request<StoreRecord[]>('GET');
  },

  create(store: Partial<StoreRecord>) {
    return request<StoreRecord>('POST', '', store);
  },

  update(id: string, store: Partial<StoreRecord>) {
    return request<StoreRecord>('PUT', `/${encodeURIComponent(id)}`, store);
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
  },
};
