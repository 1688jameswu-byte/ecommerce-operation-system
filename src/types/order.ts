export interface TemuOrderDetail {
  orderId: string;
  isFirstOrder: boolean;
  skc: string;
  skcCode: string;
  skuAttribute: string;
  skuCode: string;
  productSku: string;
  productName: string;
  declarePrice: number;
  quantity: number;
  orderTime: string;
  orderDate: string;
  month: string;
  status: string;
  storeName: string;
  salesAmount: number;
  operatorName: string;
  uniqueKey: string;
}

export interface TemuOrderImportResult {
  fileName: string;
  importedAt: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  orders: TemuOrderDetail[];
  displayOrders?: TemuOrderDetail[];
}

export interface TemuOrderImportBatch extends TemuOrderImportResult {
  batchId: string;
}

export interface TemuOrderImportStore {
  batches: TemuOrderImportBatch[];
}

export interface TemuOrderImportMissingItem {
  storeName: string;
  date: string;
}

export interface TemuOrderImportRecord {
  id: string;
  batchId: string;
  date: string;
  orderDate: string;
  storeName: string;
  fileName: string;
  importedAt: string;
  importedBy: string;
  detailCount: number;
  salesAmount: number;
  firstOrderCount: number;
  status: 'normal' | 'missing' | 'duplicate' | 'abnormal';
}

export interface TemuOrderImportSummary {
  todayStoreCount: number;
  todaySalesAmount: number;
  todayFirstOrderCount: number;
  batchCount: number;
  abnormalStoreCount: number;
  missingOrderItems: TemuOrderImportMissingItem[];
  storeOptions: string[];
  dateOptions: string[];
}

export interface TemuOrderImportScopeSummary {
  dateCount: number;
  storeCount: number;
  batchCount: number;
  detailCount: number;
  salesAmount: number;
}

export interface TemuOrderImportRecordPage {
  records: TemuOrderImportRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: TemuOrderImportSummary;
  filteredSummary?: TemuOrderImportScopeSummary;
}

export interface TemuOrderImportDetailPage {
  batchId: string;
  storeName: string;
  orderDate: string;
  orders: TemuOrderDetail[];
  total: number;
  page: number;
  pageSize: number;
}
