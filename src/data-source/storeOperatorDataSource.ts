import type { StoreOperatorRelation } from '../types/storeOperator';
import { readPersistentJson, writePersistentJson } from './fileStorageDataSource';

const STORE_OPERATOR_STORAGE_KEY = 'temuStoreOperatorRelations';
const STORE_OPERATOR_FILE_KEY = 'storeOperatorRelations';

function normalizeName(value: string) {
  return value.trim();
}

function operatorIdFromName(operatorName: string) {
  return `operator-${operatorName}`;
}

export const storeOperatorDataSource = {
  load(): StoreOperatorRelation[] {
    if (typeof window === 'undefined') {
      return [];
    }

    const fileRelations = readPersistentJson<StoreOperatorRelation[]>(STORE_OPERATOR_FILE_KEY, []);

    if (fileRelations.length > 0) {
      return fileRelations;
    }

    const raw = window.localStorage.getItem(STORE_OPERATOR_STORAGE_KEY);

    if (!raw) {
      return fileRelations;
    }

    try {
      const parsed = JSON.parse(raw) as StoreOperatorRelation[];
      if (Array.isArray(parsed)) {
        writePersistentJson(STORE_OPERATOR_FILE_KEY, parsed);
        return parsed;
      }
    } catch {
      return [];
    }

    return fileRelations;
  },

  save(relation: Omit<StoreOperatorRelation, 'operatorId'>) {
    const storeName = normalizeName(relation.storeName);
    const operatorName = normalizeName(relation.operatorName);

    if (!storeName || !operatorName) {
      return;
    }

    const relations = this.load().filter((item) => item.storeName !== storeName);
    const nextRelation: StoreOperatorRelation = {
      storeName,
      operatorName,
      operatorId: operatorIdFromName(operatorName),
    };

    writePersistentJson(STORE_OPERATOR_FILE_KEY, [...relations, nextRelation]);
  },

  remove(storeName: string) {
    const relations = this.load().filter((item) => item.storeName !== storeName);
    writePersistentJson(STORE_OPERATOR_FILE_KEY, relations);
  },

  getOperatorName(storeName: string) {
    return this.load().find((item) => item.storeName === storeName)?.operatorName;
  },
};
