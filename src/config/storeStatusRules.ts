import type { StoreStatusRule } from '../types/config';

export const storeStatusRules: StoreStatusRule[] = [
  { status: 'normal', label: '正常店铺', color: '#37d67a' },
  { status: 'abnormal', label: '异常店铺', color: '#ff5d4d' },
  { status: 'closed', label: '停业店铺', color: '#536782' },
];
