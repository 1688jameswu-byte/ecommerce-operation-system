import type {
  Alibaba1688ImageRecord,
  Alibaba1688ListingTaskRecord,
  Alibaba1688Page,
  Alibaba1688PageParams,
  Alibaba1688ProductDetail,
  Alibaba1688ProductRecord,
  Alibaba1688SettingRecord,
  Alibaba1688SkuRecord,
  Alibaba1688StoreRecord,
  Alibaba1688SupplierRecord,
} from '../types/alibaba1688';

const apiBase = '/api/alibaba-1688';

type ResourceName =
  | 'products'
  | 'skus'
  | 'images'
  | 'suppliers'
  | 'listing-tasks'
  | 'stores'
  | 'settings';

export interface Alibaba1688DatabaseStatus {
  ok: boolean;
  configured: boolean;
  migrated: boolean;
  tables?: {
    tableName: string;
    exists: boolean;
  }[];
  settingsCount: number;
  storesCount: number;
  message: string;
}

export interface Alibaba1688ProductStats {
  totalProducts: number;
  listedProducts: number;
}

export interface Alibaba1688ProductPage extends Alibaba1688Page<Alibaba1688ProductRecord> {
  stats?: Alibaba1688ProductStats;
}

export interface Alibaba1688ListingCheckResult {
  ok: boolean;
  missingItems: string[];
  activeSkuCount: number;
  availableImageCount: number;
  message: string;
  product?: Alibaba1688ProductRecord;
}

export interface Alibaba1688ImageUploadResult {
  ok: boolean;
  fileName: string;
  filePath: string;
  fileUrl: string;
  contentType: string;
  size: number;
}

function buildQuery(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function request<T>(resource: ResourceName, method: string, path = '', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}/${resource}${path}`, {
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
  throw new Error(data?.message || data?.error || '1688 业务数据请求失败');
}

function createResourceDataSource<TRecord extends { id: string }, TInput>(resource: ResourceName) {
  return {
    loadPage(params: Alibaba1688PageParams & Record<string, string | number | boolean | undefined> = {}) {
      return request<Alibaba1688Page<TRecord>>(resource, 'GET', buildQuery(params));
    },
    loadById(id: string) {
      return request<TRecord>(resource, 'GET', `/${encodeURIComponent(id)}`);
    },
    create(input: TInput) {
      return request<TRecord>(resource, 'POST', '', input);
    },
    update(id: string, input: Partial<TInput>) {
      return request<TRecord>(resource, 'PUT', `/${encodeURIComponent(id)}`, input);
    },
    remove(id: string) {
      return request<{ ok: boolean }>(resource, 'DELETE', `/${encodeURIComponent(id)}`);
    },
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择文件'));
    reader.readAsDataURL(file);
  });
}

export const alibaba1688DataSource = {
  async loadStatus() {
    const response = await fetch(`${apiBase}/status?t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null) as Partial<Alibaba1688DatabaseStatus> & { message?: string; error?: string } | null;

    if (!response.ok) {
      throw new Error(data?.message || data?.error || '1688业务 PostgreSQL 连接检查失败');
    }

    return data as Alibaba1688DatabaseStatus;
  },
  async uploadImage(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch(`${apiBase}/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        dataUrl,
      }),
    });
    const data = await response.json().catch(() => null) as (Partial<Alibaba1688ImageUploadResult> & { message?: string; error?: string }) | null;

    if (!response.ok) {
      throw new Error(data?.message || data?.error || '图片上传失败');
    }

    return data as Alibaba1688ImageUploadResult;
  },
  products: {
    ...createResourceDataSource<Alibaba1688ProductRecord, Partial<Omit<Alibaba1688ProductRecord, 'id' | 'createdAt' | 'updatedAt'>>>('products'),
    loadPage(params: Alibaba1688PageParams & Record<string, string | number | boolean | undefined> = {}) {
      return request<Alibaba1688ProductPage>('products', 'GET', buildQuery(params));
    },
    loadDetail(id: string) {
      return request<Alibaba1688ProductDetail>('products', 'GET', `/${encodeURIComponent(id)}`);
    },
    checkListingReady(id: string, markReady = false) {
      return request<Alibaba1688ListingCheckResult>('products', 'GET', `/${encodeURIComponent(id)}/listing-check${buildQuery({ markReady })}`);
    },
    generateListingTask(id: string, payload: { assigneeUserId: string; storeId: string; dueDate?: string; taskTitle?: string; remark?: string }) {
      return request<{ task: Alibaba1688ListingTaskRecord; product: Alibaba1688ProductRecord; check: Alibaba1688ListingCheckResult }>(
        'products',
        'POST',
        `/${encodeURIComponent(id)}/listing-task`,
        payload,
      );
    },
  },
  skus: createResourceDataSource<Alibaba1688SkuRecord, Partial<Omit<Alibaba1688SkuRecord, 'id' | 'createdAt' | 'updatedAt'>>>('skus'),
  images: createResourceDataSource<Alibaba1688ImageRecord, Partial<Omit<Alibaba1688ImageRecord, 'id' | 'createdAt' | 'updatedAt'>>>('images'),
  suppliers: createResourceDataSource<Alibaba1688SupplierRecord, Partial<Omit<Alibaba1688SupplierRecord, 'id' | 'createdAt' | 'updatedAt'>>>('suppliers'),
  listingTasks: {
    ...createResourceDataSource<Alibaba1688ListingTaskRecord, Partial<Omit<Alibaba1688ListingTaskRecord, 'id' | 'createdAt' | 'updatedAt'>>>('listing-tasks'),
    fillListingUrl(id: string, payload: { listingUrl: string; remark?: string }) {
      return request<Alibaba1688ListingTaskRecord>('listing-tasks', 'PATCH', `/${encodeURIComponent(id)}/listing-url`, payload);
    },
    markFailed(id: string, payload: { failureReason: string; remark?: string }) {
      return request<Alibaba1688ListingTaskRecord>('listing-tasks', 'PATCH', `/${encodeURIComponent(id)}/failure`, payload);
    },
  },
  stores: createResourceDataSource<Alibaba1688StoreRecord, Partial<Omit<Alibaba1688StoreRecord, 'id' | 'createdAt' | 'updatedAt'>>>('stores'),
  settings: createResourceDataSource<Alibaba1688SettingRecord, Partial<Omit<Alibaba1688SettingRecord, 'id' | 'createdAt' | 'updatedAt'>>>('settings'),
};
