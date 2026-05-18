import { mockDashboardData } from '../data/mockDashboardData';
import type { DashboardData } from '../types/dashboard';

export interface DashboardDataSource {
  getDashboardData: () => Promise<DashboardData>;
}

export const mockDataSource: DashboardDataSource = {
  async getDashboardData() {
    return mockDashboardData;
  },
};
