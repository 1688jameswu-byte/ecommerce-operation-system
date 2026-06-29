import * as XLSX from 'xlsx';

const jsonHeaders = { 'Content-Type': 'application/json' };

function withCurrentUserParam(url: string) {
  if (typeof window === 'undefined') return url;
  const currentUser = window.localStorage.getItem('currentUser');
  if (!currentUser) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}currentUser=${encodeURIComponent(currentUser)}`;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(withCurrentUserParam(url), {
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

  getProductImportRecords(page = 1, pageSize = 50, filters: Record<string, string> = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return request<ImportOverview>(`/api/data-import/temu-product-info/records?${params.toString()}`);
  },

  deleteProductImportBatch(batchId: string) {
    return request<DeleteImportBatchResult>(`/api/data-import/temu-product-info/batches/${encodeURIComponent(batchId)}`, {
      method: 'DELETE',
    });
  },

  getVisibleStores() {
    return request<{ success: boolean; stores: Array<{ id?: string; dbId?: string; storeName?: string; platform?: string; status?: string }>; message?: string }>('/api/auth/visible-stores');
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

  getAdImportRecords(page = 1, pageSize = 50, filters: Record<string, string> = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return request<ImportOverview>(`/api/data-import/temu-ad-report/records?${params.toString()}`);
  },

  deleteAdImportBatch(batchId: string) {
    return request<DeleteImportBatchResult>(`/api/data-import/temu-ad-report/batches/${encodeURIComponent(batchId)}`, {
      method: 'DELETE',
    });
  },

  getBossDashboard(params = '') {
    return request<DashboardResponse>(`/api/new-product-center/boss-dashboard${params}`);
  },

  getOperatorDashboard(params = '') {
    return request<DashboardResponse & { recommendations: RecommendationRecord[] }>(`/api/new-product-center/operator-dashboard${params}`);
  },

  getOperatorOptions(params = '') {
    return request<OperatorOptionsResponse>(`/api/new-product-center/operator-options${params}`);
  },

  getStoreOptions(params = '') {
    return request<StoreOptionsResponse>(`/api/new-product-center/store-options${params}`);
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

  getAdStrategyConfig() {
    return request<AdStrategyConfig>('/api/new-product-center/ad-strategy/config');
  },

  getAdStrategyCounts(params = '') {
    return request<{ counts: Record<string, number>; snapshotDate?: string; dataCutoffDate?: string; dateMode?: string }>(`/api/new-product-center/ad-strategy/counts${params}`);
  },

  getAdStrategyPending(params = '') {
    return request<PagedResponse<AdStrategySuggestion>>(`/api/new-product-center/ad-strategy/pending${params}`);
  },

  getAdStrategyExecution(params = '') {
    return request<PagedResponse<AdStrategyExecutionRecord>>(`/api/new-product-center/ad-strategy/execution${params}`);
  },

  getAdStrategyReview(params = '') {
    return request<PagedResponse<AdStrategyReviewRecord>>(`/api/new-product-center/ad-strategy/review${params}`);
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

export interface DeleteImportBatchResult {
  ok: boolean;
  deleted?: boolean;
  message?: string;
  batchId?: string;
  fileName?: string;
  storeName?: string;
  reportDate?: string | null;
  deletedProducts?: number;
  deletedSkus?: number;
  deletedAds?: number;
}

export interface ImportOverview {
  batches: Array<Record<string, any>>;
  records: Array<Record<string, any>>;
  total?: number;
  page?: number;
  pageSize?: number;
  summary?: Record<string, any>;
  unmatched?: Array<Record<string, any>>;
  reportDates?: string[];
  categoryOptions?: string[];
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

export interface AdStrategyConfig {
  stages: Array<{ key: string; name: string; dayStart: number; dayEnd: number; bidLevel: string; targetRoas: number | null; goal: string }>;
  thresholds: Record<string, number>;
}

export interface AdStrategySuggestion extends Partial<RecommendationRecord> {
  id: string;
  recommendationDate?: string;
  storeName?: string;
  operatorName?: string;
  productId?: string;
  productName?: string;
  daysOnline?: number;
  currentStage?: string;
  plannedTargetRoas?: number | null;
  actualTargetRoas?: number | null;
  adSpend?: number;
  adOrderCount?: number;
  naturalOrderCount?: number;
  roas?: number | null;
  targetRoas?: number | null;
  generated?: boolean;
}

export interface AdStrategyExecutionRecord extends ProductSnapshot {
  currentStage?: string;
  plannedTargetRoas?: number | null;
  actualTargetRoas?: number | null;
  executionStatus?: string;
  stageEffect?: string;
  nextAction?: string;
}

export interface AdStrategyReviewRecord {
  productId?: string;
  productName?: string;
  storeName?: string;
  operatorName?: string;
  stageName?: string;
  stageDate?: string;
  plannedTargetRoas?: number | null;
  actualTargetRoas?: number | null;
  adSpend?: number;
  adSalesAmount?: number;
  adOrderCount?: number;
  naturalOrderCount?: number;
  impressions?: number;
  clicks?: number;
  addToCartCount?: number;
  roas?: number | null;
  systemJudgement?: string;
  operatorAction?: string;
}

export interface DashboardResponse {
  snapshotDate: string;
  dataCutoffDate?: string;
  dateMode?: 'auto' | 'manual';
  summary: Record<string, number | null>;
  operatorRanking: Array<Record<string, unknown>>;
  storeRanking: Array<Record<string, unknown>>;
}

export interface OperatorOption {
  operatorId?: string;
  operatorName: string;
  storeCount?: number;
  productCount?: number;
}

export interface OperatorOptionsResponse {
  snapshotDate: string;
  dataCutoffDate?: string;
  dateMode?: 'auto' | 'manual';
  operators: OperatorOption[];
}

export interface StoreScopeOption {
  storeId?: string;
  storeName: string;
  operatorCount?: number;
  productCount?: number;
}

export interface StoreOptionsResponse {
  snapshotDate: string;
  dataCutoffDate?: string;
  dateMode?: 'auto' | 'manual';
  stores: StoreScopeOption[];
}

export interface PagedResponse<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
  snapshotDate?: string;
  dataCutoffDate?: string;
  dateMode?: 'auto' | 'manual';
}

export interface ProductDetailResponse {
  product: Record<string, unknown> | null;
  skus: Record<string, unknown>[];
  snapshots: ProductSnapshot[];
  ads: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  recommendations: RecommendationRecord[];
  timeline: Record<string, unknown>[];
  adStageReview?: AdStrategyReviewRecord[];
}
