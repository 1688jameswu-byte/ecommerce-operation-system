import type { AnomalyAnalysisNode, AnomalyAnalysisTreeDefinition } from './anomalyAnalysisTreeTypes';

function businessCause(metricKey: string, metricLabel: string, explanation: string): AnomalyAnalysisNode {
  return {
    metricKey,
    metricLabel,
    relationId: 'business-cause',
    direction: 'businessCause',
    explanation,
    children: [],
  };
}

export const anomalyAnalysisTreeLibrary: AnomalyAnalysisTreeDefinition[] = [
  {
    rootMetric: 'salesAmount',
    rootLabel: '销售额',
  },
  {
    rootMetric: 'orderCount',
    rootLabel: '订单数',
  },
  {
    rootMetric: 'visitorCount',
    rootLabel: '访客数',
  },
  {
    rootMetric: 'conversionRate',
    rootLabel: '转化率',
    businessCauses: [
      businessCause('visitorOrderGrowthMismatch', '访客上升但订单未同步增长', '访客增长没有转化为订单增长，可能说明流量质量或承接效率存在问题。'),
      businessCause('productAttractiveness', '商品吸引力下降', '商品内容、卖点、评价或展示方式可能影响用户购买意愿。'),
      businessCause('priceCompetitiveness', '价格竞争力下降', '价格、优惠力度或同类商品竞争变化可能压低转化效率。'),
    ],
  },
  {
    rootMetric: 'roas',
    rootLabel: 'ROAS',
  },
  {
    rootMetric: 'refundRate',
    rootLabel: '退款率',
    businessCauses: [
      businessCause('productQualityIssue', '商品质量问题', '商品质量、描述一致性或用户预期偏差可能推高退款率。'),
      businessCause('fulfillmentExperienceIssue', '履约体验问题', '发货、物流、包装或售后体验异常可能造成退款率上升。'),
    ],
  },
];
