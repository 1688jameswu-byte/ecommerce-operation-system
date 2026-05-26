import { getPlatformAdapter } from '../adapters/platform';
import type { PlatformAdapterInput, PlatformAdapterOutput, PlatformType } from '../adapters/platform';
import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../types/fact';

export interface StandardFactDataSet {
  salesOrders: SalesOrderRecord[];
  trafficMetrics: TrafficMetricRecord[];
  analysisResults: AnalysisResultRecord[];
  warnings: string[];
  meta: {
    platforms: string[];
    generatedAt: string;
    recordCounts: {
      salesOrders: number;
      trafficMetrics: number;
      analysisResults: number;
    };
  };
}

export type StandardFactDataInput = PlatformAdapterInput | PlatformAdapterInput[];

function toInputs(input: StandardFactDataInput): PlatformAdapterInput[] {
  return Array.isArray(input) ? input : [input];
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function appendBaseWarnings(
  warnings: string[],
  kind: string,
  records: Array<{ platform?: unknown; storeId?: unknown; storeName?: unknown; date?: unknown }>,
) {
  records.forEach((record, index) => {
    if (!hasValue(record.platform)) {
      warnings.push(`${kind}[${index}] missing platform.`);
    }
    if (!hasValue(record.storeId) && !hasValue(record.storeName)) {
      warnings.push(`${kind}[${index}] missing storeId and storeName.`);
    }
    if (!hasValue(record.date)) {
      warnings.push(`${kind}[${index}] missing date.`);
    }
  });
}

function appendSalesWarnings(warnings: string[], records: SalesOrderRecord[]) {
  appendBaseWarnings(warnings, 'salesOrders', records);

  records.forEach((record, index) => {
    if (!hasValue(record.salesAmount)) {
      warnings.push(`salesOrders[${index}] missing salesAmount.`);
    }
  });
}

function appendTrafficWarnings(warnings: string[], records: TrafficMetricRecord[]) {
  appendBaseWarnings(warnings, 'trafficMetrics', records);

  records.forEach((record, index) => {
    if (!hasValue(record.visitorCount)) {
      warnings.push(`trafficMetrics[${index}] missing visitorCount.`);
    }
    if (!hasValue(record.conversionRate)) {
      warnings.push(`trafficMetrics[${index}] missing conversionRate.`);
    }
  });
}

function appendAnalysisWarnings(warnings: string[], records: AnalysisResultRecord[]) {
  appendBaseWarnings(warnings, 'analysisResults', records);
}

function collectOutput(input: PlatformAdapterInput, warnings: string[]): PlatformAdapterOutput {
  const adapter = getPlatformAdapter(input.platform);

  if (!adapter) {
    warnings.push(`No platform adapter found for ${input.platform}.`);
    return {};
  }

  return adapter.adapt(input);
}

export function getStandardFactData(input: StandardFactDataInput): StandardFactDataSet {
  const inputs = toInputs(input);
  const warnings: string[] = [];
  const salesOrders: SalesOrderRecord[] = [];
  const trafficMetrics: TrafficMetricRecord[] = [];
  const analysisResults: AnalysisResultRecord[] = [];
  const platforms = new Set<PlatformType>();

  inputs.forEach((item) => {
    platforms.add(item.platform);
    const output = collectOutput(item, warnings);

    salesOrders.push(...(output.salesOrders ?? []));
    trafficMetrics.push(...(output.trafficMetrics ?? []));
    analysisResults.push(...(output.analysisResults ?? []));
    warnings.push(...(output.warnings ?? []));
  });

  appendSalesWarnings(warnings, salesOrders);
  appendTrafficWarnings(warnings, trafficMetrics);
  appendAnalysisWarnings(warnings, analysisResults);

  return {
    salesOrders,
    trafficMetrics,
    analysisResults,
    warnings,
    meta: {
      platforms: Array.from(platforms),
      generatedAt: new Date().toISOString(),
      recordCounts: {
        salesOrders: salesOrders.length,
        trafficMetrics: trafficMetrics.length,
        analysisResults: analysisResults.length,
      },
    },
  };
}
