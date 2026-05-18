import * as XLSX from 'xlsx';
import { readPersistentJson, writePersistentJson } from './fileStorageDataSource';
import type {
  TrafficAnalysisItem,
  TrafficConversionRecord,
  TrafficConversionStore,
  TrafficGrowthOpportunity,
  TrafficGrowthRuleConfig,
  TrafficImportBatch,
  TrafficImportStatus,
  TrafficMetricField,
  TrafficWarningResult,
  TrafficWarningRuleConfig,
  TrafficWarningRuleStore,
  TrafficWarningType,
} from '../types/traffic';

const DATA_KEY = 'trafficConversionStore';
const RULE_KEY = 'trafficWarningRules';
const TRAFFIC_CONVERSION_CHANGE_EVENT = 'traffic-conversion-data-change';

export const trafficTypeLabels: Record<TrafficWarningType, string> = {
  traffic: '流量异常',
  conversion: '转化异常',
  deal: '成交异常',
};

export const trafficGrowthTypeLabels: Record<TrafficWarningType, string> = {
  traffic: '流量增长',
  conversion: '转化增长',
  deal: '成交增长',
};

export const metricFieldLabels: Record<TrafficMetricField, string> = {
  productVisitors: '商品访客数',
  detailPayConversionRate: '商详支付转化率',
  totalPayBuyers: '总支付买家数',
};

export const defaultTrafficWarningRules: TrafficWarningRuleConfig[] = [
  {
    id: 'traffic',
    name: '流量异常',
    type: 'traffic',
    metricField: 'productVisitors',
    yellowThreshold: 20,
    redThreshold: 35,
    enabled: true,
    sortWeight: 30,
    remark: '近7日商品访客数低于前30日均值',
  },
  {
    id: 'conversion',
    name: '转化异常',
    type: 'conversion',
    metricField: 'detailPayConversionRate',
    yellowThreshold: 15,
    redThreshold: 25,
    enabled: true,
    sortWeight: 20,
    remark: '近7日商详支付转化率低于前30日均值',
  },
  {
    id: 'deal',
    name: '成交异常',
    type: 'deal',
    metricField: 'totalPayBuyers',
    yellowThreshold: 25,
    redThreshold: 40,
    enabled: true,
    sortWeight: 10,
    remark: '近7日总支付买家数低于前30日均值',
  },
];

export const defaultTrafficGrowthRules: TrafficGrowthRuleConfig[] = [
  {
    id: 'traffic-growth',
    name: '流量增长',
    type: 'traffic',
    metricField: 'productVisitors',
    growthThreshold: 20,
    enabled: true,
    sortWeight: 30,
    remark: '近7日商品访客数高于前30日均值',
  },
  {
    id: 'conversion-growth',
    name: '转化增长',
    type: 'conversion',
    metricField: 'detailPayConversionRate',
    growthThreshold: 15,
    enabled: true,
    sortWeight: 20,
    remark: '近7日商详支付转化率高于前30日均值',
  },
  {
    id: 'deal-growth',
    name: '成交增长',
    type: 'deal',
    metricField: 'totalPayBuyers',
    growthThreshold: 25,
    enabled: true,
    sortWeight: 10,
    remark: '近7日总支付买家数高于前30日均值',
  },
];

const headerMap: Record<string, keyof Omit<TrafficConversionRecord, 'batchId' | 'storeName' | 'importedAt' | 'fileName'>> = {
  日期: 'date',
  总浏览量: 'totalViews',
  总访客数: 'totalVisitors',
  总支付买家数: 'totalPayBuyers',
  总支付转化率: 'totalPayConversionRate',
  总支付件数: 'totalPayPieces',
  商品浏览量: 'productViews',
  商品访客数: 'productVisitors',
  商详支付买家数: 'detailPayBuyers',
  商详支付转化率: 'detailPayConversionRate',
  店铺页浏览量: 'storePageViews',
  店铺页面访客数: 'storePageVisitors',
  店铺页支付买家数: 'storePagePayBuyers',
  店铺页支付转化率: 'storePagePayConversionRate',
};

