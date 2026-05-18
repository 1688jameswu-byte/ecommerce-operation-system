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
