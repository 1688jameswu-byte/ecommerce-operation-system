import { dataSourceConfig } from '../config/dataSourceConfig';
import { apiDataSource } from './apiDataSource';
import { mockDataSource } from './mockDataSource';

export const dashboardDataSource =
  dataSourceConfig.dashboardMode === 'api' ? apiDataSource : mockDataSource;
