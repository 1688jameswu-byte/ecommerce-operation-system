import type { ColorTheme, WarningLevel, WarningType } from './dashboard';

export interface DashboardConfig {
  title: string;
  subtitle: string;
  designWidth: number;
  designHeight: number;
  refreshIntervalMs: number;
  statisticsPeriod: string;
}

export interface KpiRule {
  id: string;
  title: string;
  unit?: string;
  colorTheme: ColorTheme;
}

export interface RankingRule {
  id: string;
  title: string;
  period: string;
  unit?: string;
  showTopThreeBadge: boolean;
  showGrowth: boolean;
}

export interface WarningRule {
  type: WarningType;
  label: string;
  defaultLevel: WarningLevel;
  color: string;
}

export interface StoreStatusRule {
  status: 'normal' | 'abnormal' | 'closed';
  label: string;
  color: string;
}
