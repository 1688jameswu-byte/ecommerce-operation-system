import type { OperatorRecord } from '../types/operator';
import { referenceDataService } from '../services/referenceDataService';

const apiBase = '/api/operators';
let cachedOperators: { data: OperatorRecord[]; expiresAt: number } | null = null;
const ttlMs = 5 * 60 * 1000;

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  xhr.open(method, `${apiBase}${path}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '运营数据请求失败');
}

export const operatorDataSource = {
  load(): OperatorRecord[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      if (cachedOperators && cachedOperators.expiresAt > Date.now()) {
        return cachedOperators.data;
      }
      const data = request<OperatorRecord[]>('GET');
      cachedOperators = { data, expiresAt: Date.now() + ttlMs };
      return data;
    } catch {
      return [];
    }
  },

  create(operator: Partial<OperatorRecord>) {
    const result = request<OperatorRecord>('POST', '', operator);
    cachedOperators = null;
    referenceDataService.invalidate('operators');
    return result;
  },

  update(id: string, operator: Partial<OperatorRecord>) {
    const result = request<OperatorRecord>('PUT', `/${encodeURIComponent(id)}`, operator);
    cachedOperators = null;
    referenceDataService.invalidate('operators');
    return result;
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
    cachedOperators = null;
    referenceDataService.invalidate('operators');
  },
};
