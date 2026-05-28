import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { taskDataSource } from '../../../data-source/taskDataSource';
import { referenceDataService } from '../../../services/referenceDataService';
import type { OperatorRecord } from '../../../types/operator';
import type { StoreRecord } from '../../../types/store';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import type { CurrentUser } from '../../../types/auth';
import type {
  OperationTaskPriority,
  OperationTaskRecord,
  OperationTaskReviewStatus,
  OperationTaskSourceType,
  OperationTaskStatus,
} from '../../../types/task';
import { taskPriorityLabelMap, taskReviewStatusLabelMap, taskSourceTypeLabelMap } from '../../../utils/operationLanguage';
import { findExistingTaskBySource } from '../../../utils/operationTaskSourceAdapter';
import { filterTasksByPermission } from '../../../utils/permissionScope';
import { getStatusLabel } from '../../../utils/statusLabel';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

type TaskForm = Pick<
  OperationTaskRecord,
  'title' | 'storeId' | 'storeName' | 'operatorId' | 'operatorName' | 'sourceType' | 'sourceId' | 'sourceContent' | 'suggestion' | 'priority' | 'status' | 'dueDate' | 'resultNote' | 'reviewStatus' | 'reviewNote'
>;

type AiSourceFilter = '' | 'ai' | 'non_ai';
type TaskDueFilter = 'today' | 'overdue';
type TaskQuickFilterConfig = {
  key: string;
  taskId?: string;
  status?: OperationTaskStatus;
  priority?: OperationTaskPriority;
  assignee?: string;
  assigneeName?: string;
  storeKey?: string;
  source?: OperationTaskSourceType;
  dueType?: TaskDueFilter;
  reviewStatus?: OperationTaskReviewStatus | 'reviewed';
  createdToday?: boolean;
  completedToday?: boolean;
  aiOnly?: boolean;
  openOnly?: boolean;
};

const emptyTask: TaskForm = {
  title: '',
  storeId: '',
  storeName: '',
  operatorId: '',
  operatorName: '',
  sourceType: 'manual',
  sourceId: '',
  sourceContent: '',
  suggestion: '',
  priority: 'medium',
  status: 'todo',
  dueDate: '',
  resultNote: '',
  reviewStatus: 'none',
  reviewNote: '',
};

const priorityLabels: Record<OperationTaskPriority, string> = {
  high: taskPriorityLabelMap.high,
  medium: taskPriorityLabelMap.medium,
  low: taskPriorityLabelMap.low,
};

const statusLabels: Record<OperationTaskStatus, string> = {
  todo: getStatusLabel('todo'),
  doing: getStatusLabel('doing'),
  done: getStatusLabel('done'),
  closed: getStatusLabel('closed'),
};

const sourceLabels: Record<OperationTaskSourceType, string> = taskSourceTypeLabelMap;

const reviewStatusLabels: Record<OperationTaskReviewStatus, string> = taskReviewStatusLabelMap;

function getSourcePrefill(): Partial<TaskForm> {
  const params = new URLSearchParams(window.location.search);
  const sourceType = params.get('sourceType');

  if (
    sourceType !== 'warning' &&
    sourceType !== 'opportunity' &&
    sourceType !== 'risk_warning' &&
    sourceType !== 'operation_anomaly' &&
    sourceType !== 'growth_opportunity'
  ) {
    return {};
  }

  return {
    sourceType,
    sourceId: params.get('sourceId') || '',
    storeName: params.get('storeName') || '',
    title: params.get('title') || '',
    sourceContent: params.get('content') || '',
    suggestion: params.get('suggestion') || '',
    priority: sourceType === 'warning' ? 'high' : 'medium',
  };
}

function getInitialStatusFilter() {
  return new URLSearchParams(window.location.search).get('taskId') ? '' : 'active';
}

function getHighlightedTaskId() {
  return new URLSearchParams(window.location.search).get('taskId') || '';
}

async function loadVisibleStores(): Promise<StoreRecord[]> {
  try {
    const response = await fetch('/api/auth/visible-stores', { cache: 'no-store', credentials: 'include' });
    const data = await response.json() as { stores?: StoreRecord[] };
    return response.ok ? data.stores ?? [] : [];
  } catch {
    return [];
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDueState(task: OperationTaskRecord) {
  if (!task.dueDate || task.status === 'done' || task.status === 'closed') {
    return 'normal';
  }

  const today = formatDateKey(new Date());
  if (task.dueDate < today) {
    return 'overdue';
  }

  if (task.dueDate === today) {
    return 'today';
  }

  return 'normal';
}

function isOpenTask(task: OperationTaskRecord) {
  return task.status !== 'done' && task.status !== 'closed';
}

function getAssigneeKey(task: OperationTaskRecord) {
  return task.operatorId || task.operatorName || 'unassigned';
}

function taskMatchesOperator(task: OperationTaskRecord, operatorId: string, operatorMap: Map<string, OperatorRecord>) {
  if (!operatorId) {
    return true;
  }

  const operator = operatorMap.get(operatorId);
  return task.operatorId === operatorId || Boolean(operator?.operatorName && task.operatorName === operator.operatorName);
}

function getStoreKey(task: OperationTaskRecord) {
  return task.storeId || task.storeName || 'unknown-store';
}

function isAiGeneratedTask(task: OperationTaskRecord) {
  return task.sourceType === 'operation_anomaly' && Boolean(task.sourceId?.startsWith('ai:'));
}

function formatReportTaskTitle(task: OperationTaskRecord) {
  return `${task.storeName || '未绑定店铺'} / ${task.title}${isAiGeneratedTask(task) ? ' [AI]' : ''}`;
}

function buildAiTaskResultTemplate(task: OperationTaskRecord) {
  return [
    '【AI 建议任务处理结果】',
    `任务：${task.title}`,
    '',
    '1. 已检查项：',
    '- ',
    '',
    '2. 已执行调整：',
    '- ',
    '',
    '3. 当前观察结果：',
    '- ',
    '',
    '4. 后续跟进：',
    '- ',
  ].join('\n');
}

function buildAiTaskReviewTemplate(task: OperationTaskRecord) {
  return [
    '【AI 建议任务复盘】',
    `任务：${task.title}`,
    '',
    '1. AI 建议是否有效：',
    '- ',
    '',
    '2. 指标是否改善：',
    '- ',
    '',
    '3. 实际处理和 AI 建议的差异：',
    '- ',
    '',
    '4. 是否需要调整规则或提示词：',
    '- ',
  ].join('\n');
}

function buildAiReviewFeedback(task: OperationTaskRecord) {
  return {
    copiedAt: new Date().toISOString(),
    taskId: task.id,
    sourceId: task.sourceId || '',
    title: task.title,
    storeId: task.storeId || '',
    storeName: task.storeName || '',
    operatorId: task.operatorId || '',
    operatorName: task.operatorName || '',
    priority: task.priority,
    status: task.status,
    sourceContent: task.sourceContent || '',
    suggestion: task.suggestion || '',
    resultNote: task.resultNote || '',
    reviewStatus: task.reviewStatus || 'none',
    reviewNote: task.reviewNote || '',
  };
}

function getResultQuality(status: OperationTaskStatus, resultNote?: string) {
  const length = (resultNote || '').trim().length;

  if (status === 'done') {
    return length >= 10
      ? { label: '已闭环', className: 'task-quality-good' }
      : { label: '缺少结果', className: 'task-quality-missing' };
  }

  if (status === 'closed') {
    return length >= 10
      ? { label: '已关闭', className: 'task-quality-closed' }
      : { label: '缺少原因', className: 'task-quality-missing' };
  }

  if (status === 'doing') {
    return { label: '跟进中', className: 'task-quality-progress' };
  }

  return { label: '待跟进', className: 'task-quality-waiting' };
}

function isSameLocalDate(value: string | undefined, dateKey: string) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.startsWith(dateKey);
  }

  return formatDateKey(date) === dateKey;
}

