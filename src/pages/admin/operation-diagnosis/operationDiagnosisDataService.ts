import type { StandardFactDataSet } from '../../../data-standard';
import {
  trafficConversionDataSource,
} from '../../../data-source/trafficConversionDataSource';
import { runOperationDiagnosis, type OperationDiagnosisResult } from '../../../rules/operationAnomaly';
import type { CurrentUser } from '../../../types/auth';
import type { TrafficAnalysisItem, TrafficAnalysisResultStore, TrafficDailySummaryStore } from '../../../types/traffic';
import { buildStandardAnalysisResults, buildStandardSalesOrders, buildStandardTrafficRecords } from '../../../utils/factDataStandardization';
import { buildOrderDetailsFromDailySummary, type OrderDailySummaryRecord } from '../../../utils/orderDailySummaryAdapter';
import { filterFactDataSetByPermission } from '../../../utils/permissionScope';
import { buildTrafficRecordsFromDailySummary } from '../../../utils/trafficDailySummaryAdapter';

type OrderDailySummaryResponse = {
  records?: OrderDailySummaryRecord[];
};

const diagnosisDataSetCache = new Map<string, Promise<StandardFactDataSet>>();

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

async function fetchPersistentJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`/api/persistent-data/${name}`, { cache: 'no-store', credentials: 'include' });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

async function fetchJsonByUrl<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

function getDiagnosisCacheKey(currentUser?: CurrentUser) {
  return [
    currentUser?.role ?? '',
    currentUser?.operatorId ?? '',
    currentUser?.username ?? '',
    currentUser?.displayName ?? '',
    [...(currentUser?.allowedStoreIds ?? [])].sort().join('|'),
  ].join('::');
}

export function clearOperationDiagnosisDataSetCache() {
  diagnosisDataSetCache.clear();
}

export function createEmptyOperationDiagnosisDataSet(currentUser?: CurrentUser): StandardFactDataSet {
  return buildDataSet([], [], [], currentUser);
}

export function loadOperationDiagnosisDataSet(currentUser?: CurrentUser): StandardFactDataSet {
  const trafficMetrics = safeLoad(() => trafficConversionDataSource.loadStandardTrafficRecords(), []);
  const analysisResults = safeLoad(() => trafficConversionDataSource.loadStandardAnalysisResults(), []);

  return buildDataSet([], trafficMetrics, analysisResults, currentUser);
}

export async function loadOperationDiagnosisDataSetAsync(currentUser?: CurrentUser, options: { force?: boolean } = {}): Promise<StandardFactDataSet> {
  const cacheKey = getDiagnosisCacheKey(currentUser);
  const cached = diagnosisDataSetCache.get(cacheKey);

  if (cached && !options.force) {
    return cached;
  }

  const request = (async () => {
    const [orderSummary, trafficSummary, analysisStore] = await Promise.all([
      fetchJsonByUrl<OrderDailySummaryResponse>('/api/persistent-data/orderImportStore?view=store-business-daily&recentDays=30', { records: [] }),
      fetchPersistentJson<TrafficDailySummaryStore>('trafficDailySummary', { items: [], updatedAt: '' }),
      fetchPersistentJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>('businessAnalysisItems', { items: [], updatedAt: '' }),
    ]);
    const salesOrders = buildStandardSalesOrders(buildOrderDetailsFromDailySummary(orderSummary.records ?? []));
    const trafficMetrics = buildStandardTrafficRecords(buildTrafficRecordsFromDailySummary(trafficSummary.items ?? []));
    const analysisResults = buildStandardAnalysisResults(analysisStore.items ?? []);

    return buildDataSet(salesOrders, trafficMetrics, analysisResults, currentUser);
  })();

  diagnosisDataSetCache.set(cacheKey, request);
  return request;
}

export function loadOperationDiagnosisData(currentUser?: CurrentUser): OperationDiagnosisResult {
  return runOperationDiagnosis(loadOperationDiagnosisDataSet(currentUser));
}
