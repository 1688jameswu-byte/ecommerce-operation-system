import * as XLSX from 'xlsx';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function parseExcelRows(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: true });
  return { sheetName, headers: rows.length ? Object.keys(rows[0]) : [], rows };
}

export const newProductCenterDataSource = {
  async previewProductFile(file: File) {
    return request<ImportPreview>('/api/data-import/temu-product-info/upload', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, dataUrl: await fileToDataUrl(file) }),
    });
  },

  async confirmProductImport(payload: ConfirmImportPayload) {
    return request<ImportResult>('/api/data-import/temu-product-info/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getProductImportRecords() {
    return request<ImportOverview>('/api/data-import/temu-product-info/records');
  },

  getTemuStorageStatus() {
    return request<TemuStorageStatus>('/api/data-import/temu-storage-status');
  },

  async previewAdFile(file: File) {
    return request<ImportPreview>('/api/data-import/temu-ad-report/upload', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, dataUrl: await fileToDataUrl(file) }),
    });
  },

  async confirmAdImport(payload: ConfirmImportPayload & { reportDate: string; storeName?: string }) {
    return request<ImportResult>('/api/data-import/temu-ad-report/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAdImportRecords() {
    return request<ImportOverview>('/api/data-import/temu-ad-report/records');
  },

  getBossDashboard(params = '') {
    return request<DashboardResponse>(`/api/new-product-center/boss-dashboard${params}`);
  },

  getOperatorDashboard(params = '') {
    return request<DashboardResponse & { recommendations: RecommendationRecord[] }>(`/api/new-product-center/operator-dashboard${params}`);
  },

  getProducts(params = '') {
    return request<PagedResponse<ProductSnapshot>>(`/api/new-product-center/products${params}`);
  },

  getProductDetail(productId: string) {
    return request<ProductDetailResponse>(`/api/new-product-center/products/${encodeURIComponent(productId)}`);
  },

  getRecommendations(params = '') {
    return request<PagedResponse<RecommendationRecord>>(`/api/new-product-center/ad-recommendations${params}`);
  },

  handleRecommendation(id: string, payload: { status: string; handleNote?: string }) {
    return request<{ ok: boolean; recommendation: RecommendationRecord | null }>(`/api/new-product-center/ad-recommendations/${id}/handle`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  rebuildSnapshot(snapshotDate: string) {
    return request<{ ok: boolean; snapshotRows: number }>('/api/new-product-center/rebuild-snapshot', {
      method: 'POST',
      body: JSON.stringify({ snapshotDate }),
    });
  },
};

export interface ImportPreview {
  ok: boolean;
  previewId?: string;
  fileName: string;
  headers: string[];
  mapping: Record<string, string>;
  previewRows: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
  totalRows: number;
}

export interface ConfirmImportPayload {
  previewId?: string;
  fileName: string;
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
  storeName?: string;
}

export interface ImportResult {
  ok: boolean;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors: Array<{ rowNumber: number; errorReason: string; rawData: Record<string, unknown> }>;
}

export interface ImportOverview {
  batches: Array<Record<string, any>>;
  records: Array<Record<string, any>>;
}

export interface TemuStorageStatus {
  ok: boolean;
  databaseConfigured: boolean;
  databaseConnected: boolean;
  databaseName?: string;
  message?: string;
  counts?: {
    products?: number;
    skus?: number;
    ads?: number;
    importBatches?: number;
  };
}

export interface ProductSnapshot {
  id: string;
  snapshotDate: string;
  storeName: string;
  operatorName: string;
  productId: string;
  temuProductId: string;
  temuSpuId: string;
  productName: string;
  productImageUrl?: string;
  categoryName?: string;
  firstOnlineAt?: string;
  daysOnline: number;
  currentPrice?: number;
  currentInventory?: number;
  isAdEnabled: boolean;
  isOrdered: boolean;
  orderCount: number;
  orderSalesAmount: number;
  adSpend: number;
  adSalesAmount: number;
  adOrderCount: number;
  impressions: number;
  clicks: number;
  addToCartCount: number;
  roas: number | null;
  acos: number | null;
  naturalOrderCount: number;
  productTag: string;
  latestRecommendationText?: string;
}

export interface RecommendationRecord extends ProductSnapshot {
  id: string;
  recommendationDate: string;
  recommendationType: string;
  priority: string;
  problemType: string;
  recommendationText: string;
  reasonText: string;
  suggestedAction: string;
  status: string;
  targetRoas?: number | null;
}

export interface DashboardResponse {
  snapshotDate: string;
  summary: Record<string, number | null>;
  operatorRanking: Array<Record<string, unknown>>;
  storeRanking: Array<Record<string, unknown>>;
}

export interface PagedResponse<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductDetailResponse {
  product: Record<string, unknown> | null;
  skus: Record<string, unknown>[];
  snapshots: ProductSnapshot[];
  ads: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  recommendations: RecommendationRecord[];
  timeline: Record<string, unknown>[];
}
