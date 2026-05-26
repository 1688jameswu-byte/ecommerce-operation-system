import type { PlatformMetricMapping } from '../types';

export const temuMetricMappings: PlatformMetricMapping[] = [
  {
    platform: 'TEMU',
    rawMetricName: '店铺总浏览量',
    standardMetricKey: 'viewCount',
  },
  {
    platform: 'TEMU',
    rawMetricName: '总访客数',
    standardMetricKey: 'visitorCount',
  },
  {
    platform: 'TEMU',
    rawMetricName: '总支付买家数',
    standardMetricKey: 'payBuyerCount',
  },
  {
    platform: 'TEMU',
    rawMetricName: '总支付转化率',
    standardMetricKey: 'payConversionRate',
  },
  {
    platform: 'TEMU',
    rawMetricName: '总支付件数',
    standardMetricKey: 'payItemCount',
  },
  {
    platform: 'TEMU',
    rawMetricName: '销售额',
    standardMetricKey: 'salesAmount',
  },
];
