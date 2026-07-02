import * as XLSX from 'xlsx';
import type { ExcelImportPreview, ExcelSheetPreview } from '../types/import';
import type { TemuOrderDetail, TemuOrderImportResult } from '../types/order';
import { storeDataSource } from './storeDataSource';
import type { ExternalDataSourceAdapter } from './sourceTypes';
import type { StoreRecord } from '../types/store';

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
  productSku: 'SKU ID',
  productName: '商品名称',
  declarePrice: '申报价格',
  quantity: '备货数量',
  orderTime: '下单时间',
  status: '状态',
  storeName: '店铺',
} as const;

type OrderField = keyof typeof orderFieldMap;

const requiredOrderFields: OrderField[] = ['orderId', 'orderTime', 'storeName', 'declarePrice', 'quantity'];
const orderHeaderAliases: Record<OrderField, string[]> = {
  orderId: ['订单号', '父订单号', '子订单号', '订单编号', '订单ID', 'Order ID', 'Parent Order ID', 'Sub Order ID'],
  isFirstOrder: ['是否首单', '首单'],
  skc: ['SKC'],
  skcCode: ['SKC货号', 'SKC 货号'],
  skuAttribute: ['SKU 属性', 'SKU属性'],
  skuCode: ['SKU货号', 'SKU 货号', 'SKU编码'],
  productSku: ['SKU ID', 'SKUID', '商品SKU', '商品 SKU'],
  productName: ['商品名称', '商品名'],
  declarePrice: ['申报价格', '申报价', '商品申报价格', '商品申报价', '申报价格(CNY)', '申报价格（CNY）', '申报金额', '商品单价', '单价', '价格'],
  quantity: ['备货数量', '备货数', '备货件数', '购买数量', '商品数量', '数量', '件数', '销量'],
  orderTime: ['下单时间', '下单日期', '订单时间', '订单创建时间', '付款时间', '支付时间', '创建时间'],
  status: ['状态', '订单状态'],
  storeName: ['店铺', '店铺名称', '店铺名', '所属店铺', '店铺账号', '店铺主体'],
};

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[：:()（）【】\[\]{}《》<>]/g, '')
    .trim()
    .toLowerCase();
}

function headerMatches(header: unknown, alias: string) {
  const normalizedHeader = normalizeHeader(header);
  const normalizedAlias = normalizeHeader(alias);

  if (!normalizedHeader || !normalizedAlias) {
    return false;
  }

  return normalizedHeader === normalizedAlias || normalizedHeader.includes(normalizedAlias);
}

function getCell(row: Record<string, unknown>, field: OrderField) {
  const aliases = orderHeaderAliases[field] ?? [orderFieldMap[field]];
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);

  for (const alias of aliases) {
    const value = row[alias] ?? row[alias.replace(/\s+/g, '')];
    if (value !== undefined) {
      return value;
    }

    const normalizedAlias = normalizeHeader(alias);
    const matched = normalizedEntries.find(([key]) => key === normalizedAlias || key.includes(normalizedAlias));
    if (matched) {
      return matched[1];
    }
  }

  return '';
}

function buildRowsFromSheet(sheet: XLSX.WorkSheet) {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
  });
  const headerIndex = rawRows.findIndex((row) => {
    return requiredOrderFields.every((field) =>
      orderHeaderAliases[field].some((alias) => row.some((header) => headerMatches(header, alias))),
    );
  });

  if (headerIndex < 0) {
    return { rows: [], missingHeaders: requiredOrderFields.map((field) => orderFieldMap[field]) };
  }

  const headers = rawRows[headerIndex].map((header) => String(header ?? '').trim());
  const missingHeaders = requiredOrderFields
    .filter((field) => !orderHeaderAliases[field].some((alias) => headers.some((header) => headerMatches(header, alias))))
    .map((field) => orderFieldMap[field]);
  const rows = rawRows.slice(headerIndex + 1).map((rawRow) =>
    Object.fromEntries(headers.map((header, index) => [header, rawRow[index] ?? ''])),
  );

  return { rows, missingHeaders };
}

const UNKNOWN_STORE_NAME = '未知店铺';

function cleanStoreName(value: unknown) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .trim();
}

function normalizeStoreKey(value: string) {
  return cleanStoreName(value).replace(/\s+/g, '').toLocaleLowerCase();
}

function normalizeStoreAlias(value: string) {
  const key = normalizeStoreKey(value);

  if (key === 'h点' || key === 'h店' || key === 'honeyjewels') {
    return 'H店';
  }

  return value;
}

function loadStoreRecords() {
  try {
    return storeDataSource.load();
  } catch {
    return [];
  }
}