function getSuggestionActions(value?: string) {
  return (value || '')
    .split(/\n|；|;|。/)
    .map((item) => item.replace(/^[\s\-*\d.、）)]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildReportLines(params: {
  tasks: OperationTaskRecord[];
  operators: OperatorRecord[];
  selectedOperatorId: string;
}) {
  const today = formatDateKey(new Date());
  const selectedOperator = params.operators.find((operator) => operator.id === params.selectedOperatorId);
  const reportTasks = selectedOperator
    ? params.tasks.filter((task) => task.operatorId === selectedOperator.id)
    : params.tasks;
  const todayCreated = reportTasks.filter((task) => isSameLocalDate(task.createdAt, today));
  const todayCompleted = reportTasks.filter((task) => isSameLocalDate(task.completedAt || task.updatedAt, today) && (task.status === 'done' || task.status === 'closed'));
  const todayReviewed = reportTasks.filter((task) => isSameLocalDate(task.reviewedAt, today) && task.reviewStatus && task.reviewStatus !== 'none');
  const openTasks = reportTasks.filter(isOpenTask);
  const overdueTasks = reportTasks.filter((task) => getDueState(task) === 'overdue');
  const highOpenTasks = openTasks.filter((task) => task.priority === 'high');
  const title = selectedOperator ? `${selectedOperator.operatorName} 运营任务日报 ${today}` : `运营任务管理日报 ${today}`;
  const lines = [
    title,
    '',
    '一、整体情况',
    `今日新增：${todayCreated.length}`,
    `今日完成/关闭：${todayCompleted.length}`,
    `当前未完成：${openTasks.length}`,
    `当前逾期：${overdueTasks.length}`,
    `优先处理未完成：${highOpenTasks.length}`,
    `今日复盘：${todayReviewed.length}`,
    '',
  ];

  if (!selectedOperator) {
    const byOperator = Array.from(reportTasks.reduce((map, task) => {
      const key = task.operatorId || task.operatorName || 'unassigned';
      const item = map.get(key) ?? { name: task.operatorName || '未指派', open: 0, overdue: 0, high: 0 };
      if (isOpenTask(task)) {
        item.open += 1;
      }
      if (getDueState(task) === 'overdue') {
        item.overdue += 1;
      }
      if (task.priority === 'high' && isOpenTask(task)) {
        item.high += 1;
      }
      map.set(key, item);
      return map;
    }, new Map<string, { name: string; open: number; overdue: number; high: number }>()).values())
      .filter((item) => item.open > 0 || item.overdue > 0 || item.high > 0)
      .sort((first, second) => second.overdue - first.overdue || second.high - first.high || second.open - first.open);

    lines.push('二、负责人积压');
    if (byOperator.length === 0) {
      lines.push('暂无负责人积压。');
    } else {
      byOperator.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name}：未完成 ${item.open}，逾期 ${item.overdue}，优先处理 ${item.high}`);
      });
    }
    lines.push('');
  }

  lines.push(selectedOperator ? '二、当前待处理' : '三、优先处理未完成');
  const focusTasks = selectedOperator ? openTasks : highOpenTasks;
  if (focusTasks.length === 0) {
    lines.push('暂无重点待处理任务。');
  } else {
    focusTasks.slice(0, 10).forEach((task, index) => {
      lines.push(`${index + 1}. ${formatReportTaskTitle(task)}`);
      lines.push(`   负责人：${task.operatorName || '未指派'}，优先级：${priorityLabels[task.priority]}，截止：${task.dueDate || '未设置'}`);
      if (task.suggestion) {
        lines.push(`   建议：${task.suggestion.replace(/\n/g, ' ')}`);
      }
    });
  }
  lines.push('');

  lines.push(selectedOperator ? '三、今日完成/关闭' : '四、今日完成/关闭');
  if (todayCompleted.length === 0) {
    lines.push('暂无今日完成或关闭任务。');
  } else {
    todayCompleted.slice(0, 10).forEach((task, index) => {
      lines.push(`${index + 1}. ${formatReportTaskTitle(task)}`);
      lines.push(`   处理结果：${task.resultNote || '未填写'}`);
    });
  }

  lines.push('');
  lines.push(selectedOperator ? '四、今日复盘' : '五、今日复盘');
  if (todayReviewed.length === 0) {
    lines.push('暂无今日复盘任务。');
  } else {
    todayReviewed.slice(0, 10).forEach((task, index) => {
      lines.push(`${index + 1}. ${formatReportTaskTitle(task)}`);
      lines.push(`   复盘结论：${reviewStatusLabels[task.reviewStatus || 'none']}，备注：${task.reviewNote || '未填写'}`);
    });
  }

  return lines.join('\n');
}

function TaskCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const formPanelRef = useRef<HTMLElement | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const highlightedTaskId = useMemo(() => getHighlightedTaskId(), []);
  const [tasks, setTasks] = useState<OperationTaskRecord[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [storeRelations, setStoreRelations] = useState<StoreOperatorRelation[]>([]);
  const [form, setForm] = useState<TaskForm>(() => ({ ...emptyTask, ...getSourcePrefill() }));
  const [editingId, setEditingId] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => getInitialStatusFilter());
  const [activeTaskQuickFilter, setActiveTaskQuickFilter] = useState<TaskQuickFilterConfig>({ key: 'all' });
  const [operatorFilter, setOperatorFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [aiSourceFilter, setAiSourceFilter] = useState<AiSourceFilter>('');
  const [reportText, setReportText] = useState('');
  const [message, setMessage] = useState('');
  const [resultPreviewTask, setResultPreviewTask] = useState<OperationTaskRecord | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const isAdmin = currentUser.role === 'admin';
  // 后续可能开放运营总监、AI自动派单；当前管理员和组长可手动创建任务。
  const currentRole = String(currentUser.role);
  const canCreateTask = isAdmin || currentRole === 'leader' || currentRole === 'manager';

  const storeMap = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const storeByName = useMemo(() => new Map(stores.map((store) => [store.storeName, store])), [stores]);
  const operatorMap = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators]);
  const findStoreOwner = (storeId: string, storeName: string) =>
    storeRelations.find((relation) =>
      relation.status !== 'inactive' &&
      relation.role === 'primary' &&
      (relation.storeId === storeId || relation.storeName === storeName)) ||
    storeRelations.find((relation) =>
      relation.status !== 'inactive' &&
      (relation.storeId === storeId || relation.storeName === storeName));

  const refreshAll = async () => {
    const loadJson = async <T,>(url: string, fallback: T) => {
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
        return response.ok ? await response.json() as T : fallback;
      } catch {
        return fallback;
      }
    };

    if (canCreateTask) {
      const referenceData = await referenceDataService.loadAll();
      setStores(referenceData.stores);
      setOperators(referenceData.operators);
      setStoreRelations(referenceData.relations);
    } else {
      setStores(await loadVisibleStores());
      setOperators([]);
      setStoreRelations([]);
    }
    setTasks(filterTasksByPermission(await loadJson<OperationTaskRecord[]>('/api/tasks', []), currentUser));
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const todayKey = formatDateKey(new Date());
  const filteredTasks = tasks
    .filter((task) =>
      (statusFilter === 'active' ? task.status === 'todo' || task.status === 'doing' : !statusFilter || task.status === statusFilter) &&
      (!activeTaskQuickFilter.taskId || task.id === activeTaskQuickFilter.taskId) &&
      (!activeTaskQuickFilter.priority || task.priority === activeTaskQuickFilter.priority) &&
      taskMatchesOperator(task, operatorFilter, operatorMap) &&
      (!sourceFilter || task.sourceType === sourceFilter) &&
      (!aiSourceFilter || (aiSourceFilter === 'ai' ? isAiGeneratedTask(task) : !isAiGeneratedTask(task))) &&
      (!activeTaskQuickFilter.status || task.status === activeTaskQuickFilter.status) &&
      (!activeTaskQuickFilter.assignee ||
        getAssigneeKey(task) === activeTaskQuickFilter.assignee ||
        Boolean(activeTaskQuickFilter.assigneeName && task.operatorName === activeTaskQuickFilter.assigneeName)) &&
      (!activeTaskQuickFilter.storeKey || getStoreKey(task) === activeTaskQuickFilter.storeKey) &&
      (!activeTaskQuickFilter.source || task.sourceType === activeTaskQuickFilter.source) &&
      (!activeTaskQuickFilter.dueType || getDueState(task) === activeTaskQuickFilter.dueType) &&
      (!activeTaskQuickFilter.reviewStatus ||
        (activeTaskQuickFilter.reviewStatus === 'reviewed'
          ? Boolean((task.reviewStatus && task.reviewStatus !== 'none') || task.reviewNote)
          : task.reviewStatus === activeTaskQuickFilter.reviewStatus)) &&
      (!activeTaskQuickFilter.createdToday || isSameLocalDate(task.createdAt, todayKey)) &&
      (!activeTaskQuickFilter.completedToday || (isSameLocalDate(task.completedAt || task.updatedAt, todayKey) && (task.status === 'done' || task.status === 'closed'))) &&
      (!activeTaskQuickFilter.aiOnly || isAiGeneratedTask(task)) &&
      (!activeTaskQuickFilter.openOnly || isOpenTask(task)))
    .sort((first, second) => {
      const statusRank: Record<OperationTaskStatus, number> = { todo: 0, doing: 1, done: 2, closed: 3 };
      const priorityRank: Record<OperationTaskPriority, number> = { high: 0, medium: 1, low: 2 };
      return statusRank[first.status] - statusRank[second.status] ||
        priorityRank[first.priority] - priorityRank[second.priority] ||
        second.updatedAt.localeCompare(first.updatedAt);
    });

  const summary = {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    doing: tasks.filter((task) => task.status === 'doing').length,
    dueToday: tasks.filter((task) => getDueState(task) === 'today').length,
    overdue: tasks.filter((task) => getDueState(task) === 'overdue').length,
    aiOpen: tasks.filter((task) => isAiGeneratedTask(task) && isOpenTask(task)).length,
    high: tasks.filter((task) => task.priority === 'high' && isOpenTask(task)).length,
  };
  const reviewSummary = {
    completed: tasks.filter((task) => task.status === 'done').length,
    reviewed: tasks.filter((task) => task.reviewStatus && task.reviewStatus !== 'none').length,
    improved: tasks.filter((task) => task.reviewStatus === 'improved').length,
    watching: tasks.filter((task) => task.reviewStatus === 'watching').length,
    notImproved: tasks.filter((task) => task.reviewStatus === 'not_improved').length,
    aiTotal: tasks.filter(isAiGeneratedTask).length,
    aiCompleted: tasks.filter((task) => isAiGeneratedTask(task) && task.status === 'done').length,
  };
  const aiCompletionRate = reviewSummary.aiTotal > 0
    ? `${Math.round((reviewSummary.aiCompleted / reviewSummary.aiTotal) * 100)}%`
    : '-';
  const reportTasks = operatorFilter
    ? tasks.filter((task) => taskMatchesOperator(task, operatorFilter, operatorMap))
    : tasks;
  const reportSummary = {
    createdToday: reportTasks.filter((task) => isSameLocalDate(task.createdAt, todayKey)).length,
    completedToday: reportTasks.filter((task) => isSameLocalDate(task.completedAt || task.updatedAt, todayKey) && (task.status === 'done' || task.status === 'closed')).length,
    doing: reportTasks.filter((task) => task.status === 'doing').length,
    highRisk: reportTasks.filter((task) => task.priority === 'high' && isOpenTask(task)).length,
    improved: reportTasks.filter((task) => task.reviewStatus === 'improved').length,
    watching: reportTasks.filter((task) => task.reviewStatus === 'watching').length,
  };
  const reportAssigneeFilter = operatorFilter
    ? { assignee: operatorFilter, assigneeName: operatorMap.get(operatorFilter)?.operatorName || '' }
    : {};
  const dailyReportTasks = reportTasks
    .filter((task) =>
      isOpenTask(task) ||
      task.priority === 'high' ||
      isSameLocalDate(task.createdAt, todayKey) ||
      (isSameLocalDate(task.completedAt || task.updatedAt, todayKey) && (task.status === 'done' || task.status === 'closed')) ||
      (task.reviewStatus && task.reviewStatus !== 'none'))
    .sort((first, second) => {
      const priorityRank: Record<OperationTaskPriority, number> = { high: 0, medium: 1, low: 2 };
      const statusRank: Record<OperationTaskStatus, number> = { todo: 0, doing: 1, done: 2, closed: 3 };
      return priorityRank[first.priority] - priorityRank[second.priority] ||
        statusRank[first.status] - statusRank[second.status] ||
        second.updatedAt.localeCompare(first.updatedAt);
    })
    .slice(0, 12);

  useEffect(() => {
    setReportText(buildReportLines({ tasks, operators, selectedOperatorId: operatorFilter }));
  }, [tasks, operators, operatorFilter]);

  const operatorStats = Array.from(tasks.reduce((map, task) => {
    const key = getAssigneeKey(task);
    const current = map.get(key) ?? {
      key,
      name: task.operatorName || '未指派',
      openCount: 0,
      overdueCount: 0,
      highCount: 0,
    };

    if (isOpenTask(task)) {
      current.openCount += 1;
    }
    if (getDueState(task) === 'overdue') {
      current.overdueCount += 1;
    }
    if (task.priority === 'high' && isOpenTask(task)) {
      current.highCount += 1;
    }

    map.set(key, current);
    return map;
  }, new Map<string, { key: string; name: string; openCount: number; overdueCount: number; highCount: number }>()).values())
    .filter((item) => item.openCount > 0 || item.overdueCount > 0 || item.highCount > 0)
    .sort((first, second) => second.overdueCount - first.overdueCount || second.highCount - first.highCount || second.openCount - first.openCount)
    .slice(0, 6);
  const storeStats = Array.from(tasks.reduce((map, task) => {
    const key = getStoreKey(task);
    const current = map.get(key) ?? {
      key,
      name: task.storeName || '未绑定店铺',
      openCount: 0,
      overdueCount: 0,
      updatedAt: '',
    };

    if (isOpenTask(task)) {
      current.openCount += 1;
    }
    if (getDueState(task) === 'overdue') {
      current.overdueCount += 1;
    }
    current.updatedAt = current.updatedAt > task.updatedAt ? current.updatedAt : task.updatedAt;

    map.set(key, current);
    return map;
  }, new Map<string, { key: string; name: string; openCount: number; overdueCount: number; updatedAt: string }>()).values())
    .filter((item) => item.openCount > 0 || item.overdueCount > 0)
    .sort((first, second) => second.overdueCount - first.overdueCount || second.openCount - first.openCount || second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, 6);
  const sourceStats = (Object.keys(sourceLabels) as OperationTaskSourceType[]).map((sourceType) => ({
    sourceType,
    totalCount: tasks.filter((task) => task.sourceType === sourceType).length,
    openCount: tasks.filter((task) => task.sourceType === sourceType && isOpenTask(task)).length,
    overdueCount: tasks.filter((task) => task.sourceType === sourceType && getDueState(task) === 'overdue').length,
  }));
  const visibleStatuses = (statusFilter === 'active'
    ? ['todo', 'doing']
    : statusFilter
      ? [statusFilter]
      : ['todo', 'doing', 'done', 'closed']) as OperationTaskStatus[];
  const groupedTasks = visibleStatuses.map((status) => ({
    status,
    tasks: filteredTasks.filter((task) => task.status === status),
  }));

  const saveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const store = form.storeId ? storeMap.get(form.storeId) : storeByName.get(form.storeName);
    const operator = form.operatorId ? operatorMap.get(form.operatorId) : undefined;
    const payload = {
      ...form,
      storeId: store?.id || form.storeId || '',
      storeName: store?.storeName || form.storeName.trim(),
      operatorName: operator?.operatorName || form.operatorName || '',
    };

    if (!payload.title.trim()) {
      setMessage('请填写任务标题。');
      return;
    }

    if (!isAdmin && payload.status === 'closed') {
      setMessage('普通运营无权关闭任务。');
      return;
    }

    if ((payload.status === 'done' || payload.status === 'closed') && (payload.resultNote || '').trim().length < 10) {
      setMessage(payload.status === 'done' ? '完成任务前请填写不少于 10 个字的处理结果。' : '关闭任务前请填写不少于 10 个字的关闭原因。');
      return;
    }

    if (editingId) {
      taskDataSource.update(editingId, payload);
      setMessage('任务已更新。');
    } else {
      if (payload.sourceId) {
        const existingTask = findExistingTaskBySource(tasks, payload.sourceType, payload.sourceId);
        if (existingTask) {
          setMessage('该异常/预警已生成任务。');
          return;
        }
      }

      taskDataSource.create(payload);
      setMessage('任务已创建。');
    }

    setForm(emptyTask);
    setEditingId('');
    refreshAll();
  };

  const editTask = (task: OperationTaskRecord) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      storeId: task.storeId || '',
      storeName: task.storeName || '',
      operatorId: task.operatorId || '',
      operatorName: task.operatorName || '',
      sourceType: task.sourceType,
      sourceId: task.sourceId || '',
      sourceContent: task.sourceContent || '',
      suggestion: task.suggestion || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate || '',
      resultNote: task.resultNote || '',
      reviewStatus: task.reviewStatus || 'none',
      reviewNote: task.reviewNote || '',
    });
    setMessage('正在编辑任务。');
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fillTaskResult = (task: OperationTaskRecord) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      storeId: task.storeId || '',
      storeName: task.storeName || '',
      operatorId: task.operatorId || '',
      operatorName: task.operatorName || '',
      sourceType: task.sourceType,
      sourceId: task.sourceId || '',
      sourceContent: task.sourceContent || '',
      suggestion: task.suggestion || '',
      priority: task.priority,
      status: 'done',
      dueDate: task.dueDate || '',
      resultNote: task.resultNote || (isAiGeneratedTask(task) ? buildAiTaskResultTemplate(task) : ''),
      reviewStatus: task.reviewStatus || 'none',
      reviewNote: task.reviewNote || '',
    });
    setMessage('请在处理结果中填写跟进动作和结论，保存后任务会变为已完成。');
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fillCloseReason = (task: OperationTaskRecord) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      storeId: task.storeId || '',
      storeName: task.storeName || '',
      operatorId: task.operatorId || '',
      operatorName: task.operatorName || '',
      sourceType: task.sourceType,
      sourceId: task.sourceId || '',
      sourceContent: task.sourceContent || '',
      suggestion: task.suggestion || '',
      priority: task.priority,
      status: 'closed',
      dueDate: task.dueDate || '',
      resultNote: task.resultNote || '',
      reviewStatus: task.reviewStatus || 'none',
      reviewNote: task.reviewNote || '',
    });
    setMessage('请填写关闭原因或处理说明，保存后任务会变为已关闭。');
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fillAiTaskReview = (task: OperationTaskRecord) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      storeId: task.storeId || '',
      storeName: task.storeName || '',
      operatorId: task.operatorId || '',
      operatorName: task.operatorName || '',
      sourceType: task.sourceType,
      sourceId: task.sourceId || '',
      sourceContent: task.sourceContent || '',
      suggestion: task.suggestion || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate || '',
      resultNote: task.resultNote || '',
      reviewStatus: task.reviewStatus && task.reviewStatus !== 'none' ? task.reviewStatus : 'watching',
      reviewNote: task.reviewNote || buildAiTaskReviewTemplate(task),
    });
    setMessage('请补充 AI 建议任务复盘，保存后会记录复盘结论。');
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateTaskStatus = (task: OperationTaskRecord, status: OperationTaskStatus) => {
    if (!isAdmin && status === 'closed') {
      setMessage('普通运营无权关闭任务。');
      return;
    }

    if ((status === 'done' || status === 'closed') && (task.resultNote || '').trim().length < 10) {
      setMessage(status === 'done' ? '请先填写不少于 10 个字的处理结果。' : '请先填写不少于 10 个字的关闭原因。');
      return;
    }

    taskDataSource.update(task.id, { status });
    setMessage(`任务已更新为${statusLabels[status]}。`);
    refreshAll();
  };

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const copyAiReviewFeedback = async (task: OperationTaskRecord) => {
    await copyTextToClipboard(JSON.stringify(buildAiReviewFeedback(task), null, 2));
    setMessage('AI 复盘反馈 JSON 已复制。');
  };

  const copyFilteredAiReviewFeedback = async () => {
    const feedbackItems = filteredTasks
      .filter((task) => isAiGeneratedTask(task) && (task.resultNote || task.reviewNote))
      .map(buildAiReviewFeedback);

    if (feedbackItems.length === 0) {
      setMessage('当前筛选条件下暂无可导出的 AI 复盘反馈。');
      return;
    }

    await copyTextToClipboard(JSON.stringify({
      exportedAt: new Date().toISOString(),
      count: feedbackItems.length,
      items: feedbackItems,
    }, null, 2));
    setMessage(`已复制 ${feedbackItems.length} 条 AI 复盘反馈。`);
  };

  const removeTask = (id: string) => {
    if (!isAdmin) {
      setMessage('普通运营无权删除任务。');
      return;
    }

    taskDataSource.remove(id);
    if (editingId === id) {
      setEditingId('');
      setForm(emptyTask);
    }
    setMessage('任务已删除。');
    setDeleteTaskId(null);
    refreshAll();
  };

  const applyTaskQuickFilter = (filter: TaskQuickFilterConfig) => {
    setActiveTaskQuickFilter(filter);
    setOperatorFilter('');
    setSourceFilter(filter.source ?? '');
    setAiSourceFilter(filter.aiOnly ? 'ai' : '');
    setStatusFilter(filter.status ?? (filter.openOnly ? 'active' : ''));
    setTimeout(() => workbenchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <section className="excel-import-page task-center-page">
      <article className="excel-record-panel task-overview-panel">
        <header>
          <div>
            <h2>任务状态总览</h2>
            <p>点击卡片可快速筛选任务工作台。</p>
          </div>
        </header>
        <section className="task-overview-section">
          <h3>执行状态</h3>
          <div className="import-overview-grid task-overview-grid task-status-metrics">
            <article className={activeTaskQuickFilter.key === 'all' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'all' })}>
              <span>全部任务</span>
              <strong>{summary.total}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'pending' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'pending', status: 'todo' })}>
              <span>待处理</span>
              <strong>{summary.todo}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'processing' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'processing', status: 'doing' })}>
              <span>处理中</span>
              <strong>{summary.doing}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'dueToday' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'dueToday', dueType: 'today' })}>
              <span>今日到期</span>
              <strong>{summary.dueToday}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'overdue' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'overdue', dueType: 'overdue' })}>
              <span>已逾期</span>
              <strong>{summary.overdue}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'aiUnfinished' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'aiUnfinished', aiOnly: true, openOnly: true })}>
              <span>AI 未完成</span>
              <strong>{summary.aiOpen}</strong>
            </article>
          </div>
        </section>
        <section className="task-overview-section">
          <h3>复盘结果</h3>
          <div className="import-overview-grid task-overview-grid task-review-metrics">
            <article className={activeTaskQuickFilter.key === 'completed' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'completed', status: 'done' })}>
              <span>已完成任务</span>
              <strong>{reviewSummary.completed}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'reviewed' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reviewed', reviewStatus: 'reviewed' })}>
              <span>已复盘任务</span>
              <strong>{reviewSummary.reviewed}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'improved' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'improved', reviewStatus: 'improved' })}>
              <span>有改善</span>
              <strong>{reviewSummary.improved}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'watching' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'watching', reviewStatus: 'watching' })}>
              <span>观察中</span>
              <strong>{reviewSummary.watching}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'notImproved' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'notImproved', reviewStatus: 'not_improved' })}>
              <span>无改善</span>
              <strong>{reviewSummary.notImproved}</strong>
            </article>
            <article className={activeTaskQuickFilter.key === 'aiTasks' ? 'task-overview-active' : ''} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'aiTasks', aiOnly: true })}>
              <span>AI 完成率</span>
              <strong>{aiCompletionRate}</strong>
            </article>
          </div>
        </section>
      </article>

      <section className="task-analysis-grid">
        <article className="excel-record-panel task-analysis-panel task-backlog-overview">
          <header>
            <div>
              <h2>积压概览</h2>
              <p>按负责人和店铺查看未完成、逾期和优先处理任务。</p>
            </div>
          </header>
          <div className="task-backlog-sections">
            <div>
              <h3>按负责人</h3>
              <div className="task-analysis-list">
                {operatorStats.map((item) => (
                  <section key={item.key} className={`task-analysis-row task-clickable-row ${activeTaskQuickFilter.key === `assignee:${item.key}` ? 'task-analysis-active' : ''}`} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: `assignee:${item.key}`, assignee: item.key })}>
                    <strong>{item.name}</strong>
                    <span>未完成 {item.openCount}</span>
                    <span className={item.overdueCount > 0 ? 'task-stat-danger' : ''}>逾期 {item.overdueCount}</span>
                    <span className={item.highCount > 0 ? 'task-stat-warning' : ''}>优先处理 {item.highCount}</span>
                  </section>
                ))}
                {operatorStats.length === 0 && <div className="task-analysis-empty">暂无负责人积压</div>}
              </div>
            </div>
            <div>
              <h3>按店铺</h3>
              <div className="task-analysis-list">
                {storeStats.map((item) => (
                  <section key={item.key} className={`task-analysis-row task-clickable-row ${activeTaskQuickFilter.key === `store:${item.key}` ? 'task-analysis-active' : ''}`} role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: `store:${item.key}`, storeKey: item.key })}>
                    <strong>{item.name}</strong>
                    <span>未完成 {item.openCount}</span>
                    <span className={item.overdueCount > 0 ? 'task-stat-danger' : ''}>逾期 {item.overdueCount}</span>
                    <span>更新 {formatDateTime(item.updatedAt)}</span>
                  </section>
                ))}
                {storeStats.length === 0 && <div className="task-analysis-empty">暂无店铺积压</div>}
              </div>
            </div>
          </div>
        </article>
        {/* 来源统计逻辑保留，后续可升级为来源闭环分析：来源转任务率、完成率、有效率、AI建议有效率。 */}
      </section>

      <article className="excel-record-panel task-report-panel">
        <header>
          <div>
            <h2>任务日报</h2>
            <p>按当前可见任务自动生成，跟随任务状态、负责人筛选和复盘结果刷新。</p>
          </div>
          {message ? <span>{message}</span> : reportText && <span>日报已自动生成</span>}
        </header>
        <section className="task-report-summary">
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportCreatedToday', createdToday: true, ...reportAssigneeFilter })}>
            <span>今日新增任务</span>
            <strong>{reportSummary.createdToday}</strong>
          </article>
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportCompletedToday', completedToday: true, ...reportAssigneeFilter })}>
            <span>今日完成任务</span>
            <strong>{reportSummary.completedToday}</strong>
          </article>
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportDoing', status: 'doing', ...reportAssigneeFilter })}>
            <span>处理中任务</span>
            <strong>{reportSummary.doing}</strong>
          </article>
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportHighRisk', priority: 'high', openOnly: true, ...reportAssigneeFilter })}>
            <span>严重风险任务</span>
            <strong>{reportSummary.highRisk}</strong>
          </article>
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportImproved', reviewStatus: 'improved', ...reportAssigneeFilter })}>
            <span>已改善任务</span>
            <strong>{reportSummary.improved}</strong>
          </article>
          <article role="button" tabIndex={0} onClick={() => applyTaskQuickFilter({ key: 'reportWatching', reviewStatus: 'watching', ...reportAssigneeFilter })}>
            <span>待观察任务</span>
            <strong>{reportSummary.watching}</strong>
          </article>
        </section>
        <section className="task-daily-card-list">
          {dailyReportTasks.map((task) => {
            const actions = getSuggestionActions(task.suggestion);
            return (
              <article key={task.id} className={`task-daily-card task-daily-card-${task.priority}`}>
                <header>
                  <div>
                    <strong>{task.storeName || '未绑定店铺'}｜{sourceLabels[task.sourceType]}｜{priorityLabels[task.priority]}</strong>
                    <span>{task.title}</span>
                  </div>
                  <button type="button" onClick={() => applyTaskQuickFilter({ key: `task:${task.id}`, taskId: task.id })}>查看任务</button>
                </header>
                <div className="task-daily-meta">
                  <span>负责人：{task.operatorName || '未指派'}</span>
                  <span>当前状态：{statusLabels[task.status]}</span>
                  <span>当前结果：{reviewStatusLabels[task.reviewStatus || 'none']}</span>
                  <span>更新时间：{formatDateTime(task.updatedAt)}</span>
                </div>
                {(isAiGeneratedTask(task) || task.sourceContent) && (
                  <p>AI判断：{task.sourceContent || 'AI 建议生成任务'}</p>
                )}
                <div className="task-daily-actions">
                  <b>建议动作</b>
                  {actions.length > 0
                    ? actions.map((action) => <span key={action}>{action}</span>)
                    : <span>暂无简要建议</span>}
                </div>
              </article>
            );
          })}
          {dailyReportTasks.length === 0 && <div className="task-analysis-empty">今日暂无任务日报数据</div>}
        </section>
      </article>

      {editingId && <div className="task-editor-backdrop" role="presentation" onClick={() => {
        setEditingId('');
        setForm(emptyTask);
        setMessage('已取消编辑。');
      }} />}
      {(canCreateTask || editingId) && (
      <article className={`excel-record-panel task-editor-panel ${editingId ? 'task-editor-modal' : ''}`} ref={formPanelRef}>
        <header>
          <div>
            <h2>{editingId ? '编辑运营任务' : '新建运营任务'}</h2>
            <p>V1 只记录问题、负责人、状态和处理结果，先把跟进闭环跑通。</p>
          </div>
          {message && <span>{message}</span>}
        </header>

        <form className="task-form-grid" onSubmit={saveTask}>
          <label className="task-form-title">
            <strong>任务标题</strong>
            <input value={form.title} readOnly={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            <strong>店铺</strong>
            <select value={form.storeId} disabled={!isAdmin && Boolean(editingId)} onChange={(event) => {
              const store = storeMap.get(event.target.value);
              const owner = findStoreOwner(event.target.value, store?.storeName || '');
              setForm({
                ...form,
                storeId: event.target.value,
                storeName: store?.storeName || '',
                operatorId: owner?.operatorId || '',
                operatorName: owner?.operatorName || '',
              });
              if (!owner) {
                setMessage('该店铺未绑定负责人，请到运营管理中维护店铺负责人关系。');
              }
            }}>
              <option value="">未绑定店铺</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}
            </select>
          </label>
          <label>
            <strong>负责人</strong>
            <select value={form.operatorId} disabled={!isAdmin && Boolean(editingId)} onChange={(event) => {
              const operator = operatorMap.get(event.target.value);
              setForm({ ...form, operatorId: event.target.value, operatorName: operator?.operatorName || '' });
            }}>
              <option value="">未指派</option>
              {operators.filter((operator) => operator.status !== 'inactive').map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.operatorName}</option>
              ))}
            </select>
          </label>
          <label>
            <strong>来源</strong>
            <select value={form.sourceType} disabled={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, sourceType: event.target.value as OperationTaskSourceType })}>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <strong>优先级</strong>
            <select value={form.priority} disabled={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, priority: event.target.value as OperationTaskPriority })}>
              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <strong>状态</strong>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as OperationTaskStatus })}>
              {Object.entries(statusLabels)
                .filter(([value]) => isAdmin || value !== 'closed' || form.status === 'closed')
                .map(([value, label]) => <option key={value} value={value} disabled={!isAdmin && value === 'closed'}>{label}</option>)}
            </select>
          </label>
          <label>
            <strong>截止日期</strong>
            <input type="date" value={form.dueDate || ''} readOnly={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </label>
          <label className="task-form-wide">
            <strong>问题说明</strong>
            <textarea value={form.sourceContent || ''} readOnly={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, sourceContent: event.target.value })} />
          </label>
          <label className="task-form-wide">
            <strong>运营处理建议</strong>
            <textarea value={form.suggestion || ''} readOnly={!isAdmin && Boolean(editingId)} onChange={(event) => setForm({ ...form, suggestion: event.target.value })} />
          </label>
          <label className="task-form-wide">
            <strong>处理结果（完成/关闭前填写）</strong>
            <textarea value={form.resultNote || ''} onChange={(event) => setForm({ ...form, resultNote: event.target.value })} />
          </label>
          <label>
            <strong>复盘结论</strong>
            <select value={form.reviewStatus || 'none'} onChange={(event) => setForm({ ...form, reviewStatus: event.target.value as OperationTaskReviewStatus })}>
              {Object.entries(reviewStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="task-form-wide">
            <strong>复盘备注</strong>
            <textarea value={form.reviewNote || ''} onChange={(event) => setForm({ ...form, reviewNote: event.target.value })} />
          </label>
          <div className="task-form-actions">
            <button className="excel-clear-button primary-action" type="submit">{editingId ? '保存任务' : '创建任务'}</button>
            {editingId && (
              <button className="excel-clear-button" type="button" onClick={() => {
                setEditingId('');
                setForm(emptyTask);
                setMessage('已取消编辑。');
              }}>
                取消编辑
              </button>
            )}
          </div>
        </form>
      </article>
      )}

      <article className="excel-record-panel task-workbench-panel" ref={workbenchRef}>
        <header>
          <div>
            <h2>任务工作台</h2>
            <p>默认聚焦未完成任务，按状态分组跟进。</p>
          </div>
          <div className="task-workbench-header-actions">
            <button type="button" onClick={copyFilteredAiReviewFeedback}>复制当前 AI 反馈</button>
            <span>{filteredTasks.length} 条</span>
          </div>
        </header>
        <section className="import-filter-bar">
          <label>
            状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">未完成任务</option>
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            负责人
            <select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}>
              <option value="">全部负责人</option>
              {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.operatorName}</option>)}
            </select>
          </label>
          <label>
            来源
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">全部来源</option>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            AI 来源
            <select value={aiSourceFilter} onChange={(event) => setAiSourceFilter(event.target.value as AiSourceFilter)}>
              <option value="">全部任务</option>
              <option value="ai">AI 建议生成</option>
              <option value="non_ai">非 AI 任务</option>
            </select>
          </label>
        </section>
        <div className="task-workbench">
          {groupedTasks.map((group) => (
            <section key={group.status} className="task-status-group">
              <header>
                <h3>{statusLabels[group.status]}</h3>
                <span>{group.tasks.length} 条</span>
              </header>
              <div className="task-card-list">
                {group.tasks.map((task) => {
                  const dueState = getDueState(task);
                  const quality = getResultQuality(task.status, task.resultNote);
                  return (
                    <article
                      key={task.id}
                      className={`task-work-card task-work-card-${task.priority}${task.id === highlightedTaskId ? ' task-work-card-highlighted' : ''}`}
                    >
                      <header>
                        <div>
                          <strong>{task.title}</strong>
                          <p>{task.sourceContent || '暂无问题说明'}</p>
                        </div>
                        <span className={`task-priority task-priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
                      </header>
                      <section className="task-card-meta">
                        <span>{task.storeName || '未绑定店铺'}</span>
                        <span>{task.operatorName || '未指派'}</span>
                        <span>{sourceLabels[task.sourceType]}</span>
                        {isAiGeneratedTask(task) && <span className="task-source-ai">AI 建议生成</span>}
                        <span className={dueState === 'overdue' ? 'task-due-overdue' : dueState === 'today' ? 'task-due-today' : ''}>
                          {dueState === 'overdue' ? `已逾期 ${task.dueDate}` : dueState === 'today' ? '今日到期' : task.dueDate || '未设截止'}
                        </span>
                        <span className={quality.className}>{quality.label}</span>
                        {(task.reviewStatus && task.reviewStatus !== 'none') && (
                          <span className={`task-review-${task.reviewStatus}`}>{reviewStatusLabels[task.reviewStatus]}</span>
                        )}
                      </section>
                      {task.suggestion && (
                        <section className="task-card-suggestion">
                          <strong>建议</strong>
                          <p>{task.suggestion}</p>
                        </section>
                      )}
                      {task.resultNote && (
                        <button className="task-result-preview-button" type="button" onClick={() => setResultPreviewTask(task)}>
                          {task.resultNote}
                        </button>
                      )}
                      {task.reviewNote && (
                        <section className="task-card-suggestion task-card-review">
                          <strong>复盘</strong>
                          <p>{task.reviewNote}</p>
                        </section>
                      )}
                      <footer>
                        <span>更新于 {formatDateTime(task.updatedAt)}</span>
                        <div className="task-table-actions">
                          <button type="button" onClick={() => editTask(task)}>编辑</button>
                          {task.status === 'todo' && <button type="button" onClick={() => updateTaskStatus(task, 'doing')}>开始</button>}
                          {task.status !== 'done' && task.status !== 'closed' && <button type="button" onClick={() => fillTaskResult(task)}>填写结果</button>}
                          {isAdmin && task.status !== 'closed' && <button type="button" onClick={() => fillCloseReason(task)}>关闭</button>}
                          {isAiGeneratedTask(task) && (task.status === 'done' || task.status === 'closed') && (
                            <button type="button" onClick={() => fillAiTaskReview(task)}>填写复盘</button>
                          )}
                          {isAiGeneratedTask(task) && (task.resultNote || task.reviewNote) && (
                            <button type="button" onClick={() => copyAiReviewFeedback(task)}>复制 AI 反馈</button>
                          )}
                          {isAdmin && <button type="button" className="danger-action-button" onClick={() => setDeleteTaskId(task.id)}>删除</button>}
                        </div>
                      </footer>
                    </article>
                  );
                })}
                {group.tasks.length === 0 && <div className="task-group-empty">暂无符合当前筛选条件的任务</div>}
              </div>
            </section>
          ))}
        </div>
      </article>

      {resultPreviewTask && (
        <div className="delete-modal-backdrop" role="presentation" onClick={() => setResultPreviewTask(null)}>
          <section className="task-result-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{resultPreviewTask.storeName || '未绑定店铺'}</span>
                <h2>{resultPreviewTask.title}</h2>
              </div>
              <button type="button" onClick={() => setResultPreviewTask(null)}>关闭</button>
            </header>
            <p>{resultPreviewTask.resultNote}</p>
          </section>
        </div>
      )}
      {deleteTaskId && (
        <ConfirmDeleteModal onCancel={() => setDeleteTaskId(null)} onConfirm={() => removeTask(deleteTaskId)} />
      )}
    </section>
  );
}

export default TaskCenterPage;

