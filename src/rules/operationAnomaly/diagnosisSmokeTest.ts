import type { StandardFactDataSet } from '../../data-standard';
import type { SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';
import { runOperationDiagnosis } from './diagnosisEngine';

const smokeStore = {
  platform: 'Other' as const,
  storeId: 'smoke-store-001',
  storeName: 'Smoke Test Store',
  operatorId: 'smoke-operator-001',
  operatorName: 'Smoke Test Operator',
};

function dateKey(offsetFromStart: number) {
  const date = new Date('2026-05-01T00:00:00');
  date.setDate(date.getDate() + offsetFromStart);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateParts(date: string) {
  return {
    date,
    month: date.slice(0, 7),
    year: Number(date.slice(0, 4)),
    week: '2026-W18',
  };
}

function salesOrder(date: string, index: number, salesAmount: number): SalesOrderRecord {
  return {
    ...dateParts(date),
    ...smokeStore,
    orderId: `smoke-order-${date}-${index}`,
    salesAmount,
    orderAmount: salesAmount,
    quantity: 1,
    isFirstOrder: false,
    currency: 'CNY',
  };
}

function trafficMetric(date: string, visitorCount: number, orderCount: number): TrafficMetricRecord {
  return {
    ...dateParts(date),
    ...smokeStore,
    visitorCount,
    impressionCount: visitorCount * 10,
    conversionRate: orderCount / visitorCount,
    orderCount,
    totalViews: visitorCount * 10,
    totalVisitors: visitorCount,
    totalPayBuyers: orderCount,
    totalPayConversionRate: orderCount / visitorCount,
    totalPayPieces: orderCount,
    productViews: visitorCount * 10,
    productVisitors: visitorCount,
    detailPayBuyers: orderCount,
    detailPayConversionRate: orderCount / visitorCount,
    storePageViews: 0,
    storePageVisitors: 0,
    storePagePayBuyers: 0,
    storePagePayConversionRate: 0,
  };
}

function buildSalesOrders() {
  return Array.from({ length: 30 }, (_, dayIndex) => {
    const date = dateKey(dayIndex);
    const isRecentSevenDays = dayIndex >= 23;
    const orderCount = isRecentSevenDays ? 1 : 10;
    const salesAmount = isRecentSevenDays ? 10 : 100;

    return Array.from({ length: orderCount }, (_item, orderIndex) =>
      salesOrder(date, orderIndex + 1, salesAmount),
    );
  }).flat();
}

function buildTrafficMetrics() {
  return Array.from({ length: 30 }, (_, dayIndex) => {
    const isRecentSevenDays = dayIndex >= 23;
    return trafficMetric(
      dateKey(dayIndex),
      isRecentSevenDays ? 100 : 1000,
      isRecentSevenDays ? 1 : 10,
    );
  });
}

// Smoke test only: creates an in-memory StandardFactDataSet and never writes to data/*.json.
export function createOperationDiagnosisSmokeTestData(): StandardFactDataSet {
  const salesOrders = buildSalesOrders();
  const trafficMetrics = buildTrafficMetrics();

  return {
    salesOrders,
    trafficMetrics,
    analysisResults: [],
    warnings: [],
    meta: {
      platforms: [smokeStore.platform],
      generatedAt: new Date().toISOString(),
      recordCounts: {
        salesOrders: salesOrders.length,
        trafficMetrics: trafficMetrics.length,
        analysisResults: 0,
      },
    },
  };
}

export function runOperationDiagnosisSmokeTest() {
  return runOperationDiagnosis(createOperationDiagnosisSmokeTestData());
}
