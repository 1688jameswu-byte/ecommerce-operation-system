export interface Alibaba1688PageParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface Alibaba1688Page<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Alibaba1688TimestampedRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type Alibaba1688ImageType =
  | 'raw_photo'
  | 'ai_generated'
  | 'main_image'
  | 'white_background'
  | 'size_image'
  | 'detail_image'
  | 'scene_image'
  | 'sku_image'
  | 'detail_page_image';

export type Alibaba1688ImageStatus =
  | 'pending_photo'
  | 'pending_edit'
  | 'ready'
  | 'used'
  | 'need_redo';

export type Alibaba1688ListingTaskStatus =
  | 'pending'
  | 'need_more_info'
  | 'manual_listing'
  | 'listed'
  | 'failed'
  | 'closed';

export interface Alibaba1688ProductRecord extends Alibaba1688TimestampedRecord {
  productCode: string;
  productName: string;
  categoryId?: string;
  productType?: string;
  material?: string;
  craft?: string;
  colorDescription?: string;
  sizeDescription?: string;
  listingTitle?: string;
  keywords?: string;
  sellingPoints?: string;
  detailDescription?: string;
  status: string;
  listingStatus: string;
  listingUrl?: string;
  storeId?: string;
  supplierId?: string;
  createdBy?: string;
  remark?: string;
  mainImageUrl?: string;
  skuCount?: number;
  skuColors?: string[];
  firstSkuCode?: string;
  minWholesalePrice?: number;
  maxWholesalePrice?: number;
  minPurchasePrice?: number;
  maxPurchasePrice?: number;
  missingCostCount?: number;
  missingPriceCount?: number;
  latestUpdatedAt?: string;
}

export interface Alibaba1688SkuRecord extends Alibaba1688TimestampedRecord {
  productId: string;
  skuCode: string;
  color?: string;
  size?: string;
  specification?: string;
  supplierSkuCode?: string;
  platformSkuCode?: string;
  purchasePrice: number;
  wholesalePrice: number;
  suggestedPrice: number;
  minOrderQuantity: number;
  stockQuantity: number;
  skuImageId?: string;
  skuImageUrl?: string;
  skuImage?: Alibaba1688ImageRecord;
  isActive: boolean;
  remark?: string;
}

export interface Alibaba1688ImageRecord extends Alibaba1688TimestampedRecord {
  productId?: string;
  skuId?: string;
  imageType: Alibaba1688ImageType | string;
  imageStatus: Alibaba1688ImageStatus | string;
  fileName?: string;
  filePath?: string;
  fileUrl?: string;
  sortOrder: number;
  isMain: boolean;
  createdBy?: string;
  remark?: string;
}

export interface Alibaba1688SupplierRecord extends Alibaba1688TimestampedRecord {
  supplierName: string;
  contactName?: string;
  contactPhone?: string;
  shopUrl?: string;
  mainCategories?: string;
  supplyStability?: string;
  minOrderQuantity: number;
  leadTimeDays: number;
  address?: string;
  costVisibleLevel?: string;
  isActive: boolean;
  remark?: string;
}

export interface Alibaba1688ListingTaskRecord extends Alibaba1688TimestampedRecord {
  productId: string;
  assigneeUserId?: string;
  storeId?: string;
  taskTitle: string;
  taskStatus: Alibaba1688ListingTaskStatus | string;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  listingUrl?: string;
  failureReason?: string;
  createdBy?: string;
  remark?: string;
}

export interface Alibaba1688StoreRecord extends Alibaba1688TimestampedRecord {
  storeName: string;
  shopUrl?: string;
  ownerUserId?: string;
  isActive: boolean;
  remark?: string;
}

export interface Alibaba1688SettingRecord extends Alibaba1688TimestampedRecord {
  settingGroup: string;
  settingKey: string;
  settingValue?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Alibaba1688ProductDetail extends Alibaba1688ProductRecord {
  skus: Alibaba1688SkuRecord[];
  images: Alibaba1688ImageRecord[];
  listingTasks: Alibaba1688ListingTaskRecord[];
}
