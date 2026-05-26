import type { OperatorRecord } from '../types/operator';
import type { StoreRecord } from '../types/store';
import type { StoreOperatorRelation } from '../types/storeOperator';

export type CurrentUserRole = 'admin' | 'operator' | 'leader' | string;

export interface CurrentUser {
  id?: string;
  userId?: string;
  username?: string;
  account?: string;
  name?: string;
  role?: CurrentUserRole;
  operatorId?: string;
  operatorName?: string;
  teamId?: string;
  groupName?: string;
  allowedStoreIds?: string[];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getUserKeys(currentUser?: CurrentUser | null) {
  if (!currentUser) {
    return [];
  }

  return unique([
    currentUser.operatorId,
    currentUser.operatorName,
    currentUser.id,
    currentUser.userId,
    currentUser.username,
    currentUser.account,
    currentUser.name,
  ].map((value) => String(value ?? '').trim()));
}

function relationMatchesOperator(relation: StoreOperatorRelation, operatorKeys: string[]) {
  return operatorKeys.includes(String(relation.operatorId ?? '').trim()) ||
    operatorKeys.includes(String(relation.operatorName ?? '').trim());
}

function getStoreIdFromRelation(relation: StoreOperatorRelation) {
  return String(relation.storeId || relation.storeName || '').trim();
}

function getAllowedStoreIds(currentUser?: CurrentUser | null) {
  return Array.isArray(currentUser?.allowedStoreIds)
    ? unique(currentUser.allowedStoreIds.map((item) => String(item ?? '').trim()))
    : [];
}

export function getVisibleStoreIds(
  currentUser: CurrentUser | null | undefined,
  stores: StoreRecord[] = [],
  operators: OperatorRecord[] = [],
  relations: StoreOperatorRelation[] = [],
) {
  const role = String(currentUser?.role ?? '').toLowerCase();
  const activeRelations = relations.filter((relation) => relation.status !== 'inactive');

  if (role === 'admin') {
    return unique(stores.map((store) => store.id || store.storeName));
  }

  if (role === 'operator') {
    const allowedStoreIds = getAllowedStoreIds(currentUser);
    if (allowedStoreIds.length > 0) {
      return allowedStoreIds;
    }

    const operatorKeys = getUserKeys(currentUser);

    return unique(activeRelations
      .filter((relation) => relationMatchesOperator(relation, operatorKeys))
      .map(getStoreIdFromRelation));
  }

  if (role === 'leader') {
    const allowedStoreIds = getAllowedStoreIds(currentUser);
    if (allowedStoreIds.length > 0) {
      return allowedStoreIds;
    }

    const teamId = String(currentUser?.teamId || currentUser?.groupName || '').trim();

    if (!teamId) {
      return [];
    }

    const teamOperatorKeys = operators
      .filter((operator) => String(operator.teamId || operator.groupName || '').trim() === teamId)
      .flatMap((operator) => [operator.id, operator.operatorName]);

    return unique(activeRelations
      .filter((relation) => relationMatchesOperator(relation, unique(teamOperatorKeys)))
      .map(getStoreIdFromRelation));
  }

  return [];
}

export function getVisibleStores(
  currentUser: CurrentUser | null | undefined,
  stores: StoreRecord[] = [],
  operators: OperatorRecord[] = [],
  relations: StoreOperatorRelation[] = [],
) {
  const visibleStoreIds = getVisibleStoreIds(currentUser, stores, operators, relations);
  const visibleIdSet = new Set(visibleStoreIds);

  return stores.filter((store) => visibleIdSet.has(store.id) || visibleIdSet.has(store.storeName));
}
