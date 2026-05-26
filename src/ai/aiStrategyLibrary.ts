import type { AiPossibleReason, AiRecommendedAction } from './aiSuggestionTypes';

export type AiProblemType =
  | 'VISITOR_DROP'
  | 'ORDER_DROP'
  | 'CONVERSION_DROP'
  | 'SALES_DROP'
  | 'AD_SPEND_DROP'
  | 'AD_SPEND_UP_CONVERSION_DOWN'
  | 'EXPOSURE_DROP'
  | 'CTR_DROP';

export interface AiStrategy {
  possibleReasons: AiPossibleReason[];
  recommendedActions: AiRecommendedAction[];
}

const operatorOwner = 'store_operator';

export const aiStrategyLibrary: Record<AiProblemType, AiStrategy> = {
  VISITOR_DROP: {
    possibleReasons: [
      { reasonCode: 'platform_traffic_drop', reasonName: '平台自然流量下降', confidence: 'medium', evidence: ['访客指标出现下降'], needHumanCheck: true },
      { reasonCode: 'ad_exposure_drop', reasonName: '广告曝光减少', confidence: 'medium', evidence: ['访客下降可能由曝光入口减少导致'], needHumanCheck: true },
      { reasonCode: 'main_product_weight_drop', reasonName: '主推商品权重下降', confidence: 'medium', evidence: ['流量下降通常先集中在主推商品'], needHumanCheck: true },
      { reasonCode: 'activity_or_price_weakness', reasonName: '活动结束或价格竞争力下降', confidence: 'low', evidence: ['需要复核活动、价格和竞品变化'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'check_ad_budget_exposure_7d', actionName: '检查最近 7 天广告预算和曝光变化', priority: 'high', ownerRole: operatorOwner, actionSteps: ['查看同平台广告预算、曝光、点击趋势', '标记下降最大的广告计划或商品'], expectedEffect: '定位访客下降是否由投放入口减少引起', riskNote: '不要直接加预算，先确认曝光质量和转化承接' },
      { actionCode: 'check_main_product_visitor_rank', actionName: '检查主推商品访客排名是否下降', priority: 'high', ownerRole: operatorOwner, actionSteps: ['拉取主推商品近 7 天访客排序', '对比基准期排名和访客占比'], expectedEffect: '快速找到拖累店铺访客的核心商品', riskNote: '排名下降商品需结合库存、价格、评价一起判断' },
      { actionCode: 'compare_same_platform_stores', actionName: '对比同平台其他店铺是否同步下降', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['筛选相同 platform 的店铺', '比较访客变化是否集中在单店'], expectedEffect: '区分平台波动和单店问题', riskNote: '跨平台数据不可直接混比' },
      { actionCode: 'prioritize_biggest_visitor_drop', actionName: '优先处理访客下降最明显的商品或店铺', priority: 'high', ownerRole: operatorOwner, actionSteps: ['按访客下降绝对值排序', '先处理下降贡献最高的对象'], expectedEffect: '把处理动作集中到最大影响项', riskNote: '避免平均用力导致处理效率低' },
    ],
  },
  ORDER_DROP: {
    possibleReasons: [
      { reasonCode: 'visitor_drop', reasonName: '访客下降导致订单减少', confidence: 'medium', evidence: ['订单下降需要先拆访客和转化'], needHumanCheck: true },
      { reasonCode: 'conversion_drop', reasonName: '下单转化下降', confidence: 'medium', evidence: ['访客未变但订单下降时优先排查转化'], needHumanCheck: true },
      { reasonCode: 'stock_or_sku_issue', reasonName: '库存或 SKU 可售状态异常', confidence: 'medium', evidence: ['库存和规格会直接影响下单'], needHumanCheck: true },
      { reasonCode: 'offer_weakened', reasonName: '价格或优惠吸引力不足', confidence: 'low', evidence: ['需要与竞品价格和活动力度对比'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'split_order_drop_factors', actionName: '拆分订单下降来源', priority: 'high', ownerRole: operatorOwner, actionSteps: ['同时查看访客数、转化率、客单价', '判断订单下降主要来自流量还是转化'], expectedEffect: '明确订单下降主因，避免误判', riskNote: '只看订单数容易忽略流量结构变化' },
      { actionCode: 'check_stock_sku_sellable', actionName: '检查库存和 SKU 可售状态', priority: 'high', ownerRole: operatorOwner, actionSteps: ['检查主销 SKU 库存', '确认规格、价格、发货设置是否可下单'], expectedEffect: '排除无法购买导致的订单损失', riskNote: '库存恢复后仍需观察曝光是否恢复' },
      { actionCode: 'check_top_order_products', actionName: '检查主要成交商品是否异常', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['对比近期订单贡献 TOP 商品', '找出下降贡献最大的商品'], expectedEffect: '定位订单下降的关键商品', riskNote: '长尾商品波动不宜过度处理' },
    ],
  },
  CONVERSION_DROP: {
    possibleReasons: [
      { reasonCode: 'detail_page_weak', reasonName: '商品详情页承接不足', confidence: 'medium', evidence: ['转化指标异常'], needHumanCheck: true },
      { reasonCode: 'price_competitiveness_drop', reasonName: '价格竞争力下降', confidence: 'medium', evidence: ['转化下降常由价格或优惠变化触发'], needHumanCheck: true },
      { reasonCode: 'traffic_quality_mismatch', reasonName: '流量质量不匹配', confidence: 'medium', evidence: ['曝光或点击可能未带来有效购买人群'], needHumanCheck: true },
      { reasonCode: 'review_or_after_sale_issue', reasonName: '评价、售后或履约体验影响购买', confidence: 'low', evidence: ['需人工检查差评、退款和物流反馈'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'check_price_coupon_competitors', actionName: '检查价格、优惠和竞品变化', priority: 'high', ownerRole: operatorOwner, actionSteps: ['对比同平台竞品价格', '检查优惠券、活动价、运费是否变化'], expectedEffect: '确认是否因报价竞争力不足导致转化下降', riskNote: '降价前需评估毛利和库存压力' },
      { actionCode: 'check_detail_main_image_title', actionName: '检查主图、标题和详情页一致性', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['查看主图卖点是否清晰', '确认标题关键词与详情页承接一致'], expectedEffect: '提升点击后的购买承接效率', riskNote: '页面调整后需持续观察 3 到 7 天' },
      { actionCode: 'check_review_after_sale_feedback', actionName: '检查近 7 天评价和售后反馈', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['查看差评、退款原因、物流反馈', '标记高频问题'], expectedEffect: '找出阻碍下单的信任问题', riskNote: '评价问题通常恢复较慢，需要配合售后处理' },
    ],
  },
  SALES_DROP: {
    possibleReasons: [
      { reasonCode: 'visitor_or_order_drop', reasonName: '访客或订单下降', confidence: 'medium', evidence: ['销售额下降需拆分流量、转化、客单价'], needHumanCheck: true },
      { reasonCode: 'avg_order_value_drop', reasonName: '客单价下降', confidence: 'low', evidence: ['促销、低价商品占比提升会拉低销售额'], needHumanCheck: true },
      { reasonCode: 'main_product_sales_drop', reasonName: '主销商品销售下滑', confidence: 'medium', evidence: ['销售额通常由少数主销商品贡献'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'decompose_sales_drop', actionName: '拆解销售额下降为访客、转化、客单价', priority: 'high', ownerRole: operatorOwner, actionSteps: ['查看访客、订单、客单价变化', '判断销售额下降的最大贡献因子'], expectedEffect: '明确销售额下降处理方向', riskNote: '不要只根据销售额直接调整投放' },
      { actionCode: 'check_top_sku_sales', actionName: '检查 TOP 商品销售贡献变化', priority: 'high', ownerRole: operatorOwner, actionSteps: ['按销售额下降贡献排序商品', '优先复核主销商品库存、价格、曝光'], expectedEffect: '优先修复影响最大的销售来源', riskNote: '新品和低销量商品波动不应抢占处理优先级' },
    ],
  },
  AD_SPEND_DROP: {
    possibleReasons: [
      { reasonCode: 'budget_or_bid_drop', reasonName: '预算或出价下降', confidence: 'medium', evidence: ['广告花费下降'], needHumanCheck: true },
      { reasonCode: 'ad_delivery_limited', reasonName: '广告计划投放受限', confidence: 'medium', evidence: ['花费下降可能由计划状态、素材或商品状态导致'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'check_campaign_budget_bid', actionName: '检查广告预算、出价和计划状态', priority: 'high', ownerRole: operatorOwner, actionSteps: ['查看预算是否耗尽或降低', '检查计划、商品、素材状态'], expectedEffect: '确认广告花费下降是否为人为或系统限制', riskNote: '恢复预算前需确认转化和 ROAS' },
    ],
  },
  AD_SPEND_UP_CONVERSION_DOWN: {
    possibleReasons: [
      { reasonCode: 'low_quality_ad_traffic', reasonName: '广告带来低质量流量', confidence: 'medium', evidence: ['花费上升但转化下降'], needHumanCheck: true },
      { reasonCode: 'landing_page_mismatch', reasonName: '广告卖点和商品承接不匹配', confidence: 'medium', evidence: ['点击后转化未同步提升'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'pause_low_conversion_campaigns', actionName: '排查并收缩低转化广告计划', priority: 'high', ownerRole: operatorOwner, actionSteps: ['按花费和转化率排序广告计划', '暂停或降预算低转化计划', '保留高 ROAS 计划'], expectedEffect: '降低无效消耗并恢复投产效率', riskNote: '调整时避免一次性关闭全部流量入口' },
      { actionCode: 'align_ad_keywords_landing', actionName: '校准广告关键词、素材和落地商品', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['检查关键词与商品卖点是否匹配', '调整素材承诺与详情页一致'], expectedEffect: '提高广告流量购买意图匹配度', riskNote: '素材更新后需观察点击率和转化率共同变化' },
    ],
  },
  EXPOSURE_DROP: {
    possibleReasons: [
      { reasonCode: 'ranking_or_recommendation_drop', reasonName: '搜索或推荐曝光下降', confidence: 'medium', evidence: ['曝光指标下降'], needHumanCheck: true },
      { reasonCode: 'activity_exposure_end', reasonName: '活动曝光结束', confidence: 'low', evidence: ['需要核对活动周期'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'check_exposure_sources', actionName: '检查曝光来源变化', priority: 'high', ownerRole: operatorOwner, actionSteps: ['拆分自然、活动、广告曝光', '找出下降最大的来源'], expectedEffect: '定位曝光下降入口', riskNote: '不同平台曝光口径需用 platform 区分' },
      { actionCode: 'check_listing_competitiveness', actionName: '检查商品标题、主图、价格竞争力', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['复核关键词覆盖', '对比同平台竞品主图和价格'], expectedEffect: '改善商品重新获取曝光的基础条件', riskNote: '频繁改标题可能影响稳定性' },
    ],
  },
  CTR_DROP: {
    possibleReasons: [
      { reasonCode: 'creative_attraction_drop', reasonName: '主图或素材吸引力下降', confidence: 'medium', evidence: ['点击率下降'], needHumanCheck: true },
      { reasonCode: 'price_or_title_not_competitive', reasonName: '价格、标题或卖点竞争力不足', confidence: 'medium', evidence: ['曝光有但点击减少'], needHumanCheck: true },
    ],
    recommendedActions: [
      { actionCode: 'compare_ctr_creatives', actionName: '对比主图、标题和素材点击表现', priority: 'high', ownerRole: operatorOwner, actionSteps: ['查看点击率下降商品', '对比竞品首图、价格、标题卖点'], expectedEffect: '提升曝光后的点击效率', riskNote: '换图换标题需保留历史版本便于回溯' },
      { actionCode: 'test_high_intent_keywords', actionName: '测试更高购买意图关键词或卖点', priority: 'medium', ownerRole: operatorOwner, actionSteps: ['筛选高点击低转化词', '替换弱相关词和泛流量词'], expectedEffect: '提高点击质量并减少无效曝光', riskNote: '不要仅追求 CTR，需同时看转化' },
    ],
  },
};

export function getAiStrategy(problemType: AiProblemType): AiStrategy {
  return aiStrategyLibrary[problemType];
}
