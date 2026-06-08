import { createAlibaba1688Repository } from './alibaba1688RepositoryFactory.js';

export const alibaba1688ImageRecordRepository = createAlibaba1688Repository({
  tableName: '"1688_product_images"',
  fields: [
    'id',
    'productId',
    'skuId',
    'imageType',
    'imageStatus',
    'fileName',
    'filePath',
    'fileUrl',
    'sortOrder',
    'isMain',
    'createdBy',
    'createdAt',
    'updatedAt',
    'remark',
  ],
  defaults: {
    imageType: 'raw_photo',
    imageStatus: 'pending_photo',
    sortOrder: 0,
    isMain: false,
  },
  searchColumns: ['file_name', 'file_path', 'file_url'],
  filterColumns: {
    productId: 'product_id',
    skuId: 'sku_id',
    imageType: 'image_type',
    imageStatus: 'image_status',
    createdBy: 'created_by',
  },
});
