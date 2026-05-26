import type { OperatorRecord } from '../types/operator';

const apiBase = '/api/operators';

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
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
      return request<OperatorRecord[]>('GET');
    } catch {
      return [];
    }
  },

  create(operator: Partial<OperatorRecord>) {
    return request<OperatorRecord>('POST', '', operator);
  },

  update(id: string, operator: Partial<OperatorRecord>) {
    return request<OperatorRecord>('PUT', `/${encodeURIComponent(id)}`, operator);
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
  },
};