function emptyStore(): TrafficConversionStore {
  return { records: [], batches: [] };
}

function normalizeStore(store: TrafficConversionStore): TrafficConversionStore {
  const records = store.records ?? [];
  const legacyBatchIds = new Map<string, string>();
  const normalizedRecords = records.map((record) => {
    if (record.batchId) {
      return record;
    }

    const groupKey = `${record.storeName}|${record.fileName}|${record.importedAt}`;
    const batchId = legacyBatchIds.get(groupKey) ?? `legacy-${encodeURIComponent(groupKey)}`;
    legacyBatchIds.set(groupKey, batchId);
    return { ...record, batchId };
  });
  const batchIds = new Set((store.batches ?? []).map((batch) => batch.id));
  const legacyBatches = Array.from(legacyBatchIds.values()).flatMap((batchId) => {
    if (batchIds.has(batchId)) {
      return [];
    }

    const batchRecords = normalizedRecords.filter((record) => record.batchId === batchId);
    return [buildBatch(batchRecords, 0, batchId)];
  });

  return {
    records: normalizedRecords,
    batches: [...(store.batches ?? []), ...legacyBatches],
  };
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function toNumber(value: unknown) {
  const raw = String(value ?? '').replace(/%|,/g, '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return raw.includes('%') ? parsed / 100 : parsed;
}

function parseDate(value: unknown) {
  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = String(value ?? '').trim().replace(/\//g, '-');
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : formatDate(date);
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeys(endDate: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (days - 1 - index));
    return formatDate(date);
  });
}

function average(records: TrafficConversionRecord[], field: TrafficMetricField, dates: string[]) {
  const byDate = new Map(records.map((record) => [record.date, record[field]]));
  const values = dates.flatMap((date) => {
    const value = byDate.get(date);
    return value === undefined || value === null || Number.isNaN(value) ? [] : [value];
  });

  return {
    value: values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0,
    count: values.length,
  };
}

function inferStoreName(fileName: string) {
  return fileName.replace(/\.(xlsx|xls|csv)$/i, '').replace(/销售数据|流量|转化|数据|\d+|\.|-/g, '').trim();
}

function normalizeRuleStore(store: TrafficWarningRuleStore): TrafficWarningRuleStore {
  return {
    settings: { displayLimit: store.settings?.displayLimit || 5 },
    rules: store.rules?.length ? store.rules : defaultTrafficWarningRules,
    growthRules: store.growthRules?.length ? store.growthRules : defaultTrafficGrowthRules,
  };
}

function typePriority(type: TrafficWarningType) {
  return type === 'deal' ? 0 : type === 'conversion' ? 1 : 2;
}

function buildMetrics(storeRecords: TrafficConversionRecord[], latestDate: string, field: TrafficMetricField) {
  const endDate = new Date(latestDate);
  const previous30Dates = dateKeys(endDate, 30);
  const recent7Dates = previous30Dates.slice(-7);
  const previous30 = average(storeRecords, field, previous30Dates);
  const recent7 = average(storeRecords, field, recent7Dates);
  const hasEnoughData = previous30.count > 0 && recent7.count > 0 && previous30.value > 0;
  const dropRate = hasEnoughData ? Math.max(((previous30.value - recent7.value) / previous30.value) * 100, 0) : 0;
  const growthRate = hasEnoughData ? Math.max(((recent7.value - previous30.value) / previous30.value) * 100, 0) : 0;

  return {
    previous30Avg: previous30.value,
    recent7Avg: recent7.value,
    hasEnoughData,
    dropRate,
    growthRate,
  };
}

function buildBatch(records: TrafficConversionRecord[], coveredCount: number, batchId: string): TrafficImportBatch {
  const dates = records.map((record) => record.date).sort();
  const productVisitorsTotal = records.reduce((total, record) => total + record.productVisitors, 0);
  const totalPayBuyersTotal = records.reduce((total, record) => total + record.totalPayBuyers, 0);
  const detailPayConversionRateAvg = records.length
    ? records.reduce((total, record) => total + record.detailPayConversionRate, 0) / records.length
    : 0;
  const hasAbnormal = records.some((record) =>
    record.productVisitors < 0 ||
    record.totalPayBuyers < 0 ||
    record.detailPayConversionRate < 0,
  );
  const status: TrafficImportStatus = records.length === 0
    ? 'missing'
    : hasAbnormal
      ? 'abnormal'
      : coveredCount > 0
        ? 'covered'
        : 'success';

  return {
    id: batchId,
    importedAt: records[0]?.importedAt ?? new Date().toISOString(),
    storeName: records[0]?.storeName ?? '未知店铺',
    fileName: records[0]?.fileName ?? '',
    dateStart: dates[0] ?? '',
    dateEnd: dates.at(-1) ?? '',
    detailCount: records.length,
    coveredCount,
    newCount: Math.max(records.length - coveredCount, 0),
    productVisitorsTotal,
    totalPayBuyersTotal,
    detailPayConversionRateAvg,
    status,
    recordKeys: records.map((record) => `${record.storeName}|${record.date}`),
  };
}

function notifyTrafficConversionChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TRAFFIC_CONVERSION_CHANGE_EVENT));
  }
}

