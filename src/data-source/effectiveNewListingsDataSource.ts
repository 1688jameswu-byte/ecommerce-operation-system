import type { EffectiveNewListingInput, EffectiveNewListingRecord } from '../types/effectiveNewListing';

const apiBase = '/api/effective-new-listings';

async function request<T>(method: string, path = '', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}${method === 'GET' ? `?t=${Date.now()}` : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.ok) {
    return await response.json() as T;
  }

  const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  throw new Error(data?.message || data?.error || '有效上新数据请求失败');
}

export const effectiveNewListingsDataSource = {
  load() {
    return request<EffectiveNewListingRecord[]>('GET');
  },
  create(input: EffectiveNewListingInput) {
    return request<EffectiveNewListingRecord>('POST', '', input);
  },
  update(id: string, input: EffectiveNewListingInput) {
    return request<EffectiveNewListingRecord>('PUT', `/${encodeURIComponent(id)}`, input);
  },
  remove(id: string) {
    return request<{ ok: true }>('DELETE', `/${encodeURIComponent(id)}`);
  },
};
