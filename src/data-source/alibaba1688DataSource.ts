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

function sanitizeUploadFileNameBase(value: string) {
  return value
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product-image';
}

function getFileExtension(file: File) {
  const typeExtension = file.type === 'image/png'
    ? 'png'
    : file.type === 'image/webp'
      ? 'webp'
      : file.type === 'image/gif'
        ? 'gif'
        : file.type === 'image/jpeg'
          ? 'jpg'
          : '';
  const nameExtension = file.name.split('.').pop()?.toLowerCase() || '';
  return typeExtension || nameExtension || 'jpg';
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('图片加载失败，请更换图片后重试'));
    };
    image.src = imageUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function buildCompressedProductImageFile(file: File, fileNameBase: string) {
  const safeNameBase = sanitizeUploadFileNameBase(fileNameBase);
  const image = await loadImageElement(file);
  const shouldResize = image.naturalWidth > 300 || image.naturalHeight > 300;

  if (!shouldResize) {
    return new File([file], `${safeNameBase}.${getFileExtension(file)}`, {
      type: file.type || 'image/jpeg',
      lastModified: Date.now(),
    });
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, Math.floor((image.naturalWidth - sourceSize) / 2));
  const sourceY = Math.max(0, Math.floor((image.naturalHeight - sourceSize) / 2));
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持图片压缩，请更换浏览器后重试');
  }

  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 300, 300);

  let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  let extension = 'webp';
  let contentType = blob?.type || 'image/webp';
  if (!blob || blob.size === 0 || contentType !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
    extension = 'jpg';
    contentType = 'image/jpeg';
  }
  if (!blob || blob.size === 0) {
    throw new Error('图片压缩失败，请更换图片后重试');
  }

  return new File([blob], `${safeNameBase}.${extension}`, {
    type: contentType,
    lastModified: Date.now(),
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
  async uploadImage(file: File, fileNameBase?: string) {
    const uploadFile = fileNameBase
      ? await buildCompressedProductImageFile(file, fileNameBase)
      : file;
    const dataUrl = await readFileAsDataUrl(uploadFile);
    const response = await fetch(`${apiBase}/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        fileName: uploadFile.name,
        contentType: uploadFile.type,
        size: uploadFile.size,
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
