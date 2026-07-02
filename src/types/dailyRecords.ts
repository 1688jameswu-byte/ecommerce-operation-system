export type DailyRecordBusinessCategory =
  | 'TEMU'
  | '1688'
  | '独立站'
  | '运营管理'
  | '员工管理'
  | '系统开发'
  | '产品供应链'
  | '其他';

export type DailyRecordType =
  | '工作动作'
  | '想法'
  | '问题'
  | '决策'
  | '待办'
  | '复盘'
  | '系统需求'
  | '员工沟通';

export type DailyRecordImportance = '普通' | '重要';

export interface DailyRecordAttachment {
  id: string;
  recordId: string;
  fileUrl: string;
  fileName: string;
  fileType?: string;
  createdAt: string;
}

export interface DailyRecord {
  id: string;
  recordDate: string;
  content: string;
  businessCategory: DailyRecordBusinessCategory;
  recordType: DailyRecordType;
  importance: DailyRecordImportance;
  aiMemoryEnabled: boolean;
  aiMemoryNote?: string;
  sourceDevice: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  attachments: DailyRecordAttachment[];
}

export interface DailyRecordInput {
  recordDate?: string;
  content: string;
  businessCategory: DailyRecordBusinessCategory;
  recordType: DailyRecordType;
  importance: DailyRecordImportance;
  aiMemoryEnabled: boolean;
  aiMemoryNote?: string;
  sourceDevice: string;
  status?: string;
}

export interface DailyRecordPage {
  records: DailyRecord[];
  total: number;
  page: number;
  pageSize: number;
}
