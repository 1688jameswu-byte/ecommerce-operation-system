import type { RankingRule } from '../types/config';

export const rankingRules: RankingRule[] = [
  {
    id: 'operatorSalesRanking',
    title: '运营销售额排名',
    period: '本月',
    unit: '¥',
    showTopThreeBadge: true,
    showGrowth: true,
  },
  {
    id: 'storeSalesRanking',
    title: '店铺销售额排名',
    period: '本月',
    unit: '¥',
    showTopThreeBadge: true,
    showGrowth: true,
  },
  {
    id: 'newProductRanking',
    title: '有效上新排名',
    period: '本月',
    unit: '款',
    showTopThreeBadge: true,
    showGrowth: false,
  },
  {
    id: 'firstOrderRanking',
    title: '首单数量排名',
    period: '本月',
    unit: '单',
    showTopThreeBadge: true,
    showGrowth: false,
  },
];
