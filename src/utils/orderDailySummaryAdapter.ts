import type { TemuOrderDetail } from '../types/order';

export interface OrderDailySummaryRecord {
  storeName: string;
  orderDate: string;
  salesAmount: number;
  firstOrderCount: number;
  orderCount: number;
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function buildOrderDetailsFromDailySummary(records: OrderDailySummaryRecord[]): TemuOrderDetail[] {
  return records.flatMap((record) => {
    const storeName = String(record.storeName || '').trim();
    const orderDate = String(record.orderDate || '').slice(0, 10);
    const orderCount = Math.max(0, Math.trunc(toFiniteNumber(record.orderCount)));
    const firstOrderCount = Math.max(0, Math.trunc(toFiniteNumber(record.firstOrderCount)));
    const salesAmount = toFiniteNumber(record.salesAmount);
    const count = orderCount > 0 ? orderCount : salesAmount > 0 ? 1 : 0;

    if (!storeName || !orderDate || count <= 0) {
      return [];
    }

    const perOrderSalesAmount = Number((salesAmount / count).toFixed(2));

    return Array.from({ length: count }, (_, index) => {
      const orderIndex = index + 1;
      const orderId = `daily:${storeName}:${orderDate}:${orderIndex}`;

      return {
        orderId,
        isFirstOrder: index < firstOrderCount,
        skc: '',
        skcCode: '',
        skuAttribute: '',
        skuCode: '',
        productSku: '',
        productName: '',
        declarePrice: 0,
        quantity: 0,
        orderTime: `${orderDate} 00:00:00`,
        orderDate,
        month: orderDate.slice(0, 7),
        status: '',
        storeName,
        salesAmount: perOrderSalesAmount,
        operatorName: '',
        uniqueKey: orderId,
      } satisfies TemuOrderDetail;
    });
  });
}
