import type { DashboardData } from '../types/dashboard';

const DASHBOARD_CACHE_TTL_MS = 60 * 1000;

let dashboardDataCache: { data: DashboardData; expiresAt: number } | null = null;
let dashboardDataPromise: Promise<DashboardData> | null = null;

async function fetchDashboardSummary(): Promise<DashboardData> {
  const response = await fetch(`/api/dashboard/bigscreen-summary?t=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(await response.text() || 'Dashboard summary request failed');
  }

  return await response.json() as DashboardData;
}

export async function getDashboardData(force = false): Promise<DashboardData> {
  const now = Date.now();
  if (!force && dashboardDataCache && dashboardDataCache.expiresAt > now) {
    return dashboardDataCache.data;
  }

  if (dashboardDataPromise) {
    return dashboardDataPromise;
  }

  dashboardDataPromise = fetchDashboardSummary()
    .then((data) => {
      dashboardDataCache = {
        data,
        expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      };
      return data;
    })
    .finally(() => {
      dashboardDataPromise = null;
    });

  return dashboardDataPromise;
}
