import { dianxiaomiDataSource } from './dianxiaomiDataSource';
import { erpDataSource } from './erpDataSource';
import { excelDataSource } from './excelDataSource';
import { feishuDataSource } from './feishuDataSource';
import { temuDataSource } from './temuDataSource';

export const externalDataSources = [
  excelDataSource,
  dianxiaomiDataSource,
  temuDataSource,
  feishuDataSource,
  erpDataSource,
];
