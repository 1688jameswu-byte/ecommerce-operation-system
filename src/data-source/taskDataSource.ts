import type { OperationTaskRecord } from '../types/task';

const apiBase = '/api/tasks';

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '运营任务请求失败');
}

export const taskDataSource = {
  load(): OperationTaskRecord[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      return request<OperationTaskRecord[]>('GET');
    } catch {
      return [];
    }
  },

  create(task: Partial<OperationTaskRecord>) {
    return request<OperationTaskRecord>('POST', '', task);
  },

  update(id: string, task: Partial<OperationTaskRecord>) {
    return request<OperationTaskRecord>('PUT', `/${encodeURIComponent(id)}`, task);
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
  },
};