export function subscribeTrafficConversionChange(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(TRAFFIC_CONVERSION_CHANGE_EVENT, callback);
  return () => window.removeEventListener(TRAFFIC_CONVERSION_CHANGE_EVENT, callback);
}

export async function parseTrafficConversionExcelFile(file: File, storeNameInput: string) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const importedAt = new Date().toISOString();
  const storeName = storeNameInput.trim() || inferStoreName(file.name) || '未知店铺';
  const records = workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === '日期'));
    if (headerIndex < 0) {
      return [];
    }

    const nextHeaders = rows[headerIndex + 1]?.map(normalizeHeader) ?? [];
    const headers = nextHeaders.includes('总浏览量')
      ? rows[headerIndex].map((_cell, index) => (index === 0 ? '日期' : nextHeaders[index] || ''))
      : rows[headerIndex].map(normalizeHeader);
    const dataStartIndex = nextHeaders.includes('总浏览量') ? headerIndex + 2 : headerIndex + 1;

    return rows.slice(dataStartIndex).flatMap((row) => {
      const dateIndex = headers.findIndex((header) => header === '日期');
      const date = parseDate(row[dateIndex]);
      if (!date) {
        return [];
      }

      const record: TrafficConversionRecord = {
        storeName,
        date,
        totalViews: 0,
        totalVisitors: 0,
        totalPayBuyers: 0,
        totalPayConversionRate: 0,
        totalPayPieces: 0,
        productViews: 0,
        productVisitors: 0,
        detailPayBuyers: 0,
        detailPayConversionRate: 0,
        storePageViews: 0,
        storePageVisitors: 0,
        storePagePayBuyers: 0,
        storePagePayConversionRate: 0,
        importedAt,
        fileName: file.name,
      };

      headers.forEach((header, index) => {
        const field = headerMap[header];
        if (field === 'date') {
          record.date = parseDate(row[index]);
        } else if (field) {
          record[field] = toNumber(row[index]);
        }
      });

      return record.date ? [record] : [];
    });
  });

  return { records, storeName, importedAt, fileName: file.name };
}

