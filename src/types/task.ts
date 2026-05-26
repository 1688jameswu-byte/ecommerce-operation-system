export type OperationTaskSourceType =
  | 'manual'
  | 'warning'
  | 'opportunity'
  | 'risk_warning'
  | 'operation_anomaly'
  | 'growth_opportunity';
export type OperationTaskPriority = 'high' | 'medium' | 'low';
export type OperationTaskStatus = 'todo' | 'doing' | 'done' | 'closed';
export type OperationTaskReviewStatus = 'none' | 'improved' | 'watching' | 'not_improved' | 'unknown';

export interface OperationTaskRecord {
  id: string;
  title: string;
  platform?: string;
  storeId?: string;
  storeName: string;
  operatorId?: string;
  operatorName?: string;
  sourceType: OperationTaskSourceType;
  sourceId?: string;
  sourceContent?: string;
  suggestion?: string;
  priority: OperationTaskPriority;
  status: OperationTaskStatus;
  dueDate?: string;
  resultNote?: string;
  reviewStatus?: OperationTaskReviewStatus;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