function normalizeImportedStoreName(value: unknown, stores: ReturnType<typeof loadStoreRecords>) {
  const rawName = cleanStoreName(value);
  const name = normalizeStoreAlias(rawName || UNKNOWN_STORE_NAME);
  const normalizedKey = normalizeStoreKey(name);
  const exactMatch = stores.find((store) =>
    [store.storeName, store.id, store.platformStoreId]
      .filter(Boolean)
      .some((key) => normalizeStoreKey(String(key)) === normalizedKey),
  );

  if (exactMatch) {
    return exactMatch.storeName;
  }

  if (name.includes('�')) {
    const fallbackName = cleanStoreName(name.replace(/�+/g, ''));
    const fallbackKey = normalizeStoreKey(fallbackName);
    const fallbackMatches = stores.filter((store) => normalizeStoreKey(store.storeName).startsWith(fallbackKey));

    if (fallbackKey && fallbackMatches.length === 1) {
      return fallbackMatches[0].storeName;
    }

    if (/^[a-z0-9]+$/i.test(fallbackName)) {
      return `${fallbackName}店`;
    }
  }

  return name;
}

function getMatchedStore(value: string, normalizedStoreName: string, stores: StoreRecord[]) {
  const keys = [value, normalizedStoreName].map(normalizeStoreKey).filter(Boolean);
  return stores.find((store) =>
    [store.storeName, store.id, store.platformStoreId]
      .filter(Boolean)
      .some((key) => keys.includes(normalizeStoreKey(String(key)))),
  );
}

function buildStoreNameMappings(mappings: Map<string, string>, stores: StoreRecord[]) {
  return Array.from(mappings.entries()).map(([rawStoreName, normalizedStoreName]) => {
    const matchedStore = getMatchedStore(rawStoreName, normalizedStoreName, stores);
    return {
      rawStoreName,
      normalizedStoreName,
      matchedStoreId: matchedStore?.id,
      matchedPlatformStoreId: matchedStore?.platformStoreId,
    };
  });
}

function logStoreNameNormalization(mappings: Map<string, string>, stores: StoreRecord[]) {
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

  if (!isDev || mappings.size === 0) {
    return;
  }

  console.info(
    '[订单导入] 原始店铺名称 -> 标准化店铺名称',
    buildStoreNameMappings(mappings, stores),
  );
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

function normalizeOrderRow(
  row: Record<string, unknown>,
  rowIndex: number,
  stores: ReturnType<typeof loadStoreRecords>,
  storeNameMappings: Map<string, string>,
): TemuOrderDetail | null {
  if (isBlankRow(row)) {
    return null;
  }

  const rawStoreName = cleanStoreName(getCell(row, 'storeName'));
  const storeName = normalizeImportedStoreName(rawStoreName, stores);
  storeNameMappings.set(rawStoreName, storeName);

  const orderTimeDate = parseOrderTime(getCell(row, 'orderTime'));
  const orderId = String(getCell(row, 'orderId')).trim();
  const skc = String(getCell(row, 'skc')).trim();
  const skuCode = String(getCell(row, 'skuCode')).trim();
  const declarePrice = parsePrice(getCell(row, 'declarePrice'));
  const quantity = parseQuantity(getCell(row, 'quantity'));

  const orderTime = orderTimeDate ? formatDateTime(orderTimeDate) : '';
  const orderDate = orderTime.slice(0, 10);
  const month = orderTime.slice(0, 7);

  return {
    orderId,
    isFirstOrder: String(getCell(row, 'isFirstOrder')).trim() === '是',
    skc,
    skcCode: String(getCell(row, 'skcCode')).trim(),
    skuAttribute: String(getCell(row, 'skuAttribute')).trim(),
    skuCode,
    productSku: String(getCell(row, 'productSku')).trim(),
    productName: String(getCell(row, 'productName')).trim(),
    declarePrice,
    quantity,
    orderTime,
    orderDate,
    month,
    status: String(getCell(row, 'status')).trim(),
    storeName,
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
  const parsedSheets = workbook.SheetNames.map((sheetName) => buildRowsFromSheet(workbook.Sheets[sheetName]));
  const rows = parsedSheets.flatMap((sheet) => sheet.rows);

  if (rows.length === 0) {
    const missingHeaders = Array.from(new Set(parsedSheets.flatMap((sheet) => sheet.missingHeaders)));
    throw new Error(`未识别到订单表头：${missingHeaders.join('、')}。请确认上传的是订单销售 Excel。`);
  }

  const stores = loadStoreRecords();
  const storeNameMappings = new Map<string, string>();
  const orders = rows
    .map((row, index) => normalizeOrderRow(row, index, stores, storeNameMappings))
    .filter((order): order is TemuOrderDetail => Boolean(order));
  logStoreNameNormalization(storeNameMappings, stores);

  if (orders.length === 0) {
    throw new Error('未解析到有效订单明细，请检查订单表头和数据行是否为空。');
  }

  return {
    fileName: file.name,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    validRows: orders.length,
    duplicateRows: 0,
    orders,
    storeNameMappings: buildStoreNameMappings(storeNameMappings, stores),
  };
}

export const excelDataSource: ExternalDataSourceAdapter = {
  type: 'excel',
  label: 'Excel导入',
  enabled: true,
};
