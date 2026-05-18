import type { WarningRule } from '../types/config';

export const warningRules: WarningRule[] = [
  { type: 'shipping', label: '发货异常', defaultLevel: 'high', color: '#ff5d4d' },
  { type: 'afterSale', label: '售后异常', defaultLevel: 'medium', color: '#ffb020' },
  { type: 'violation', label: '违规预警', defaultLevel: 'critical', color: '#ff3b6b' },
  { type: 'stock', label: '库存预警', defaultLevel: 'medium', color: '#7c5cff' },
  { type: 'campaign', label: '活动预警', defaultLevel: 'low', color: '#1f8fff' },
  { type: 'firstOrder', label: '首单危险', defaultLevel: 'critical', color: '#ff3b6b' },
  { type: 'traffic', label: '流量异常', defaultLevel: 'high', color: '#ffb020' },
  { type: 'conversion', label: '转化异常', defaultLevel: 'high', color: '#ffb020' },
  { type: 'deal', label: '成交异常', defaultLevel: 'critical', color: '#ff3b6b' },
];
