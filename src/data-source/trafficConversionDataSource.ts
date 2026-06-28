import * as XLSX from 'xlsx';
import { readPersistentJson, writePersistentJson, writePersistentJsonAsync } from './fileStorageDataSource';
import { analyzeStoreNameMatches, createStoreMatcher } from '../utils/storeStandardization';
import { storeDataSource } from './storeDataSource';
import { buildStandardAnalysisResults, buildStandardTrafficRecords } from '../utils/factDataStandardization';
import type { AnalysisResultRecord, TrafficMetricRecord } from '../types/fact';
import type {
  TrafficAnalysisItem,
  TrafficAnalysisResultLevel,
  TrafficAnalysisResultStore,
  TrafficConversionMetricField,
  TrafficConversionRecord,
  TrafficConversionStore,
  TrafficDailySummaryItem,
  TrafficDailySummaryStore,
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
const TRAFFIC_SUMMARY_KEY = 'trafficDailySummary';
const ORDER_SUMMARY_KEY = 'orderDailySummary';
const RISK_RESULTS_KEY = 'riskResults';
const GROWTH_RESULTS_KEY = 'growthOpportunities';
const BUSINESS_ANALYSIS_KEY = 'businessAnalysisItems';
const TRAFFIC_CONVERSION_CHANGE_EVENT = 'traffic-conversion-data-change';
type StoreMatcher = ReturnType<typeof createStoreMatcher>;

const trafficAnalysisThresholds = {
  criticalRiskRate: -20,
  mediumRiskRate: -10,
  slightFluctuationRate: -3,
  opportunityRate: 10,
  riskThresholdRate: 10,
  growthThresholdRate: 10,
};

function getStoreSnapshot(storeName: string) {
  const stores = storeDataSource.load();
  const identity = createStoreMatcher(stores).match(storeName);
  const store = stores.find((item) => item.id === identity.storeId || item.storeName === identity.storeName);

  return {
    storeId: store?.id || identity.storeId || '',
    storeName: store?.storeName || identity.storeName || storeName,
    platform: store?.platform || 'Other',
    platformStoreId: store?.platformStoreId || '',
  };
}

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
  salesAmount: '销售额',
  orderCount: '订单数',
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

type TrafficImportColumn = keyof Omit<TrafficConversionRecord, 'batchId' | 'platform' | 'storeId' | 'platformStoreId' | 'storeName' | 'importedAt' | 'fileName'>;
type NumericTrafficImportColumn = Exclude<TrafficImportColumn, 'date'>;

const headerMap: Record<string, TrafficImportColumn> = {
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
const defaultTrafficColumnOrder = Array.from(new Set(Object.values(headerMap)));

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

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(value: unknown) {
  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return formatDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  const text = String(value ?? '').trim();
  const matched = text.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (matched) {
    return formatDateParts(Number(matched[1]), Number(matched[2]), Number(matched[3]));
  }

  return '';
}

function isFirstColumnDate(rows: unknown[][]) {
  return rows.slice(0, 5).filter((row) => parseDate(row[0])).length >= 3;
}

function buildTrafficRecord(
  row: unknown[],
  fields: Array<TrafficImportColumn | undefined>,
  storeName: string,
  importedAt: string,
  fileName: string,
) {
  const dateIndex = fields.findIndex((field) => field === 'date');
  const date = parseDate(row[dateIndex]);
  if (!date) {
    return null;
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
    fileName,
  };

  fields.forEach((field, index) => {
    if (field === 'date') {
      record.date = parseDate(row[index]);
    } else if (field) {
      record[field as NumericTrafficImportColumn] = toNumber(row[index]);
    }
  });

  return record.date ? record : null;
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

function average(records: TrafficConversionRecord[], field: TrafficConversionMetricField, dates: string[]) {
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

function storeDateKey(record: Pick<TrafficConversionRecord, 'storeName' | 'date'>, storeMatcher: StoreMatcher) {
  return `${storeMatcher.match(record.storeName).key}|${record.date}`;
}

function groupTrafficRecordsByStore(records: TrafficConversionRecord[]) {
  const storeMatcher = createStoreMatcher();
  const groups = new Map<string, { storeName: string; records: TrafficConversionRecord[] }>();

  analyzeStoreNameMatches(records.map((record) => record.storeName));

  for (const record of records) {
    const identity = storeMatcher.match(record.storeName);
    const current = groups.get(identity.key) ?? { storeName: identity.storeName, records: [] };
    current.records.push(record);
    groups.set(identity.key, current);
  }

  return Array.from(groups.entries()).map(([storeKey, group]) => ({ storeKey, ...group }));
}

function normalizeStoreInferText(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function inferStoreName(fileName: string) {
  const normalizedFileName = normalizeStoreInferText(fileName);
  const matchedStore = storeDataSource.load()
    .find((store) => store.storeName && normalizedFileName.includes(normalizeStoreInferText(store.storeName)));

  if (matchedStore?.storeName) {
    return matchedStore.storeName;
  }

  return fileName.replace(/\.(xlsx|xls|csv)$/i, '').replace(/销售数据|店铺|流量|转化|数据|\d+|\.|-/g, '').trim();
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

function buildMetrics(storeRecords: TrafficConversionRecord[], latestDate: string, field: TrafficConversionMetricField) {
  const endDate = new Date(latestDate);
  const previousEndDate = new Date(endDate);
  previousEndDate.setDate(endDate.getDate() - 7);
  const previous30Dates = dateKeys(previousEndDate, 30);
  const recent7Dates = dateKeys(endDate, 7);
  const previous30 = average(storeRecords, field, previous30Dates);
  const recent7 = average(storeRecords, field, recent7Dates);
  const hasEnoughData = previous30.count > 0 && recent7.count > 0 && previous30.value > 0;
  const dropRate = hasEnoughData ? Math.max(((previous30.value - recent7.value) / previous30.value) * 100, 0) : 0;
  const growthRate = hasEnoughData ? Math.max(((recent7.value - previous30.value) / previous30.value) * 100, 0) : 0;
  const changeRate = hasEnoughData ? ((recent7.value - previous30.value) / previous30.value) * 100 : 0;

  return {
    previous30Avg: previous30.value,
    recent7Avg: recent7.value,
    previous30Count: previous30.count,
    recent7Count: recent7.count,
    hasEnoughData,
    dropRate,
    growthRate,
    changeRate,
  };
}

function signedPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatAnalysisMetricValue(field: TrafficMetricField, value: number) {
  return field === 'detailPayConversionRate' || /rate|conversion/i.test(field)
    ? `${(value * 100).toFixed(2)}%`
    : value.toFixed(2);
}

function classifyAnalysisResult(metrics: ReturnType<typeof buildMetrics>): {
  resultType: TrafficAnalysisItem['resultType'];
  resultLevel: TrafficAnalysisResultLevel;
  resultLabel: string;
  level: TrafficAnalysisItem['level'];
} {
  if (!metrics.hasEnoughData || metrics.recent7Count < 7 || metrics.previous30Avg <= 0) {
    return {
      resultType: 'insufficient',
      resultLevel: 'insufficient',
      resultLabel: '数据不足',
      level: 'insufficient',
    };
  }

  if (metrics.changeRate <= trafficAnalysisThresholds.criticalRiskRate) {
    return {
      resultType: 'risk',
      resultLevel: 'critical',
      resultLabel: '严重风险',
      level: 'critical',
    };
  }

  if (metrics.changeRate <= trafficAnalysisThresholds.mediumRiskRate) {
    return {
      resultType: 'risk',
      resultLevel: 'medium_risk',
      resultLabel: '中度风险',
      level: 'warning',
    };
  }

  if (metrics.changeRate < trafficAnalysisThresholds.slightFluctuationRate) {
    return {
      resultType: 'normal',
      resultLevel: 'slight_fluctuation',
      resultLabel: '轻微波动',
      level: 'normal',
    };
  }

  if (metrics.changeRate >= trafficAnalysisThresholds.opportunityRate) {
    return {
      resultType: 'opportunity',
      resultLevel: 'opportunity',
      resultLabel: '增长机会',
      level: 'opportunity',
    };
  }

  return {
    resultType: 'normal',
    resultLevel: 'normal',
    resultLabel: '正常',
    level: 'normal',
  };
}

function buildAnalysisContent(field: TrafficMetricField, metrics: ReturnType<typeof buildMetrics>, resultLabel: string) {
  const metricName = metricFieldLabels[field];

  if (!metrics.hasEnoughData || metrics.recent7Count < 7 || metrics.previous30Avg <= 0) {
    return `${metricName}数据不足：前30日可用样本 ${metrics.previous30Count} 天，近7日可用样本 ${metrics.recent7Count} 天，暂不判定风险或增长机会。`;
  }

  const trendText = metrics.changeRate > 0 ? '增长' : metrics.changeRate < 0 ? '下降' : '持平';
  const absChangeRate = Math.abs(metrics.changeRate).toFixed(2);
  const recentText = formatAnalysisMetricValue(field, metrics.recent7Avg);
  const previousText = formatAnalysisMetricValue(field, metrics.previous30Avg);

  if (resultLabel === '严重风险' || resultLabel === '中度风险') {
    return `${metricName}近7日均值 ${recentText}，较前30日均值 ${previousText} ${trendText} ${absChangeRate}%，超过风险阈值 ${trafficAnalysisThresholds.riskThresholdRate}%，判定为${resultLabel}。`;
  }

  if (resultLabel === '轻微波动') {
    return `${metricName}近7日均值 ${recentText}，较前30日均值 ${previousText} ${trendText} ${absChangeRate}%，未达到风险阈值 ${trafficAnalysisThresholds.riskThresholdRate}%，判定为轻微波动。`;
  }

  if (resultLabel === '增长机会') {
    return `${metricName}近7日均值 ${recentText}，较前30日均值 ${previousText} ${trendText} ${absChangeRate}%，达到增长机会阈值 ${trafficAnalysisThresholds.growthThresholdRate}%，建议关注近期商品、价格、活动或流量质量变化。`;
  }

  return `${metricName}近7日均值 ${recentText}，较前30日均值 ${previousText} ${trendText} ${absChangeRate}%，处于正常波动范围。`;
}

function buildBatch(records: TrafficConversionRecord[], coveredCount: number, batchId: string): TrafficImportBatch {
  const dates = records.map((record) => record.date).sort();
  const firstRecord = records[0];
  const snapshot = getStoreSnapshot(firstRecord?.storeName || '');
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
    importedAt: firstRecord?.importedAt || new Date().toISOString(),
    storeId: firstRecord?.storeId || snapshot.storeId,
    storeName: firstRecord?.storeName || snapshot.storeName || '未知店铺',
    platform: firstRecord?.platform || snapshot.platform,
    platformStoreId: firstRecord?.platformStoreId || snapshot.platformStoreId,
    fileName: firstRecord?.fileName || '',
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

function emptySummaryStore(): TrafficDailySummaryStore {
  return { items: [], updatedAt: '' };
}

function emptyResultStore<T>(): TrafficAnalysisResultStore<T> {
  return { items: [], updatedAt: '' };
}

function buildTrafficDailySummary(records: TrafficConversionRecord[]): TrafficDailySummaryStore {
  const updatedAt = new Date().toISOString();
  const storeMatcher = createStoreMatcher();
  const groups = new Map<string, { storeName: string; records: TrafficConversionRecord[] }>();

  for (const record of records) {
    const identity = storeMatcher.match(record.storeName);
    const key = `${identity.key}|${record.date}`;
    const current = groups.get(key) ?? { storeName: identity.storeName, records: [] };
    current.records.push(record);
    groups.set(key, current);
  }

  const items: TrafficDailySummaryItem[] = Array.from(groups.values())
    .map((group) => {
      const latest = group.records.slice().sort((first, second) => second.importedAt.localeCompare(first.importedAt))[0];
      const avg = (field: 'detailPayConversionRate' | 'totalPayConversionRate') =>
        group.records.length ? group.records.reduce((total, record) => total + record[field], 0) / group.records.length : 0;

      return {
        date: latest.date,
        storeName: group.storeName,
        productVisitors: group.records.reduce((total, record) => total + record.productVisitors, 0),
        detailPayConversionRate: avg('detailPayConversionRate'),
        totalPayBuyers: group.records.reduce((total, record) => total + record.totalPayBuyers, 0),
        totalViews: group.records.reduce((total, record) => total + record.totalViews, 0),
        totalVisitors: group.records.reduce((total, record) => total + record.totalVisitors, 0),
        totalPayConversionRate: avg('totalPayConversionRate'),
        productViews: group.records.reduce((total, record) => total + record.productViews, 0),
        detailPayBuyers: group.records.reduce((total, record) => total + record.detailPayBuyers, 0),
        importBatchId: latest.batchId ?? '',
        updatedAt,
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date) || first.storeName.localeCompare(second.storeName));

  return { items, updatedAt };
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
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const importedAt = new Date().toISOString();
  const storeName = storeNameInput.trim() || inferStoreName(file.name) || '未知店铺';
  const searchableParts = [file.name, ...workbook.SheetNames];
  let hasDateColumn = false;
  const records = workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
    searchableParts.push(...rows.flatMap((row) => row.map((cell) => String(cell ?? ''))));
    const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === '日期'));
    const hasHeaderDate = headerIndex >= 0;
    const hasFirstColumnDate = !hasHeaderDate && isFirstColumnDate(rows);
    if (!hasHeaderDate && !hasFirstColumnDate) {
      return [];
    }

    const nextHeaders = hasHeaderDate ? rows[headerIndex + 1]?.map(normalizeHeader) ?? [] : [];
    const headers = hasFirstColumnDate
      ? defaultTrafficColumnOrder
      : nextHeaders.includes('总浏览量')
        ? rows[headerIndex].map((_cell, index) => (index === 0 ? '日期' : nextHeaders[index] || '')).map((header) => headerMap[header])
        : rows[headerIndex].map(normalizeHeader).map((header) => headerMap[header]);
    const dataStartIndex = hasFirstColumnDate ? 0 : nextHeaders.includes('总浏览量') ? headerIndex + 2 : headerIndex + 1;

    hasDateColumn = true;

    return rows.slice(dataStartIndex).flatMap((row) => {
      const record = buildTrafficRecord(row, headers, storeName, importedAt, file.name);
      return record ? [record] : [];
    });
  });

  if (!hasDateColumn || records.length === 0) {
    throw new Error('导入失败：未识别到有效日期列，请确认 Excel 中包含日期字段。');
  }

  return { records, storeName, importedAt, fileName: file.name, searchableText: searchableParts.join('\n') };
}

export const trafficConversionDataSource = {
  loadStore(): TrafficConversionStore {
    return normalizeStore(readPersistentJson<TrafficConversionStore>(DATA_KEY, emptyStore()));
  },

  async loadBatchPage(params: { page?: number; pageSize?: number; storeName?: string; importDate?: string; dataDate?: string; status?: string } = {}) {
    const search = new URLSearchParams({
      view: 'records',
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 20),
    });
    if (params.storeName) search.set('storeName', params.storeName);
    if (params.importDate) search.set('importDate', params.importDate);
    if (params.dataDate) search.set('dataDate', params.dataDate);
    if (params.status) search.set('status', params.status);
    const response = await fetch(`/api/persistent-data/${DATA_KEY}?${search.toString()}&t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.trim().startsWith('<') ? '导入失败：服务器接口异常，请查看 PM2 日志或检查上传大小限制。' : text || '流量导入批次读取失败');
    }
    return response.json() as Promise<{
      batches: TrafficImportBatch[];
      total: number;
      page: number;
      pageSize: number;
      stores: string[];
      missingTrafficItems: Array<{ storeName: string; date: string }>;
    }>;
  },

  async loadBatchDetail(batchId: string) {
    const search = new URLSearchParams({ view: 'detail', batchId });
    const response = await fetch(`/api/persistent-data/${DATA_KEY}?${search.toString()}&t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.trim().startsWith('<') ? '导入失败：服务器接口异常，请查看 PM2 日志或检查上传大小限制。' : text || '流量导入明细读取失败');
    }
    return response.json() as Promise<{ records: TrafficConversionRecord[]; total: number }>;
  },

  loadTrafficDailySummary(): TrafficDailySummaryStore {
    return readPersistentJson<TrafficDailySummaryStore>(TRAFFIC_SUMMARY_KEY, emptySummaryStore());
  },

  loadStandardTrafficRecords(): TrafficMetricRecord[] {
    return buildStandardTrafficRecords(this.loadStore().records);
  },

  loadRiskResults(): TrafficWarningResult[] {
    const store = readPersistentJson<TrafficAnalysisResultStore<TrafficWarningResult>>(RISK_RESULTS_KEY, emptyResultStore<TrafficWarningResult>());
    return store.updatedAt ? store.items ?? [] : this.regenerateAnalysisResults().riskResults;
  },

  loadGrowthOpportunities(limit = 5): TrafficGrowthOpportunity[] {
    const store = readPersistentJson<TrafficAnalysisResultStore<TrafficGrowthOpportunity>>(GROWTH_RESULTS_KEY, emptyResultStore<TrafficGrowthOpportunity>());
    const items = store.updatedAt ? store.items ?? [] : this.regenerateAnalysisResults().growthOpportunities;
    return items.slice(0, limit);
  },

  loadBusinessAnalysisItems(): TrafficAnalysisItem[] {
    const store = readPersistentJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>(BUSINESS_ANALYSIS_KEY, emptyResultStore<TrafficAnalysisItem>());
    return store.updatedAt ? store.items ?? [] : this.regenerateAnalysisResults().businessAnalysisItems;
  },

  loadStandardAnalysisResults(): AnalysisResultRecord[] {
    return buildStandardAnalysisResults(this.loadBusinessAnalysisItems());
  },

  regenerateAnalysisResults() {
    const updatedAt = new Date().toISOString();
    const summary = buildTrafficDailySummary(this.loadStore().records);
    const riskResults = this.computeResults();
    const growthOpportunities = this.computeGrowthOpportunities(999);
    const businessAnalysisItems = this.computeAnalysisItems();

    writePersistentJson(ORDER_SUMMARY_KEY, readPersistentJson(ORDER_SUMMARY_KEY, { items: [], updatedAt }));
    writePersistentJson(TRAFFIC_SUMMARY_KEY, summary);
    writePersistentJson(RISK_RESULTS_KEY, { items: riskResults, updatedAt } satisfies TrafficAnalysisResultStore<TrafficWarningResult>);
    writePersistentJson(GROWTH_RESULTS_KEY, { items: growthOpportunities, updatedAt } satisfies TrafficAnalysisResultStore<TrafficGrowthOpportunity>);
    writePersistentJson(BUSINESS_ANALYSIS_KEY, { items: businessAnalysisItems, updatedAt } satisfies TrafficAnalysisResultStore<TrafficAnalysisItem>);
    notifyTrafficConversionChange();

    return { summary, riskResults, growthOpportunities, businessAnalysisItems };
  },

  save(records: TrafficConversionRecord[], options?: { searchableText?: string }) {
    const store = this.loadStore();
    const storeMatcher = createStoreMatcher();
    const incomingKeys = new Set(records.map((record) => storeDateKey(record, storeMatcher)));
    const coveredCount = store.records.filter((record) => incomingKeys.has(storeDateKey(record, storeMatcher))).length;
    const existing = store.records.filter((record) => !incomingKeys.has(storeDateKey(record, storeMatcher)));
    const batchId = `traffic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const recordsWithBatch = records.map((record) => {
      const snapshot = getStoreSnapshot(record.storeName);
      return {
        ...record,
        batchId,
        storeId: record.storeId || snapshot.storeId,
        storeName: snapshot.storeName,
        platform: record.platform || snapshot.platform,
        platformStoreId: record.platformStoreId || snapshot.platformStoreId,
      };
    });
    const batch = buildBatch(recordsWithBatch, coveredCount, batchId);

    writePersistentJson(DATA_KEY, {
      records: [...existing, ...recordsWithBatch],
      batches: [...(store.batches ?? []), batch],
    } satisfies TrafficConversionStore, { trafficImportSearchableText: options?.searchableText });
    this.regenerateAnalysisResults();

    return { coveredCount, newCount: batch.newCount, batch };
  },

  async saveAsync(records: TrafficConversionRecord[], options?: { searchableText?: string }) {
    const batchId = `traffic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const recordsWithBatch = records.map((record) => {
      const snapshot = getStoreSnapshot(record.storeName);
      return {
        ...record,
        batchId,
        storeId: record.storeId || snapshot.storeId,
        storeName: snapshot.storeName,
        platform: record.platform || snapshot.platform,
        platformStoreId: record.platformStoreId || snapshot.platformStoreId,
      };
    });
    const responseText = await writePersistentJsonAsync(DATA_KEY, {
      records: recordsWithBatch,
    } satisfies TrafficConversionStore, {
      trafficImportSearchableText: options?.searchableText,
      appendImportBatch: true,
    });
    const response = responseText ? JSON.parse(responseText) as { batch?: TrafficImportBatch } : {};
    const batch = response.batch ?? buildBatch(recordsWithBatch, 0, batchId);

    return {
      coveredCount: batch.coveredCount,
      newCount: batch.newCount,
      batch,
    };
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
    } satisfies TrafficConversionStore, { deleteImportData: true });
    this.regenerateAnalysisResults();

    return true;
  },

  async deleteBatchAsync(batchId: string) {
    const responseText = await writePersistentJsonAsync(DATA_KEY, { batchId }, { deleteImportData: true });
    const response = responseText ? JSON.parse(responseText) as {
      success?: boolean;
      message?: string;
      trafficDeleteSummary?: { deleted?: boolean };
    } : {};

    if (response.success === false) {
      throw new Error(response.message || '删除失败');
    }

    return response.trafficDeleteSummary?.deleted !== false;
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
    this.regenerateAnalysisResults();
  },

  computeResults(): TrafficWarningResult[] {
    const { records } = this.loadStore();
    const { rules } = this.loadRuleStore();

    return groupTrafficRecordsByStore(records).flatMap(({ storeKey, storeName, records: storeRecords }) => {
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
          id: `${storeKey}-${rule.id}-${latestDate}`,
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

    return groupTrafficRecordsByStore(records)
      .flatMap(({ storeKey, storeName, records: storeRecords }) => {
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
            id: `${storeKey}-${rule.id}-${latestDate}`,
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
    const { rules } = this.loadRuleStore();

    return groupTrafficRecordsByStore(records).flatMap(({ storeKey, storeName, records: storeRecords }) => {
      const latestDate = storeRecords.map((record) => record.date).sort().at(-1);
      if (!latestDate) {
        return [];
      }

      return rules.map((riskRule) => {
        const metrics = buildMetrics(storeRecords, latestDate, riskRule.metricField);
        const classification = classifyAnalysisResult(metrics);
        const changeRate = Number(metrics.changeRate.toFixed(2));
        return {
          id: `${storeKey}-${riskRule.id}-analysis-${latestDate}`,
          date: latestDate,
          storeName,
          type: riskRule.type,
          metricField: riskRule.metricField,
          previous30Avg: Number(metrics.previous30Avg.toFixed(4)),
          recent7Avg: Number(metrics.recent7Avg.toFixed(4)),
          changeRate,
          changeRateText: signedPercent(changeRate),
          resultType: classification.resultType,
          resultLevel: classification.resultLevel,
          resultLabel: classification.resultLabel,
          level: classification.level,
          content: buildAnalysisContent(riskRule.metricField, metrics, classification.resultLabel),
        } satisfies TrafficAnalysisItem;
      });
    });
  },
};
