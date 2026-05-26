import { dashboardDataSource } from '../data-source';
import { orderImportStorageDataSource } from '../data-source/orderImportStorageDataSource';
import { trafficConversionDataSource } from '../data-source/trafficConversionDataSource';
import type { DashboardData, GrowthOpportunityItem, WarningItem, WarningLevel } from '../types/dashboard';
import { buildDashboardDataFromOrders } from '../utils/orderDashboardAdapter';
import type { TrafficWarningResult } from '../types/traffic';

const levelRank = { critical: 0, high: 1, medium: 2, low: 3 };

function toDashboardWarning(result: TrafficWarningResult): WarningItem {
  return {
    id: result.id || `${result.storeName || 'unknown'}-${result.type || 'traffic'}-${result.date || Date.now()}`,
    type: result.type || 'traffic',
    storeName: result.storeName || '-',
    content: result.content || '-',
    time: (result.triggeredAt || result.date || '').replace('T', ' ').slice(11, 16),
    level: (result.level === 'critical' ? 'critical' : 'high') as WarningLevel,
  };
}

function getTrafficWarnings() {
  const ruleStore = trafficConversionDataSource.loadRuleStore();
  return trafficConversionDataSource
    .loadRiskResults()
    .filter((result) => result.level !== 'insufficient')
    .sort((first, second) => {
      const firstLevel = levelRank[toDashboardWarning(first).level];
      const secondLevel = levelRank[toDashboardWarning(second).level];
      return firstLevel - secondLevel || second.dropRate - first.dropRate || second.sortWeight - first.sortWeight;
    })
    .slice(0, ruleStore.settings.displayLimit)
    .map(toDashboardWarning);
}

function getGrowthOpportunities(): GrowthOpportunityItem[] {
  return trafficConversionDataSource.loadGrowthOpportunities().map((item) => ({
    id: item.id || `${item.storeName || 'unknown'}-${item.type || 'traffic'}-${Date.now()}`,
    type: item.type || 'traffic',
    storeName: item.storeName || '-',
    content: item.content || '-',
    growthRate: Number.isFinite(item.growthRate) ? item.growthRate : 0,
  }));
}

function safeTrafficWarnings() {
  try {
    return getTrafficWarnings();
  } catch {
    return [];
  }
}

function safeGrowthOpportunities() {
  try {
    return getGrowthOpportunities();
  } catch {
    return [];
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const trafficWarnings = safeTrafficWarnings();
  const growthOpportunities = safeGrowthOpportunities();

  try {
    const orderImportResult = orderImportStorageDataSource.load();

    if (orderImportResult && orderImportResult.orders.length > 0) {
      const standardSalesOrders = orderImportStorageDataSource.loadStandardSalesOrders();
      return {
        ...buildDashboardDataFromOrders(orderImportResult, standardSalesOrders),
        dataSource: '真实数据',
        warnings: trafficWarnings,
        growthOpportunities,
      };
    }
  } catch {
    // Fall back to mock data when production JSON is missing or malformed.
  }

  return {
    ...(await dashboardDataSource.getDashboardData()),
    dataSource: 'Mock 数据',
    warnings: trafficWarnings,
    growthOpportunities,
  };
}
