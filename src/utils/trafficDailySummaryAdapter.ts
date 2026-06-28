import type { TrafficConversionRecord, TrafficDailySummaryItem } from '../types/traffic';

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function buildTrafficRecordsFromDailySummary(items: TrafficDailySummaryItem[]): TrafficConversionRecord[] {
  return items.flatMap((item) => {
    const storeName = String(item.storeName || '').trim();
    const date = String(item.date || '').slice(0, 10);

    if (!storeName || !date) {
      return [];
    }

    return [{
      batchId: item.importBatchId || `traffic-daily:${storeName}:${date}`,
      storeName,
      date,
      totalViews: toFiniteNumber(item.totalViews),
      totalVisitors: toFiniteNumber(item.totalVisitors),
      totalPayBuyers: toFiniteNumber(item.totalPayBuyers),
      totalPayConversionRate: toFiniteNumber(item.totalPayConversionRate),
      totalPayPieces: 0,
      productViews: toFiniteNumber(item.productViews),
      productVisitors: toFiniteNumber(item.productVisitors),
      detailPayBuyers: toFiniteNumber(item.detailPayBuyers),
      detailPayConversionRate: toFiniteNumber(item.detailPayConversionRate),
      storePageViews: 0,
      storePageVisitors: 0,
      storePagePayBuyers: 0,
      storePagePayConversionRate: 0,
      importedAt: item.updatedAt || '',
      fileName: 'traffic-daily-summary',
    } satisfies TrafficConversionRecord];
  });
}
