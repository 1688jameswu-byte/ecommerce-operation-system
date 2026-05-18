import { dashboardApiClient } from '../api/dashboardApi';
import type { DashboardDataSource } from './mockDataSource';

export const apiDataSource: DashboardDataSource = {
  getDashboardData() {
    return dashboardApiClient.fetchDashboardData();
  },
};
