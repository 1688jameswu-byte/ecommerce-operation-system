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

export function loadOperationDiagnosisDataSet(currentUser?: CurrentUser): StandardFactDataSet {
  const salesOrders = safeLoad(() => orderImportStorageDataSource.loadStandardSalesOrders(), []);
  const trafficMetrics = safeLoad(() => trafficConversionDataSource.loadStandardTrafficRecords(), []);
  const analysisResults = safeLoad(() => trafficConversionDataSource.loadStandardAnalysisResults(), []);

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

export function loadOperationDiagnosisData(currentUser?: CurrentUser): OperationDiagnosisResult {
  return runOperationDiagnosis(loadOperationDiagnosisDataSet(currentUser));
}
