import type { RuleTree, RuleTreeCheckDirection, RuleTreeNode } from './ruleTreeTypes';
import { operationAnomalyRuleConfig } from './anomalyRuleConfig';

const {
  baselineWindowDays,
  declineThreshold,
  recentWindowDays,
} = operationAnomalyRuleConfig;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildMetricConditionText(metricKey: string, checkDirection: RuleTreeCheckDirection): string {
  const trendText = checkDirection === 'increase' ? '上升' : '下降';
  return `${metricKey} 最近${recentWindowDays}天日均较最近${baselineWindowDays}天基准${trendText}超过${formatPercent(declineThreshold)}。`;
}

function metricCheck(
  id: string,
  metricKey: string,
  label: string,
  explanation: string,
  checkDirection: RuleTreeCheckDirection = 'decline',
  futureMetric = false,
): RuleTreeNode {
  return {
    id,
    type: 'metricCheck',
    metricKey,
    label,
    conditionText: buildMetricConditionText(metricKey, checkDirection),
    children: [],
    causeKey: metricKey,
    explanation,
    checkDirection,
    futureMetric,
  };
}

function businessCause(id: string, label: string, explanation: string): RuleTreeNode {
  return {
    id,
    type: 'businessCause',
    metricKey: '',
    label,
    conditionText: '业务原因节点，不做数值判断。',
    children: [],
    causeKey: id,
    explanation,
  };
}

function rootNode(rootMetric: string, label: string, children: RuleTreeNode[]): RuleTreeNode {
  return {
    id: `${rootMetric}-root`,
    type: 'rootAnomaly',
    metricKey: rootMetric,
    label,
    conditionText: '根异常指标。',
    children,
    causeKey: rootMetric,
    explanation: `${label}异常的原因判断入口。`,
  };
}

export const ruleTreeLibrary: RuleTree[] = [
  {
    id: 'sales-amount-decline-rule-tree',
    name: '销售额下降规则树',
    rootMetric: 'salesAmount',
    relatedRuleIds: ['sales-amount-decline-v1'],
    nodes: [
      rootNode('salesAmount', '销售额下降', [
        metricCheck('sales-visitor-count-decline', 'visitorCount', '访客数下降', '访客数下降可能导致销售额下降。'),
        metricCheck('sales-conversion-rate-decline', 'conversionRate', '转化率下降', '转化率下降可能导致销售额下降。'),
        metricCheck('sales-aov-decline', 'avgOrderValue', '客单价下降', '客单价下降可能导致销售额下降。'),
      ]),
    ],
  },
  {
    id: 'order-count-decline-rule-tree',
    name: '订单数下降规则树',
    rootMetric: 'orderCount',
    relatedRuleIds: ['order-count-decline-v1'],
    nodes: [
      rootNode('orderCount', '订单数下降', [
        metricCheck('order-visitor-count-decline', 'visitorCount', '访客数下降', '访客数下降可能导致订单数下降。'),
        metricCheck('order-conversion-rate-decline', 'conversionRate', '转化率下降', '转化率下降可能导致订单数下降。'),
      ]),
    ],
  },
  {
    id: 'visitor-count-decline-rule-tree',
    name: '访客数下降规则树',
    rootMetric: 'visitorCount',
    relatedRuleIds: ['visitor-count-decline-v1'],
    nodes: [
      rootNode('visitorCount', '访客数下降', [
        metricCheck('visitor-impression-count-decline', 'impressionCount', '曝光数下降', '曝光数下降可能导致访客数下降。'),
        metricCheck('visitor-ctr-decline', 'ctr', '点击率下降', '点击率下降可能导致访客数下降。'),
      ]),
    ],
  },
  {
    id: 'conversion-rate-rule-tree',
    name: '转化率下降/过低规则树',
    rootMetric: 'conversionRate',
    relatedRuleIds: ['low-conversion-rate-v1', 'high-visitor-low-conversion-v1'],
    nodes: [
      rootNode('conversionRate', '转化率下降/过低', [
        metricCheck('conversion-visitor-order-mismatch', 'visitorOrderMismatch', '访客上升但订单未同步增长', '访客增长没有转化为订单增长，可能说明流量质量或承接效率异常。', 'mismatch'),
        metricCheck('conversion-order-count-decline', 'orderCount', '订单数下降', '订单数下降会直接拉低转化率。'),
        businessCause('productAttractiveness', '商品吸引力不足', '商品内容、卖点、评价或展示方式可能影响用户购买意愿。'),
        businessCause('priceCompetitiveness', '价格竞争力不足', '价格、优惠力度或同类商品竞争变化可能压低转化效率。'),
        businessCause('detailPageMaterialFit', '详情页/素材承接不足', '主图、标题、详情页或素材与用户需求不匹配，可能造成转化承接不足。'),
      ]),
    ],
  },
  {
    id: 'roas-decline-rule-tree',
    name: 'ROAS 下降规则树',
    rootMetric: 'roas',
    relatedRuleIds: [],
    nodes: [
      rootNode('roas', 'ROAS 下降', [
        metricCheck('roas-sales-amount-decline', 'salesAmount', '销售额下降', '销售额下降可能导致 ROAS 下降。'),
        metricCheck('roas-ad-spend-increase', 'adSpend', '广告花费上升', '广告花费上升且销售未同步增长时，可能导致 ROAS 下降。', 'increase'),
      ]),
    ],
  },
  {
    id: 'refund-rate-increase-rule-tree',
    name: '退款率上升规则树',
    rootMetric: 'refundRate',
    relatedRuleIds: [],
    nodes: [
      rootNode('refundRate', '退款率上升', [
        metricCheck('refund-refund-amount-increase', 'refundAmount', '退款金额上升', '退款金额上升可能导致退款率上升。', 'increase', true),
        metricCheck('refund-sales-amount-decline', 'salesAmount', '销售额下降', '销售额下降可能抬高退款率。'),
        businessCause('productQualityIssue', '商品质量问题', '商品质量、描述一致性或用户预期偏差可能推高退款率。'),
        businessCause('fulfillmentExperienceIssue', '履约体验问题', '发货、物流、包装或售后体验异常可能造成退款率上升。'),
      ]),
    ],
  },
];
