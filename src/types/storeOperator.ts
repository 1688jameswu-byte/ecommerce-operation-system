export type StoreOperatorRole = string;
export type StoreOperatorRelationStatus = 'active' | 'inactive';

export interface StoreOperatorRelation {
  id: string;
  storeId: string;
  operatorId: string;
  role: StoreOperatorRole;
  startDate: string;
  endDate: string;
  status: StoreOperatorRelationStatus;
  remark: string;
  createdAt: string;
  updatedAt: string;
  storeName?: string;
  platform?: string;
  operatorName?: string;
}
