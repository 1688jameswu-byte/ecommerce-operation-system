import { dashboardDataSource } from '../data-source';
import { orderImportStorageDataSource } from '../data-source/orderImportStorageDataSource';
import { trafficConversionDataSource } from '../data-source/trafficConversionDataSource';
import type { DashboardData, GrowthOpportunityItem, WarningItem, WarningLevel } from '../types/dashboard';
import { buildDashboardDataFromOrders } from '../utils/orderDashboardAdapter';
import type { TrafficWarningResult } from '../types/traffic';

const levelRank = { critical: 0, high: 1, medium: 2, low: 3 };

function toDashboardWarning(result: TrafficWarningResult): WarningItem {
  return {
    id: result.id,
    type: result.type,
    storeName: result.storeName,
    content: result.content,
    time: result.triggeredAt.replace('T', ' ').slice(11, 16),
    level: (result.level === 'critical' ? 'critical' : 'high') as WarningLevel,
  };
}

function getTrafficWarnings() {
  const ruleStore = trafficConversionDataSource.loadRuleStore();
  return trafficConversionDataSource
    .computeResults()
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
  return trafficConversionDataSource.computeGrowthOpportunities().map((item) => ({
    id: item.id,
    type: item.type,
    storeName: item.storeName,
    content: item.content,
    growthRate: item.growthRate,
  }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const orderImportResult = orderImportStorageDataSource.load();
  const trafficWarnings = getTrafficWarnings();
  const growthOpportunities = getGrowthOpportunities();

  if (orderImportResult) {
    return {
      ...buildDashboardDataFromOrders(orderImportResult),
      warnings: trafficWarnings,
      growthOpportunities,
    };
  }

  return {
    ...(await dashboardDataSource.getDashboardData()),
    warnings: trafficWarnings,
    growthOpportunities,
  };
}
