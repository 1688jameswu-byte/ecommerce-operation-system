import * as XLSX from 'xlsx';
import type { ExcelImportPreview, ExcelSheetPreview } from '../types/import';
import type { TemuOrderDetail, TemuOrderImportResult } from '../types/order';
import type { ExternalDataSourceAdapter } from './sourceTypes';

const PREVIEW_ROW_LIMIT = 5;

function normalizeCellValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  return value;
}

function buildSheetPreview(workbook: XLSX.WorkBook, sheetName: string): ExcelSheetPreview {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return {
    name: sheetName,
    rowCount: rows.length,
    headers,
    rows: rows.slice(0, PREVIEW_ROW_LIMIT).map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeCellValue(value)])),
    ),
  };
}

export async function parseExcelFile(file: File): Promise<ExcelImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });

  return {
    fileName: file.name,
    importedAt: new Date().toISOString(),
    sheets: workbook.SheetNames.map((sheetName) => buildSheetPreview(workbook, sheetName)),
  };
}

const orderFieldMap = {
  orderId: '订单号',
  isFirstOrder: '是否首单',
  skc: 'SKC',
  skcCode: 'SKC货号',
  skuAttribute: 'SKU 属性',
  skuCode: 'SKU货号',
  productSku: '商品SKU',
  productName: '商品名称',
  declarePrice: '申报价格',
  quantity: '备货数量',
  orderTime: '下单时间',
  status: '状态',
  storeName: '店铺',
} as const;

function getCell(row: Record<string, unknown>, header: string) {
  return row[header] ?? row[header.replace(/\s+/g, '')] ?? '';
}

function parsePrice(value: unknown) {
  const normalized = String(value ?? '').replace(/CNY/i, '').replace(/,/g, '').trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOrderTime(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  const text = String(value ?? '').trim();
  const normalized = text.replace(/\//g, '-');
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => String(value ?? '').trim() === '');
}

function normalizeOrderRow(row: Record<string, unknown>, rowIndex: number): TemuOrderDetail | null {
  if (isBlankRow(row)) {
    return null;
  }

  const orderTimeDate = parseOrderTime(getCell(row, orderFieldMap.orderTime));
  const orderId = String(getCell(row, orderFieldMap.orderId)).trim();
  const skc = String(getCell(row, orderFieldMap.skc)).trim();
  const skuCode = String(getCell(row, orderFieldMap.skuCode)).trim();
  const declarePrice = parsePrice(getCell(row, orderFieldMap.declarePrice));
  const quantity = parseQuantity(getCell(row, orderFieldMap.quantity));

  const orderTime = orderTimeDate ? formatDateTime(orderTimeDate) : '';
  const orderDate = orderTime.slice(0, 10);
  const month = orderTime.slice(0, 7);

  return {
    orderId,
    isFirstOrder: String(getCell(row, orderFieldMap.isFirstOrder)).trim() === '是',
    skc,
    skcCode: String(getCell(row, orderFieldMap.skcCode)).trim(),
    skuAttribute: String(getCell(row, orderFieldMap.skuAttribute)).trim(),
    skuCode,
    productSku: String(getCell(row, orderFieldMap.productSku)).trim(),
    productName: String(getCell(row, orderFieldMap.productName)).trim(),
    declarePrice,
    quantity,
    orderTime,
    orderDate,
    month,
    status: String(getCell(row, orderFieldMap.status)).trim(),
    storeName: String(getCell(row, orderFieldMap.storeName)).trim() || '未知店铺',
    salesAmount: Number((declarePrice * quantity).toFixed(2)),
    operatorName: '未分配运营',
    uniqueKey: String(rowIndex),
  };
}

export async function parseTemuOrderExcelFile(file: File): Promise<TemuOrderImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });
  const rows = workbook.SheetNames.flatMap((sheetName) =>
    XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: '',
    }),
  );
  const orders = rows
    .map((row, index) => normalizeOrderRow(row, index))
    .filter((order): order is TemuOrderDetail => Boolean(order));

  return {
    fileName: file.name,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    validRows: orders.length,
    duplicateRows: 0,
    orders,
  };
}

export const excelDataSource: ExternalDataSourceAdapter = {
  type: 'excel',
  label: 'Excel导入',
  enabled: true,
};
