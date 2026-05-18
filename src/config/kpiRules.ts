import type { KpiRule } from '../types/config';

export const kpiRules: KpiRule[] = [
  { id: 'yesterdaySalesAmount', title: '昨日销售额', unit: '¥', colorTheme: 'gold' },
  { id: 'monthlySalesAmount', title: '本月销售额', unit: '¥', colorTheme: 'blue' },
  { id: 'yesterdayOrderCount', title: '昨日订单数', colorTheme: 'cyan' },
  { id: 'monthlyOrderCount', title: '本月订单数', colorTheme: 'purple' },
  { id: 'storeCount', title: '店铺数量', colorTheme: 'green' },
  { id: 'abnormalStoreCount', title: '异常店铺数', colorTheme: 'red' },
];
