import { useEffect, useState } from 'react';
import type { CurrentUser } from './storeVisibility';
import type { StoreRecord } from '../types/store';

export interface VisibleStoresResult {
  success: boolean;
  storeIds: string[];
  stores: StoreRecord[];
  message?: string;
}

export function useVisibleStores(currentUserInput?: CurrentUser | null) {
  const [data, setData] = useState<VisibleStoresResult>({
    success: true,
    storeIds: [],
    stores: [],
  });
  const currentUserKey = currentUserInput ? JSON.stringify(currentUserInput) : '';

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/visible-stores', { cache: 'no-store', credentials: 'include' })
      .then((response) => response.json() as Promise<VisibleStoresResult>)
      .then((next) => {
        if (!cancelled) {
          setData(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            success: false,
            storeIds: [],
            stores: [],
            message: '可见店铺读取失败',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserKey]);

  return data;
}
