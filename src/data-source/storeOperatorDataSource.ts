import type { StoreOperatorRelation } from '../types/storeOperator';

const apiBase = '/api/store-operator-relations';
const STORE_OPERATOR_STORAGE_KEY = 'temuStoreOperatorRelations';

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '店铺-运营关系请求失败');
}

function operatorIdFromName(operatorName: string) {
  return `operator-${operatorName}`;
}

function normalizeRelation(item: Partial<StoreOperatorRelation>, index: number): StoreOperatorRelation {
  const now = new Date().toISOString();
  const operatorName = item.operatorName?.trim() ?? '';
  const role = item.role && ['primary', 'assistant', 'temporary'].includes(item.role) ? item.role : 'primary';
  const status = item.status && ['active', 'inactive'].includes(item.status) ? item.status : 'active';

  return {
    id: item.id || `legacy-${index}-${item.storeId || item.storeName || Date.now()}`,
    storeId: item.storeId || item.storeName || '',
    operatorId: item.operatorId || (operatorName ? operatorIdFromName(operatorName) : ''),
    role,
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    status,
    remark: item.remark || '',
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
    storeName: item.storeName,
    platform: item.platform || 'TEMU',
    operatorName: item.operatorName,
  };
}

function loadLegacyRelations() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORE_OPERATOR_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<StoreOperatorRelation>>;
    return Array.isArray(parsed) ? parsed.map(normalizeRelation) : [];
  } catch {
    return [];
  }
}

export const storeOperatorDataSource = {
  load(): StoreOperatorRelation[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const relations = request<Array<Partial<StoreOperatorRelation>>>('GET').map(normalizeRelation);
      return relations.length > 0 ? relations : loadLegacyRelations();
    } catch {
      return loadLegacyRelations();
    }
  },

  create(relation: Partial<StoreOperatorRelation>) {
    return request<StoreOperatorRelation>('POST', '', relation);
  },

  update(id: string, relation: Partial<StoreOperatorRelation>) {
    return request<StoreOperatorRelation>('PUT', `/${encodeURIComponent(id)}`, relation);
  },

  remove(id: string) {
    request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
  },

  getOperatorName(storeName: string) {
    return this.load().find((item) => item.storeName === storeName || item.storeId === storeName)?.operatorName;
  },
};
