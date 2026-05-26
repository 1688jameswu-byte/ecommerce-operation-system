export type StandardMetricCategory = 'sales' | 'traffic' | 'conversion' | 'ad' | 'afterSale';
export type StandardMetricUnit = 'amount' | 'count' | 'rate' | 'ratio';

export interface StandardMetricDefinition {
  key: string;
  label: string;
  description: string;
  category: StandardMetricCategory;
  unit: StandardMetricUnit;
}

export const standardMetricDictionary: StandardMetricDefinition[] = [
  {
    key: 'salesAmount',
    label: '销售金额',
    description: '标准事实数据中的销售金额。',
    category: 'sales',
    unit: 'amount',
  },
  {
    key: 'orderCount',
    label: '订单数',
    description: '标准事实数据中的订单或成交买家数量。',
    category: 'sales',
    unit: 'count',
  },
  {
    key: 'visitorCount',
    label: '访客数',
    description: '标准事实数据中的访问用户数量。',
    category: 'traffic',
    unit: 'count',
  },
  {
    key: 'impressionCount',
    label: '曝光数',
    description: '标准事实数据中的曝光或浏览数量。',
    category: 'traffic',
    unit: 'count',
  },
  {
    key: 'clickCount',
    label: '点击数',
    description: '标准事实数据中的点击数量。',
    category: 'traffic',
    unit: 'count',
  },
  {
    key: 'ctr',
    label: '点击率',
    description: '点击数相对曝光数的比例。',
    category: 'traffic',
    unit: 'rate',
  },
  {
    key: 'conversionRate',
    label: '转化率',
    description: '订单或成交买家相对访客的比例。',
    category: 'conversion',
    unit: 'rate',
  },
  {
    key: 'avgOrderValue',
    label: '客单价',
    description: '销售金额相对订单数的平均金额。',
    category: 'sales',
    unit: 'amount',
  },
  {
    key: 'refundRate',
    label: '退款率',
    description: '退款订单或金额相对总订单或总金额的比例。',
    category: 'afterSale',
    unit: 'rate',
  },
  {
    key: 'afterSaleRate',
    label: '售后率',
    description: '售后订单相对总订单的比例。',
    category: 'afterSale',
    unit: 'rate',
  },
  {
    key: 'adSpend',
    label: '广告花费',
    description: '广告投放产生的成本金额。',
    category: 'ad',
    unit: 'amount',
  },
  {
    key: 'roas',
    label: '广告投入产出比',
    description: '销售金额相对广告花费的比例。',
    category: 'ad',
    unit: 'ratio',
  },
  {
    key: 'firstOrderCount',
    label: '首单数',
    description: '标准事实数据中的首单数量。',
    category: 'sales',
    unit: 'count',
  },
];
