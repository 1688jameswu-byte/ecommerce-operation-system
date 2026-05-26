import { orderImportStorageDataSource } from '../data-source/orderImportStorageDataSource';
import { trafficConversionDataSource } from '../data-source/trafficConversionDataSource';
import type {
  AnalysisResultRecord,
  BaseFactRecord,
  FactDataQualityIssue,
  FactDataQualityReport,
  FactRecordKind,
  SalesOrderRecord,
  TrafficMetricRecord,
} from '../types/fact';

function isMissingStoreId(record: BaseFactRecord) {
  return !record.storeId || record.storeId === record.storeName;
}

function collectIssues(
  kind: FactRecordKind,
  records: BaseFactRecord[],
) {
  return records.flatMap((record) => {
    const missingFields: FactDataQualityIssue['missingFields'] = [];

    if (isMissingStoreId(record)) {
      missingFields.push('storeId');
    }
    if (!record.operatorId) {
      missingFields.push('operatorId');
    }
    if (!record.platform || record.platform === 'Other') {
      missingFields.push('platform');
    }
    if (!record.date) {
      missingFields.push('date');
    }

    return missingFields.length > 0
      ? [{ kind, storeName: record.storeName, date: record.date, missingFields }]
      : [];
  });
}

export function buildFactDataQualityReport(params: {
  salesOrders: SalesOrderRecord[];
  trafficRecords: TrafficMetricRecord[];
  analysisResults: AnalysisResultRecord[];
}): FactDataQualityReport {
  const issues = [
    ...collectIssues('sales', params.salesOrders),
    ...collectIssues('traffic', params.trafficRecords),
    ...collectIssues('analysis', params.analysisResults),
  ];

  return {
    totalRecords: params.salesOrders.length + params.trafficRecords.length + params.analysisResults.length,
    missingStoreIdCount: issues.filter((issue) => issue.missingFields.includes('storeId')).length,
    missingOperatorIdCount: issues.filter((issue) => issue.missingFields.includes('operatorId')).length,
    missingPlatformCount: issues.filter((issue) => issue.missingFields.includes('platform')).length,
    missingDateCount: issues.filter((issue) => issue.missingFields.includes('date')).length,
    issueSamples: issues.slice(0, 8),
  };
}

export function loadFactDataQualityReport(): FactDataQualityReport {
  return buildFactDataQualityReport({
    salesOrders: orderImportStorageDataSource.loadStandardSalesOrders(),
    trafficRecords: trafficConversionDataSource.loadStandardTrafficRecords(),
    analysisResults: trafficConversionDataSource.loadStandardAnalysisResults(),
  });
}
