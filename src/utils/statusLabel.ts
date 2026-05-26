import { taskStatusLabelMap } from './operationLanguage';

export const statusLabelMap: Record<string, string> = {
  active: '启用',
  inactive: '未启用',
  disabled: '已禁用',
  paused: '暂停',
  ...taskStatusLabelMap,
};

export function getStatusLabel(status?: string) {
  return status ? statusLabelMap[status] ?? status : '-';
}
