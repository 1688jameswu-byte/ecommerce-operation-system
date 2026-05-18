import type { DashboardData } from '../types/dashboard';

export type ExternalSourceType = 'excel' | 'temu' | 'dianxiaomi' | 'feishu' | 'erp';

export interface ExternalDataSourceAdapter {
  type: ExternalSourceType;
  label: string;
  enabled: boolean;
  getDashboardData?: () => Promise<DashboardData>;
}
