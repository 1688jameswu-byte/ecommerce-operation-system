export type EffectiveListingPlatform = 'TEMU' | 'Amazon' | 'TikTok' | 'Shopify';

export interface EffectiveNewListingRecord {
  id: string;
  platform: EffectiveListingPlatform | string;
  storeId: string;
  siteJoinDate: string;
  skc: string;
  remark: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  storeName?: string;
  operatorId?: string;
  operatorName?: string;
}

export type EffectiveNewListingInput = Pick<EffectiveNewListingRecord, 'platform' | 'storeId' | 'siteJoinDate' | 'skc' | 'remark'>;
