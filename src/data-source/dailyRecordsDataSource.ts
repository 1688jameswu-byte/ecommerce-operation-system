import type { DailyRecord, DailyRecordAttachment, DailyRecordInput, DailyRecordPage } from '../types/dailyRecords';

const apiBase = '/api/daily-records';

export interface DailyRecordListParams {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  businessCategory?: string;
  recordType?: string;
  keyword?: string;
  importance?: string;
  aiMemoryEnabled?: string;
}

function buildQuery(params: DailyRecordListParams = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function request<T>(method: string, path = '', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null) as ({ message?: string; error?: string } & T) | null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || '每日记录请求失败');
  }
  return data as T;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}

export const dailyRecordsDataSource = {
  loadPage(params: DailyRecordListParams = {}) {
    return request<DailyRecordPage>('GET', buildQuery(params));
  },
  loadById(id: string) {
    return request<DailyRecord>('GET', `/${encodeURIComponent(id)}`);
  },
  create(input: DailyRecordInput) {
    return request<DailyRecord>('POST', '', input);
  },
  update(id: string, input: DailyRecordInput) {
    return request<DailyRecord>('PATCH', `/${encodeURIComponent(id)}`, input);
  },
  remove(id: string) {
    return request<{ ok: boolean }>('DELETE', `/${encodeURIComponent(id)}`);
  },
  async uploadAttachment(recordId: string, file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    return request<DailyRecordAttachment>('POST', `/${encodeURIComponent(recordId)}/attachments`, {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      dataUrl,
    });
  },
};
