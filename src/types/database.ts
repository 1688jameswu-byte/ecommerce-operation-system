export type StoreStatus = 'normal' | 'abnormal' | 'closed';

export interface StoreRecord {
  id: string;
  name: string;
  platform: string;
  status: StoreStatus;
  operatorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorRecord {
  id: string;
  name: string;
  teamName?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatchRecord {
  id: string;
  fileName: string;
  sourceType: 'excel' | 'temu' | 'dianxiaomi' | 'feishu' | 'erp';
  rowCount: number;
  status: 'parsed' | 'normalized' | 'failed';
  importedAt: string;
}

export interface DailySalesRecord {
  id: string;
  storeId: string;
  operatorId?: string;
  salesDate: string;
  salesAmount: number;
  orderCount: number;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}
