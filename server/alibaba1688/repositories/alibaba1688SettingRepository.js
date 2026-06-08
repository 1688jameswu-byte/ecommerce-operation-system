import { createAlibaba1688Repository } from './alibaba1688RepositoryFactory.js';

export const alibaba1688SettingRepository = createAlibaba1688Repository({
  tableName: '"1688_settings"',
  fields: [
    'id',
    'settingGroup',
    'settingKey',
    'settingValue',
    'sortOrder',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  defaults: {
    settingGroup: '',
    settingKey: '',
    sortOrder: 0,
    isActive: true,
  },
  searchColumns: ['setting_group', 'setting_key', 'setting_value'],
  filterColumns: {
    settingGroup: 'setting_group',
    settingKey: 'setting_key',
    isActive: 'is_active',
  },
  orderBy: 'setting_group ASC, sort_order ASC, setting_key ASC',
});
