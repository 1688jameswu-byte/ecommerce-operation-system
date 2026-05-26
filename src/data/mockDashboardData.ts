import type { DashboardData, RankingItem, SalesTrendItem } from '../types/dashboard';

const operatorNames = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '孙九', '周十', '吴十一', '郑十二'];
const storeNames = ['A饰品店', 'B饰品店', 'C饰品店', 'D饰品店', 'E饰品店', 'F饰品店', 'G饰品店', 'H饰品店', 'I饰品店', 'J饰品店'];

function buildRanking(names: string[], baseValue: number, unit?: string): RankingItem[] {
  return names.map((name, index) => ({
    rank: index + 1,
    name,
    value: Math.round(baseValue * (1 - index * 0.075)),
    unit,
    growthPercent: Number((18 - index * 1.2).toFixed(2)),
    trend: 'up',
  }));
}

function buildSalesTrend(): SalesTrendItem[] {
  return Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const salesAmount = 145000 + index * 5200 + Math.round(Math.sin(index / 2) * 28000);

    return {
      date: `04-${String(day).padStart(2, '0')}`,
      salesAmount,
      orderCount: Math.round(salesAmount / 65),
    };
  });
}

export const mockDashboardData: DashboardData = {
  updatedAt: '2026-04-30 11:24:30',
  dataSource: 'Mock 数据',
  statisticsPeriod: '本月',
  metrics: [
    {
      id: 'yesterdaySalesAmount',
      title: '昨日销售额',
      value: 253586.21,
      unit: '¥',
      compareText: '较前日',
      growthPercent: 8.23,
      trend: 'up',
      iconType: 'sales',
      colorTheme: 'gold',
    },
    {
      id: 'monthlySalesAmount',
      title: '本月销售额',
      value: 6512748.69,
      unit: '¥',
      compareText: '较上月',
      growthPercent: 18.72,
      trend: 'up',
      iconType: 'sales',
      colorTheme: 'blue',
    },
    {
      id: 'yesterdayOrderCount',
      title: '昨日订单数',
      value: 4329,
      compareText: '较昨日',
      growthPercent: 9.31,
      trend: 'up',
      iconType: 'order',
      colorTheme: 'cyan',
    },
    {
      id: 'monthlyOrderCount',
      title: '本月订单数',
      value: 102873,
      compareText: '较上月',
      growthPercent: 16.38,
      trend: 'up',
      iconType: 'order',
      colorTheme: 'purple',
    },
    {
      id: 'storeCount',
      title: '店铺数量',
      value: 28,
      compareText: '正常运营 26',
      trend: 'flat',
      iconType: 'store',
      colorTheme: 'green',
    },
    {
      id: 'abnormalStoreCount',
      title: '异常店铺数',
      value: 2,
      compareText: '需立即关注',
      trend: 'up',
      iconType: 'warning',
      colorTheme: 'red',
    },
  ],
  operatorSalesRanking: buildRanking(operatorNames, 856321, '¥'),
  storeSalesRanking: buildRanking(storeNames, 1256321, '¥'),
  newProductRanking: buildRanking(operatorNames, 168, '款'),
  firstOrderRanking: buildRanking(operatorNames, 87, '个'),
  salesTrend30Days: buildSalesTrend(),
  firstOrderTrendStores: [],
  firstOrderTrend30Days: [],
  storeStatus: {
    total: 28,
    normal: 26,
    abnormal: 2,
    closed: 0,
  },
  warnings: [
    {
      id: 'warning-001',
      type: 'shipping',
      storeName: 'A饰品店',
      content: '延迟发货率 4.32%，超过阈值 2%',
      time: '11:20',
      level: 'high',
    },
    {
      id: 'warning-002',
      type: 'afterSale',
      storeName: 'B饰品店',
      content: '退款率 6.15%，超过阈值 5%',
      time: '11:18',
      level: 'medium',
    },
    {
      id: 'warning-003',
      type: 'violation',
      storeName: 'C饰品店',
      content: '3 个商品存在图片违规',
      time: '11:15',
      level: 'critical',
    },
    {
      id: 'warning-004',
      type: 'stock',
      storeName: 'D饰品店',
      content: '15 个 SKU 库存不足',
      time: '11:10',
      level: 'medium',
    },
    {
      id: 'warning-005',
      type: 'campaign',
      storeName: 'E饰品店',
      content: '活动报名未通过 2 个',
      time: '11:08',
      level: 'low',
    },
  ],
  growthOpportunities: [],
};
