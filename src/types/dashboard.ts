export type MetricTrend = 'up' | 'down' | 'flat';

export type MetricIconType = 'sales' | 'order' | 'store' | 'warning';

export type ColorTheme = 'blue' | 'cyan' | 'green' | 'red' | 'purple' | 'gold';

export type WarningType =
  | 'shipping'
  | 'afterSale'
  | 'violation'
  | 'stock'
  | 'campaign'
  | 'firstOrder'
  | 'traffic'
  | 'conversion'
  | 'deal';

export type WarningLevel = 'low' | 'medium' | 'high' | 'critical';

export interface MetricItem {
  id: string;
  title: string;
  value: number;
  unit?: string;
  compareText: string;
  growthPercent?: number;
  trend?: MetricTrend;
  iconType: MetricIconType;
  colorTheme: ColorTheme;
}

export interface RankingItem {
  rank: number;
  name: string;
  value: number;
  unit?: string;
  growthPercent?: number;
  trend?: MetricTrend;
}

export interface SalesTrendItem {
  date: string;
  salesAmount: number;
  orderCount?: number;
}

export type FirstOrderTrendStatus = 'normal' | 'warning' | 'danger';

export interface FirstOrderTrendItem {
  storeName: string;
  previous30Avg: number;
  recent7Avg: number;
  changeRate: number;
  status: FirstOrderTrendStatus;
}

export interface FirstOrderDailyTrendItem {
  date: string;
  firstOrderCount: number;
}

export interface StoreStatusData {
  total: number;
  normal: number;
  abnormal: number;
  closed: number;
}

export interface WarningItem {
  id: string;
  type: WarningType;
  storeName: string;
  content: string;
  time: string;
  level: WarningLevel;
}

export interface GrowthOpportunityItem {
  id: string;
  type: 'traffic' | 'conversion' | 'deal';
  storeName: string;
  content: string;
  growthRate: number;
}

export interface DashboardData {
  updatedAt: string;
  dataSource: string;
  statisticsPeriod: string;
  metrics: MetricItem[];
  operatorSalesRanking: RankingItem[];
  storeSalesRanking: RankingItem[];
  newProductRanking: RankingItem[];
  firstOrderRanking: RankingItem[];
  salesTrend30Days: SalesTrendItem[];
  firstOrderTrendStores: FirstOrderTrendItem[];
  firstOrderTrend30Days: FirstOrderDailyTrendItem[];
  storeStatus: StoreStatusData;
  warnings: WarningItem[];
  growthOpportunities: GrowthOpportunityItem[];
}
