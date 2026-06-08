import { createAlibaba1688Repository } from './alibaba1688RepositoryFactory.js';

export const alibaba1688StoreRepository = createAlibaba1688Repository({
  tableName: '"1688_stores"',
  fields: [
    'id',
    'storeName',
    'shopUrl',
    'ownerUserId',
    'isActive',
    'createdAt',
    'updatedAt',
    'remark',
  ],
  defaults: {
    storeName: '',
    isActive: true,
  },
  searchColumns: ['store_name', 'shop_url', 'owner_user_id'],
  filterColumns: {
    ownerUserId: 'owner_user_id',
    isActive: 'is_active',
  },
});
