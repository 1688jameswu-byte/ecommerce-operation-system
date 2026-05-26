import type { CurrentUser } from '../types/auth';
import type { StandardFactDataSet } from '../data-standard';
import type { StoreRecord } from '../types/store';
import type { OperationTaskRecord } from '../types/task';
import type { AnomalyResult } from '../rules/operationAnomaly';

type StoreScopedRecord = { storeId?: string; storeName?: string };

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function isAdmin(currentUser: CurrentUser | null | undefined) {
  return currentUser?.role === 'admin';
}

export function getAllowedStoreIds(currentUser: CurrentUser | null | undefined) {
  return unique((currentUser?.allowedStoreIds ?? []).map(String));
}

export function isStoreAllowed(record: StoreScopedRecord, currentUser: CurrentUser | null | undefined) {
  if (isAdmin(currentUser)) {
    return true;
  }

  const allowedStoreIds = new Set(getAllowedStoreIds(currentUser));
  return allowedStoreIds.has(String(record.storeId ?? '').trim()) ||
    allowedStoreIds.has(String(record.storeName ?? '').trim());
}

export function filterStoresByPermission(stores: StoreRecord[], currentUser: CurrentUser | null | undefined) {
  return stores.filter((store) => isStoreAllowed({ storeId: store.id, storeName: store.storeName }, currentUser));
}

export function filterRecordsByPermission<T extends StoreScopedRecord>(items: T[], currentUser: CurrentUser | null | undefined) {
  return items.filter((item) => isStoreAllowed(item, currentUser));
}

export function filterAnomaliesByPermission<T extends AnomalyResult>(items: T[], currentUser: CurrentUser | null | undefined) {
  return filterRecordsByPermission(items, currentUser);
}

export function filterTasksByPermission(tasks: OperationTaskRecord[], currentUser: CurrentUser | null | undefined) {
  if (isAdmin(currentUser)) {
    return tasks;
  }

  const userKeys = new Set(unique([
    currentUser?.operatorId,
    currentUser?.displayName,
    currentUser?.username,
  ].map((value) => String(value ?? ''))));

  return tasks.filter((task) => (
    isStoreAllowed(task, currentUser) ||
    userKeys.has(String(task.operatorId ?? '').trim()) ||
    userKeys.has(String(task.operatorName ?? '').trim())
  ));
}

export function filterFactDataSetByPermission(dataSet: StandardFactDataSet, currentUser: CurrentUser | null | undefined): StandardFactDataSet {
  if (isAdmin(currentUser)) {
    return dataSet;
  }

  const salesOrders = filterRecordsByPermission(dataSet.salesOrders, currentUser);
  const trafficMetrics = filterRecordsByPermission(dataSet.trafficMetrics, currentUser);
  const analysisResults = filterRecordsByPermission(dataSet.analysisResults, currentUser);

  return {
    ...dataSet,
    salesOrders,
    trafficMetrics,
    analysisResults,
    meta: {
      ...dataSet.meta,
      recordCounts: {
        salesOrders: salesOrders.length,
        trafficMetrics: trafficMetrics.length,
        analysisResults: analysisResults.length,
      },
    },
  };
}

// 后续可扩展：组长查看本组、运营总监查看全部、多平台权限、数据行级权限、AI权限隔离。