export const trafficConversionDataSource = {
  loadStore(): TrafficConversionStore {
    return normalizeStore(readPersistentJson<TrafficConversionStore>(DATA_KEY, emptyStore()));
  },

  save(records: TrafficConversionRecord[]) {
    const store = this.loadStore();
    const incomingKeys = new Set(records.map((record) => `${record.storeName}|${record.date}`));
    const coveredCount = store.records.filter((record) => incomingKeys.has(`${record.storeName}|${record.date}`)).length;
    const existing = store.records.filter((record) => !incomingKeys.has(`${record.storeName}|${record.date}`));
    const batchId = `traffic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const recordsWithBatch = records.map((record) => ({ ...record, batchId }));
    const batch = buildBatch(recordsWithBatch, coveredCount, batchId);

    writePersistentJson(DATA_KEY, {
      records: [...existing, ...recordsWithBatch],
      batches: [...(store.batches ?? []), batch],
    } satisfies TrafficConversionStore);
    notifyTrafficConversionChange();

    return { coveredCount, newCount: batch.newCount, batch };
  },

  deleteBatch(batchId: string) {
    const store = this.loadStore();
    const batch = (store.batches ?? []).find((item) => item.id === batchId);
    if (!batch) {
      return false;
    }

    writePersistentJson(DATA_KEY, {
      records: store.records.filter((record) => record.batchId !== batchId),
      batches: (store.batches ?? []).filter((item) => item.id !== batchId),
    } satisfies TrafficConversionStore);
    notifyTrafficConversionChange();

    return true;
  },

  loadRuleStore(): TrafficWarningRuleStore {
    return normalizeRuleStore(readPersistentJson<TrafficWarningRuleStore>(RULE_KEY, {
      settings: { displayLimit: 5 },
      rules: defaultTrafficWarningRules,
      growthRules: defaultTrafficGrowthRules,
    }));
  },

  saveRuleStore(store: TrafficWarningRuleStore) {
    writePersistentJson(RULE_KEY, normalizeRuleStore(store));
    notifyTrafficConversionChange();
  },

  computeResults(): TrafficWarningResult[] {
    const { records } = this.loadStore();
    const { rules } = this.loadRuleStore();
    const recordsByStore = new Map<string, TrafficConversionRecord[]>();

    for (const record of records) {
      recordsByStore.set(record.storeName, [...(recordsByStore.get(record.storeName) ?? []), record]);
    }

    return Array.from(recordsByStore.entries()).flatMap(([storeName, storeRecords]) => {
      const latestDate = storeRecords.map((record) => record.date).sort().at(-1);
      if (!latestDate) {
        return [];
      }

      return rules.filter((rule) => rule.enabled).map((rule) => {
        const metrics = buildMetrics(storeRecords, latestDate, rule.metricField);
        const level = !metrics.hasEnoughData
          ? 'insufficient'
          : metrics.dropRate >= rule.redThreshold
            ? 'critical'
            : metrics.dropRate >= rule.yellowThreshold
              ? 'warning'
              : 'insufficient';
        const content = level === 'insufficient'
          ? '数据不足，暂不触发预警'
          : `${metricFieldLabels[rule.metricField]}近7日均值较前30日下降 ${metrics.dropRate.toFixed(2)}%`;

        return {
          id: `${storeName}-${rule.id}-${latestDate}`,
          date: latestDate,
          storeName,
          type: rule.type,
          ruleName: rule.name,
          metricField: rule.metricField,
          previous30Avg: Number(metrics.previous30Avg.toFixed(4)),
          recent7Avg: Number(metrics.recent7Avg.toFixed(4)),
          dropRate: Number(metrics.dropRate.toFixed(2)),
          level,
          triggeredAt: new Date().toISOString(),
          content,
          sortWeight: rule.sortWeight,
        } satisfies TrafficWarningResult;
      });
    });
  },

  computeGrowthOpportunities(limit = 5): TrafficGrowthOpportunity[] {
    const { records } = this.loadStore();
    const { growthRules } = this.loadRuleStore();
    const recordsByStore = new Map<string, TrafficConversionRecord[]>();

    for (const record of records) {
      recordsByStore.set(record.storeName, [...(recordsByStore.get(record.storeName) ?? []), record]);
    }

    return Array.from(recordsByStore.entries())
      .flatMap(([storeName, storeRecords]) => {
        const latestDate = storeRecords.map((record) => record.date).sort().at(-1);
        if (!latestDate) {
          return [];
        }

        return growthRules.filter((rule) => rule.enabled).flatMap((rule) => {
          const metrics = buildMetrics(storeRecords, latestDate, rule.metricField);
          if (!metrics.hasEnoughData || metrics.growthRate < rule.growthThreshold) {
            return [];
          }

          return [{
            id: `${storeName}-${rule.id}-${latestDate}`,
            date: latestDate,
            storeName,
            type: rule.type,
            metricField: rule.metricField,
            previous30Avg: Number(metrics.previous30Avg.toFixed(4)),
            recent7Avg: Number(metrics.recent7Avg.toFixed(4)),
            growthRate: Number(metrics.growthRate.toFixed(2)),
            content: `${metricFieldLabels[rule.metricField]}近7日较前30日增长 ${metrics.growthRate.toFixed(2)}%`,
            sortWeight: rule.sortWeight,
          } satisfies TrafficGrowthOpportunity];
        });
      })
      .sort((first, second) => typePriority(first.type) - typePriority(second.type) || second.growthRate - first.growthRate)
      .slice(0, limit);
  },

  computeAnalysisItems(): TrafficAnalysisItem[] {
    const { records } = this.loadStore();
    const { rules, growthRules } = this.loadRuleStore();
    const recordsByStore = new Map<string, TrafficConversionRecord[]>();

    for (const record of records) {
      recordsByStore.set(record.storeName, [...(recordsByStore.get(record.storeName) ?? []), record]);
    }

    return Array.from(recordsByStore.entries()).flatMap(([storeName, storeRecords]) => {
      const latestDate = storeRecords.map((record) => record.date).sort().at(-1);
      if (!latestDate) {
        return [];
      }

      return rules.map((riskRule) => {
        const growthRule = growthRules.find((item) => item.type === riskRule.type);
        const metrics = buildMetrics(storeRecords, latestDate, riskRule.metricField);
        let resultType: TrafficAnalysisItem['resultType'] = 'normal';
        let level: TrafficAnalysisItem['level'] = 'normal';
        let changeRate = 0;
        let content = '未触发风险或增长机会';

        if (!metrics.hasEnoughData) {
          resultType = 'insufficient';
          level = 'insufficient';
          content = '数据不足，仅在详细列表展示';
        } else if (metrics.dropRate >= riskRule.redThreshold) {
          resultType = 'risk';
          level = 'critical';
          changeRate = metrics.dropRate;
          content = `${metricFieldLabels[riskRule.metricField]}近7日均值较前30日下降 ${metrics.dropRate.toFixed(2)}%`;
        } else if (metrics.dropRate >= riskRule.yellowThreshold) {
          resultType = 'risk';
          level = 'warning';
          changeRate = metrics.dropRate;
          content = `${metricFieldLabels[riskRule.metricField]}近7日均值较前30日下降 ${metrics.dropRate.toFixed(2)}%`;
        } else if (growthRule?.enabled && metrics.growthRate >= growthRule.growthThreshold) {
          resultType = 'opportunity';
          level = 'opportunity';
          changeRate = metrics.growthRate;
          content = `${metricFieldLabels[riskRule.metricField]}近7日较前30日增长 ${metrics.growthRate.toFixed(2)}%`;
        }

        return {
          id: `${storeName}-${riskRule.id}-analysis-${latestDate}`,
          date: latestDate,
          storeName,
          type: riskRule.type,
          metricField: riskRule.metricField,
          previous30Avg: Number(metrics.previous30Avg.toFixed(4)),
          recent7Avg: Number(metrics.recent7Avg.toFixed(4)),
          changeRate: Number(changeRate.toFixed(2)),
          resultType,
          level,
          content,
        } satisfies TrafficAnalysisItem;
      });
    });
  },
};
