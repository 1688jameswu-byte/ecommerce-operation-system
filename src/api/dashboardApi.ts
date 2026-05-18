import { mockDashboardData } from '../data/mockDashboardData';
import type { DashboardData } from '../types/dashboard';

export interface DashboardApiClient {
  fetchDashboardData: () => Promise<DashboardData>;
}

export const mockDashboardApiClient: DashboardApiClient = {
  async fetchDashboardData() {
    return mockDashboardData;
  },
};

export const dashboardApiClient = mockDashboardApiClient;
