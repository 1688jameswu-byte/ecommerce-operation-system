export type StorePlatform = 'TEMU' | '1688' | 'Amazon' | 'TikTok' | 'SHEIN' | 'Shopify' | 'Other';
export type StoreStatus = 'active' | 'inactive' | 'disabled' | 'paused' | 'closed';

export interface StoreRecord {
  id: string;
  storeName: string;
  platform: StorePlatform;
  platformStoreId?: string;
  siteCountry?: string;
  storeGroup?: string;
  country?: string;
  status: StoreStatus;
  groupName?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}
