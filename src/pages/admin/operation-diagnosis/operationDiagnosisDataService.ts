import type { StandardFactDataSet } from '../../../data-standard';
import {
  orderImportStorageDataSource,
} from '../../../data-source/orderImportStorageDataSource';
import {
  trafficConversionDataSource,
} from '../../../data-source/trafficConversionDataSource';
import { runOperationDiagnosis, type OperationDiagnosisResult } from '../../../rules/operationAnomaly';
import type { CurrentUser } from '../../../types/auth';
import { filterFactDataSetByPermission } from '../../../utils/permissionScope';

function safeLoad<T>(loader: () => T, fallback: T) {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

function buildDataSet(
  salesOrders: StandardFactDataSet['salesOrders'],
  trafficMetrics: StandardFactDataSet['trafficMetrics'],
  analysisResults: StandardFactDataSet['analysisResults'],
  currentUser?: CurrentUser,
): StandardFactDataSet {
  return filterFactDataSetByPermission({
    salesOrders,
    trafficMetrics,
    analysisResults,
    warnings: [],
    meta: {
      platforms: Array.from(new Set([
        ...salesOrders.map((record) => record.platform),
        ...trafficMetrics.map((record) => record.platform),
        ...analysisResults.map((record) => record.platform),
      ].filter(Boolean))),
      generatedAt: new Date().toISOString(),
      recordCounts: {
        salesOrders: salesOrders.length,
        trafficMetrics: trafficMetrics.length,
        analysisResults: analysisResults.length,
      },
    },
  }, currentUser);
}

export function createEmptyOperationDiagnosisDataSet(currentUser?: CurrentUser): StandardFactDataSet {
  return buildDataSet([], [], [], currentUser);
}

export function loadOperationDiagnosisDataSet(currentUser?: CurrentUser): StandardFactDataSet {
  const trafficMetrics = safeLoad(() => trafficConversionDataSource.loadStandardTrafficRecords(), []);
  const analysisResults = safeLoad(() => trafficConversionDataSource.loadStandardAnalysisResults(), []);

  return buildDataSet([], trafficMetrics, analysisResults, currentUser);
}

export async function loadOperationDiagnosisDataSetAsync(currentUser?: CurrentUser): Promise<StandardFactDataSet> {
  const [orderStore, trafficMetrics, analysisResults] = await Promise.all([
    orderImportStorageDataSource.loadRecentStore({ recentDays: 30, limit: 500 }),
    Promise.resolve(safeLoad(() => trafficConversionDataSource.loadStandardTrafficRecords(), [])),
    Promise.resolve(safeLoad(() => trafficConversionDataSource.loadStandardAnalysisResults(), [])),
  ]);
  const salesOrders = orderImportStorageDataSource.buildStandardSalesOrdersFromStore(orderStore);

  return buildDataSet(salesOrders, trafficMetrics, analysisResults, currentUser);
}

export function loadOperationDiagnosisData(currentUser?: CurrentUser): OperationDiagnosisResult {
  return runOperationDiagnosis(loadOperationDiagnosisDataSet(currentUser));
}
