import { storeDataSource } from '../data-source/storeDataSource';
import type { StoreRecord } from '../types/store';

export interface StoreIdentity {
  key: string;
  storeId?: string;
  storeName: string;
  sourceStoreName: string;
  matched: boolean;
}

export interface StoreMatchCheckReport {
  matchedCount: number;
  unmatchedStoreNames: string[];
}

function normalizeStoreName(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLocaleLowerCase();
}

function fallbackStoreName(value: unknown) {
  return String(value ?? '').trim() || '未知店铺';
}

export function loadStoreBaseRecords(): StoreRecord[] {
  try {
    return storeDataSource.load();
  } catch (error) {
    console.warn('店铺标准化：读取 data/stores.json 失败，将保留业务数据中的原店铺名称。', error);
    return [];
  }
}

export function createStoreMatcher(stores: StoreRecord[] = loadStoreBaseRecords()) {
  const storeByName = new Map<string, StoreRecord>();

  for (const store of stores) {
    const normalizedName = normalizeStoreName(store.storeName);

    if (normalizedName && !storeByName.has(normalizedName)) {
      storeByName.set(normalizedName, store);
    }
  }

  return {
    match(storeName: unknown): StoreIdentity {
      const sourceStoreName = fallbackStoreName(storeName);
      const store = storeByName.get(normalizeStoreName(sourceStoreName));

      if (!store) {
        return {
          key: sourceStoreName,
          storeName: sourceStoreName,
          sourceStoreName,
          matched: false,
        };
      }

      return {
        key: store.id,
        storeId: store.id,
        storeName: store.storeName,
        sourceStoreName,
        matched: true,
      };
    },
  };
}

export function analyzeStoreNameMatches(
  storeNames: Iterable<unknown>,
  stores: StoreRecord[] = loadStoreBaseRecords(),
): StoreMatchCheckReport {
  const matcher = createStoreMatcher(stores);
  const matchedStoreIds = new Set<string>();
  const unmatchedStoreNames = new Set<string>();

  for (const storeName of storeNames) {
    const identity = matcher.match(storeName);

    if (identity.matched && identity.storeId) {
      matchedStoreIds.add(identity.storeId);
    } else {
      unmatchedStoreNames.add(identity.sourceStoreName);
    }
  }

  const unmatched = Array.from(unmatchedStoreNames).sort();

  if (unmatched.length > 0) {
    console.warn(`店铺标准化：未匹配店铺 ${unmatched.join('、')}，请在店铺管理中新增或修正店铺名称。`);
  }

  return {
    matchedCount: matchedStoreIds.size,
    unmatchedStoreNames: unmatched,
  };
}
