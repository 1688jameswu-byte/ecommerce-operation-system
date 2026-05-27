import type { TaskSuggestionProblemType, TaskSuggestionTemplate } from '../types/taskSuggestion';

const apiBase = '/api/task-suggestion-templates';

export const defaultTaskSuggestionTemplates: TaskSuggestionTemplate[] = [
  {
    id: 'suggestion-traffic',
    name: '流量下降处理建议',
    problemType: 'traffic',
    enabled: true,
    sortWeight: 10,
    content: [
      '建议处理：',
      '1. 检查商品是否下架、限流、活动结束或曝光入口变化。',
      '2. 对比近 7 日主图、标题、价格、活动报名是否有调整。',
      '3. 查看店铺内其他商品流量是否同步下降，判断是单品问题还是店铺整体问题。',
      '4. 处理后继续观察 1-2 天流量恢复情况，并记录采取的动作。',
    ].join('\n'),
  },
  {
    id: 'suggestion-conversion',
    name: '转化下降处理建议',
    problemType: 'conversion',
    enabled: true,
    sortWeight: 20,
    content: [
      '建议处理：',
      '1. 优先检查价格、优惠、运费、库存、评价和详情页信息。',
      '2. 对比流量是否正常；若流量正常但转化下降，重点排查购买决策因素。',
      '3. 查看高访客低成交商品，确认是否存在价格竞争力或页面承接问题。',
      '4. 处理后记录调整项，并观察转化率是否回升。',
    ].join('\n'),
  },
  {
    id: 'suggestion-deal',
    name: '成交下降处理建议',
    problemType: 'deal',
    enabled: true,
    sortWeight: 30,
    content: [
      '建议处理：',
      '1. 同时检查流量和转化，判断成交下降由曝光减少还是购买转化变差引起。',
      '2. 若流量下降，先按流量问题处理；若流量正常，重点检查价格、库存、评价和活动。',
      '3. 核对是否有平台活动结束、商品状态变化或售后负面影响。',
      '4. 处理后填写具体动作和结果，便于复盘成交恢复情况。',
    ].join('\n'),
  },
  {
    id: 'suggestion-opportunity',
    name: '增长机会处理建议',
    problemType: 'opportunity',
    enabled: true,
    sortWeight: 40,
    content: [
      '建议处理：',
      '1. 先确认增长来源：活动、价格、曝光、主图或商品供给是否有变化。',
      '2. 检查库存、价格和履约能力，避免增长期断货或转化承接不足。',
      '3. 提炼可复用动作，观察同类商品或同店铺其他商品是否可复制。',
      '4. 记录本次跟进动作和观察结果，便于后续复盘增长原因。',
    ].join('\n'),
  },
];

function request<T>(method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '处理建议模板请求失败');
}

export function getDefaultSuggestionContent(problemType: TaskSuggestionProblemType) {
  return defaultTaskSuggestionTemplates.find((template) => template.problemType === problemType)?.content || '';
}

export function resolveSuggestionContent(
  templates: TaskSuggestionTemplate[],
  problemType: TaskSuggestionProblemType,
) {
  return templates
    .filter((template) => template.enabled && template.problemType === problemType)
    .sort((first, second) => first.sortWeight - second.sortWeight)[0]?.content || getDefaultSuggestionContent(problemType);
}

export const taskSuggestionDataSource = {
  load(): TaskSuggestionTemplate[] {
    if (typeof window === 'undefined') {
      return defaultTaskSuggestionTemplates;
    }

    try {
      const templates = request<TaskSuggestionTemplate[]>('GET');
      return templates.length > 0 ? templates : defaultTaskSuggestionTemplates;
    } catch {
      return defaultTaskSuggestionTemplates;
    }
  },

  async loadAsync(): Promise<TaskSuggestionTemplate[]> {
    if (typeof window === 'undefined') {
      return defaultTaskSuggestionTemplates;
    }

    try {
      const response = await fetch(`${apiBase}?t=${Date.now()}`, { cache: 'no-store', credentials: 'include' });
      const templates = response.ok ? await response.json() as TaskSuggestionTemplate[] : [];
      return templates.length > 0 ? templates : defaultTaskSuggestionTemplates;
    } catch {
      return defaultTaskSuggestionTemplates;
    }
  },

  update(id: string, template: Partial<TaskSuggestionTemplate>) {
    return request<TaskSuggestionTemplate>('PUT', `/${encodeURIComponent(id)}`, template);
  },
};
