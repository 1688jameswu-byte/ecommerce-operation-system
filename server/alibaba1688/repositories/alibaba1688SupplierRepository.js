import { createAlibaba1688Repository } from './alibaba1688RepositoryFactory.js';

export const alibaba1688SupplierRepository = createAlibaba1688Repository({
  tableName: '"1688_suppliers"',
  fields: [
    'id',
    'supplierName',
    'contactName',
    'contactPhone',
    'shopUrl',
    'mainCategories',
    'supplyStability',
    'minOrderQuantity',
    'leadTimeDays',
    'address',
    'costVisibleLevel',
    'isActive',
    'createdAt',
    'updatedAt',
    'remark',
  ],
  defaults: {
    supplierName: '',
    minOrderQuantity: 0,
    leadTimeDays: 0,
    costVisibleLevel: 'restricted',
    isActive: true,
  },
  searchColumns: ['supplier_name', 'contact_name', 'contact_phone', 'main_categories'],
  filterColumns: {
    isActive: 'is_active',
    supplyStability: 'supply_stability',
    costVisibleLevel: 'cost_visible_level',
  },
});
