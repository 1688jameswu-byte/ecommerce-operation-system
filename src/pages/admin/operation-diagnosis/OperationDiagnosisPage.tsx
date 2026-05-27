import { useEffect, useMemo, useState } from 'react';
import {
  aiRequestClient,
  buildAiContext,
  fetchAiRuntimeStatus,
  type AiRecommendedAction,
  type AiAdviceResponse,
  type AiContext,
  type AiRuntimeStatus,
} from '../../../ai';
import {
  getOperationKnowledgeByRuleCode,
  validateOperationKnowledge,
  type OperationKnowledge,
  type OperationKnowledgeValidationResult,
} from '../../../ai/knowledge';
import type { PlatformCode } from '../../../ai/rule-engine';
import {
  subscribeOrderImportStorageChange,
} from '../../../data-source/orderImportStorageDataSource';
import {
  subscribeTrafficConversionChange,
} from '../../../data-source/trafficConversionDataSource';
import { taskDataSource } from '../../../data-source/taskDataSource';
import {
  analyzeAnomalyTriggerReadiness,
  operationAnomalyRuleConfig,
  runOperationDiagnosis,
  type AnomalyResult,
  type SolutionMatchResult,
} from '../../../rules/operationAnomaly';
import type { OperationTaskPriority, OperationTaskRecord, OperationTaskStatus } from '../../../types/task';
import {
  decisionStatusLabelMap,
  getSeverityLabel,
  severityLabelMap,
  solutionActionTypeLabelMap,
  solutionPriorityLabelMap,
} from '../../../utils/operationLanguage';
import { createTaskFromOperationAnomaly } from '../../../utils/operationTaskSourceAdapter';
import { filterTasksByPermission } from '../../../utils/permissionScope';
import { hasPermission } from '../../../auth/permissions';
import type { CurrentUser } from '../../../types/auth';
import { createEmptyOperationDiagnosisDataSet, loadOperationDiagnosisDataSetAsync } from './operationDiagnosisDataService';

const taskStatusLabels: Record<OperationTaskStatus, string> = {
  todo: '待处理',
  doing: '处理中',
  done: '已完成',
  closed: '已关闭',
};

type OperationTaskFilter = 'all' | 'not_created' | OperationTaskStatus;
type SeverityFilter = 'all' | 'formal' | 'watch' | AnomalyResult['severity'];
type OperationSortMode = 'default' | 'severity_desc' | 'date_desc' | 'date_asc' | 'task_not_created_first' | 'task_doing_first';

const taskFilterLabels: Record<OperationTaskFilter, string> = {
  all: '全部',
  not_created: '未生成任务',
  todo: '待处理',
  doing: '处理中',
  done: '已完成',
  closed: '已关闭',
};

const taskFilterOptions: OperationTaskFilter[] = ['all', 'not_created', 'todo', 'doing', 'done', 'closed'];
const severityFilterOptions: SeverityFilter[] = ['all', 'formal', 'watch', 'critical', 'high', 'medium', 'low'];

const severityFilterLabels: Record<SeverityFilter, string> = {
  all: '全部问题',
  formal: '正式异常',
  watch: '观察项',
  critical: severityLabelMap.critical,
  high: severityLabelMap.high,
  medium: severityLabelMap.medium,
  low: severityLabelMap.low,
};

const sortModeLabels: Record<OperationSortMode, string> = {
  default: '默认排序',
  severity_desc: '严重程度从高到低',
  date_desc: '日期从新到旧',
  date_asc: '日期从旧到新',
  task_not_created_first: '任务状态优先：未生成任务优先',
  task_doing_first: '任务状态优先：处理中优先',
};

const sortModeOptions: OperationSortMode[] = [
  'default',
  'severity_desc',
  'date_desc',
  'date_asc',
  'task_not_created_first',
  'task_doing_first',
];

const severityRank: Record<AnomalyResult['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const taskStatusRank: Record<OperationTaskFilter, number> = {
  all: 99,
  not_created: 0,
  todo: 1,
  doing: 2,
  done: 3,
  closed: 4,
};

const doingFirstRank: Record<OperationTaskFilter, number> = {
  all: 99,
  doing: 0,
  not_created: 1,
  todo: 2,
  done: 3,
  closed: 4,
};

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN');
}

function formatTaskDate(value?: string) {
  return value || '未设置';
}

function formatMetricValue(value?: string | number) {
  if (value === undefined) {
    return '-';
  }

  return typeof value === 'number' ? Number(value.toFixed(4)).toLocaleString('zh-CN') : value;
}

function formatChangeRate(value?: number) {
  return value === undefined ? '-' : `${(value * 100).toFixed(2)}%`;
}

function formatThreshold(value: number) {
  return `${Math.round(value * 100)}%`;
}

function findSolutionMatch(solutionMatches: SolutionMatchResult[], anomalyId: string) {
  return solutionMatches.find((match) => match.anomalyResultId === anomalyId);
}

function findTaskByAnomaly(tasks: OperationTaskRecord[], anomalyId: string) {
  return tasks.find((task) => task.sourceType === 'operation_anomaly' && task.sourceId === anomalyId);
}

function getStoreFilterKey(anomaly: AnomalyResult) {
  return anomaly.storeId || anomaly.storeName || 'unbound-store';
}

function getAnomalyTaskFilterValue(tasks: OperationTaskRecord[], anomalyId: string): OperationTaskFilter {
  return findTaskByAnomaly(tasks, anomalyId)?.status ?? 'not_created';
}

function isWatchResult(anomaly: AnomalyResult) {
  return anomaly.severity === 'low' && anomaly.sourceMetrics.resultLevel === 'watch';
}

function isFormalAnomaly(anomaly: AnomalyResult) {
  return anomaly.sourceMetrics.resultLevel === 'anomaly' ||
    anomaly.severity === 'critical' ||
    anomaly.severity === 'high' ||
    anomaly.severity === 'medium';
}

function matchSeverityFilter(anomaly: AnomalyResult, filter: SeverityFilter) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'formal') {
    return isFormalAnomaly(anomaly);
  }

  if (filter === 'watch') {
    return isWatchResult(anomaly);
  }

  return anomaly.severity === filter;
}

function compareByDate(first: AnomalyResult, second: AnomalyResult) {
  return first.date.localeCompare(second.date);
}

function firstText(values: Array<string | undefined>) {
  return values.find((value) => Boolean(value && value.trim()));
}

function buildDiagnosisState(dataSet: ReturnType<typeof createEmptyOperationDiagnosisDataSet>) {

  return {
    diagnosis: runOperationDiagnosis(dataSet),
    auditReport: analyzeAnomalyTriggerReadiness(dataSet),
  };
}

async function loadDiagnosisState(currentUser: CurrentUser) {
  return buildDiagnosisState(await loadOperationDiagnosisDataSetAsync(currentUser));
}

type DiagnosisAuditState = ReturnType<typeof buildDiagnosisState>['auditReport'];

function getAuditRule(report: DiagnosisAuditState, ruleId: string) {
  return report.ruleAudits.find((rule) => rule.ruleId === ruleId);
}

function getTopReason(report: DiagnosisAuditState, ruleId: string) {
  return getAuditRule(report, ruleId)?.reasons[0] ?? '暂无审计原因。';
}

function buildEmptyAuditItems(report: DiagnosisAuditState) {
  const salesRule = getAuditRule(report, 'sales-amount-decline-v1');
  const orderRule = getAuditRule(report, 'order-count-decline-v1');
  const visitorRule = getAuditRule(report, 'visitor-count-decline-v1');
  const conversionRule = getAuditRule(report, 'low-conversion-rate-v1');
  const dataQualityRule = getAuditRule(report, 'standard-fact-data-quality-v1');

  return [
    `数据日期范围：${report.dataSummary.dateRange.startDate || '-'} 至 ${report.dataSummary.dateRange.endDate || '-'}`,
    `店铺数量：${formatNumber(report.dataSummary.storeCount)} 个`,
    `销售额下降：${salesRule?.ready ? '具备计算条件' : '有效日期不足'}；${getTopReason(report, 'sales-amount-decline-v1')}`,
    `订单数下降：${orderRule?.ready ? '具备计算条件' : '有效日期不足'}；${getTopReason(report, 'order-count-decline-v1')}`,
    `访客数下降：${visitorRule?.triggered ? '已超过阈值' : '未超过阈值'}；${getTopReason(report, 'visitor-count-decline-v1')}`,
    `转化率过低：${conversionRule?.triggered ? '低于阈值' : '未低于阈值'}；${getTopReason(report, 'low-conversion-rate-v1')}`,
    `数据质量 warnings：${dataQualityRule?.dataQualityAudit?.warningCount ?? 0} 条。`,
  ];
}

function aiPriorityToTaskPriority(priority: AiRecommendedAction['priority']): OperationTaskPriority {
  if (priority === 'high') {
    return 'high';
  }

  if (priority === 'low') {
    return 'low';
  }

  return 'medium';
}

function buildAiActionSourceId(response: AiAdviceResponse, action: AiRecommendedAction) {
  return `ai:${response.requestId}:${action.actionCode}`;
}

const legacyRuleCodeByRuleId: Record<string, string> = {
  'sales-amount-decline-v1': 'R006',
  'order-count-decline-v1': 'R005',
  'visitor-count-decline-v1': 'R001',
  'low-conversion-rate-v1': 'R004',
  'high-visitor-low-conversion-v1': 'R010',
};

const platformCodeByText: Partial<Record<string, PlatformCode>> = {
  TEMU: 'TEMU',
  AMAZON: 'AMAZON',
  TIKTOK: 'TIKTOK',
  SHOPIFY: 'SHOPIFY',
  ALL: 'ALL',
};

function getAnomalyKnowledgeRuleCode(anomaly: AnomalyResult) {
  const ruleCode = (anomaly as AnomalyResult & { ruleCode?: string }).ruleCode;

  return ruleCode || legacyRuleCodeByRuleId[anomaly.ruleId] || '';
}

function getAnomalyPlatformCode(anomaly: AnomalyResult): PlatformCode {
  return platformCodeByText[String(anomaly.platform || 'TEMU').toUpperCase()] ?? 'TEMU';
}

const aiReasonConfidenceLabels: Record<'low' | 'medium' | 'high', string> = {
  low: '低概率',
  medium: '中概率',
  high: '高概率',
};

type AiReasonDisplayItem = {
  key: string;
  text: string;
  confidenceLevel?: 'low' | 'medium' | 'high';
  confirmed?: boolean;
  confirmationStatus?: ReasonConfirmationStatus;
};

type ReasonConfirmationStatus = 'pending' | 'confirmed' | 'rejected';

function getReasonConfirmed(reason: AiReasonDisplayItem, confirmationStatus: ReasonConfirmationStatus) {
  if (confirmationStatus === 'confirmed') {
    return true;
  }

  if (confirmationStatus === 'rejected') {
    return false;
  }

  return reason.confirmed;
}

function uniqueTexts(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildAiReasonItems(anomaly: AnomalyResult, knowledge: OperationKnowledge | null): AiReasonDisplayItem[] {
  const richReasons: AiReasonDisplayItem[] = knowledge?.reasonTree?.possibleReasons.map((reason) => ({
    key: reason.reasonCode,
    text: reason.reasonName,
    confidenceLevel: reason.confidence,
    confirmed: reason.needHumanCheck,
    confirmationStatus: (reason as typeof reason & { confirmationStatus?: ReasonConfirmationStatus }).confirmationStatus,
  })) ?? [];
  const existing = new Set(richReasons.map((reason) => reason.text));
  const plainReasons = uniqueTexts([
    ...(knowledge?.rootCause?.possibleReasons ?? []),
    ...anomaly.possibleCauses,
  ]).filter((reason) => !existing.has(reason));

  return [
    ...richReasons,
    ...plainReasons.map((reason): AiReasonDisplayItem => ({ key: reason, text: reason })),
  ];
}

function buildRecommendedActions(anomaly: AnomalyResult, knowledge: OperationKnowledge | null) {
  return uniqueTexts([
    ...anomaly.suggestedActions,
    ...(knowledge?.strategy?.actions.flatMap((action) => action.actionSteps) ?? []),
    ...(knowledge?.rootCause?.recommendedActions ?? []),
  ]);
}

function getReasonConfirmationKey(anomalyId: string, reasonKey: string) {
  return `${anomalyId}:${reasonKey}`;
}

function renderRuleSource(knowledge: OperationKnowledge | null) {
  if (!knowledge) {
    return (
      <details className="operation-rule-source">
        <summary>规则来源（管理员）</summary>
        <p className="operation-muted">该异常暂无 ruleCode，无法关联知识库。</p>
      </details>
    );
  }

  if (!knowledge.found) {
    return (
      <details className="operation-rule-source">
        <summary>规则来源（管理员）</summary>
        <p className="operation-muted">未匹配到运营知识库，请检查 ruleCode 或规则配置。</p>
      </details>
    );
  }

  return (
    <details className="operation-rule-source">
      <summary>规则来源（管理员）</summary>
      <div className="operation-detail-meta">
        <span>命中规则：{knowledge.rule?.ruleCode}</span>
        <span>异常类型：{knowledge.rule?.ruleName}</span>
        <span>规则类型：{knowledge.rule?.ruleType}</span>
        <span>优先级：{knowledge.rule?.priority}</span>
        <span>核心归因：{knowledge.rootCause?.coreAttribution ?? '-'}</span>
        <span>老板关注：{knowledge.rootCause?.bossAttentionRequired ? '是' : '否'}</span>
        <span>建议建任务：{knowledge.rootCause?.shouldCreateTask ? '是' : '否'}</span>
      </div>
    </details>
  );
}

function OperationDiagnosisPage({ currentUser }: { currentUser: CurrentUser }) {
  const [diagnosisState, setDiagnosisState] = useState(() => buildDiagnosisState(createEmptyOperationDiagnosisDataSet(currentUser)));
  const [tasks, setTasks] = useState<OperationTaskRecord[]>(() => filterTasksByPermission(taskDataSource.load(), currentUser));
  const [taskMessages, setTaskMessages] = useState<Record<string, string>>({});
  const [aiActionTaskMessages, setAiActionTaskMessages] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  // 人工确认结果未来将用于：AI原因学习、AI推荐策略优化、异常恢复效果分析。
  const [reasonConfirmations, setReasonConfirmations] = useState<Record<string, ReasonConfirmationStatus>>({});
  const [taskStatusFilter, setTaskStatusFilter] = useState<OperationTaskFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [sortMode, setSortMode] = useState<OperationSortMode>('default');
  const [aiContextMessage, setAiContextMessage] = useState('');
  const [aiCopyMessage, setAiCopyMessage] = useState('');
  const [lastAiContext, setLastAiContext] = useState<AiContext | null>(null);
  const [lastAiAdvicePreview, setLastAiAdvicePreview] = useState('');
  const [lastAiAdviceResponse, setLastAiAdviceResponse] = useState<AiAdviceResponse | null>(null);
  const [knowledgeValidation, setKnowledgeValidation] = useState<OperationKnowledgeValidationResult | null>(null);
  const [isAiAdviceLoading, setIsAiAdviceLoading] = useState(false);
  const [isAiDebugExpanded, setIsAiDebugExpanded] = useState(false);
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<AiRuntimeStatus>({
    provider: 'unknown',
    configuredProvider: 'unknown',
    hasApiKey: false,
    model: 'unknown',
  });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadDiagnosisState(currentUser).then((next) => {
        if (!cancelled) {
          setDiagnosisState(next);
        }
      });
      setTasks(filterTasksByPermission(taskDataSource.load(), currentUser));
    };
    refresh();
    const unsubscribeOrders = subscribeOrderImportStorageChange(refresh);
    const unsubscribeTraffic = subscribeTrafficConversionChange(refresh);
    window.addEventListener('focus', refresh);

    return () => {
      cancelled = true;
      unsubscribeOrders();
      unsubscribeTraffic();
      window.removeEventListener('focus', refresh);
    };
  }, [currentUser]);

  useEffect(() => {
    fetchAiRuntimeStatus().then(setAiRuntimeStatus);
  }, []);

  const { auditReport, diagnosis } = diagnosisState;
  const evaluationsByAnomalyId = useMemo(() => new Map(
    diagnosis.ruleTreeEvaluations.map((evaluation) => [evaluation.anomalyResultId, evaluation]),
  ), [diagnosis.ruleTreeEvaluations]);
  const taskFilterCounts = useMemo(() => {
    const counts: Record<OperationTaskFilter, number> = {
      all: diagnosis.anomalies.length,
      not_created: 0,
      todo: 0,
      doing: 0,
      done: 0,
      closed: 0,
    };

    diagnosis.anomalies.forEach((anomaly) => {
      counts[getAnomalyTaskFilterValue(tasks, anomaly.id)] += 1;
    });

    return counts;
  }, [diagnosis.anomalies, tasks]);
  const storeFilterOptions = useMemo(() => {
    const stores = new Map<string, string>();

    diagnosis.anomalies.forEach((anomaly) => {
      stores.set(getStoreFilterKey(anomaly), anomaly.storeName || '未绑定店铺');
    });

    return Array.from(stores.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label, 'zh-CN'));
  }, [diagnosis.anomalies]);
  const displaySummary = useMemo(() => {
    const formalAnomalyCount = diagnosis.anomalies.filter(isFormalAnomaly).length;
    const watchCount = diagnosis.anomalies.filter(isWatchResult).length;
    const affectedStoreCount = new Set(diagnosis.anomalies.map(getStoreFilterKey)).size;

    return {
      formalAnomalyCount,
      watchCount,
      highSeverityCount: diagnosis.anomalies.filter((anomaly) => anomaly.severity === 'critical' || anomaly.severity === 'high').length,
      affectedStoreCount,
      solutionCount: diagnosis.solutionMatches.reduce((total, match) => total + match.solutions.length, 0),
    };
  }, [diagnosis.anomalies, diagnosis.solutionMatches]);
  const filteredAnomalies = useMemo(() => {
    return diagnosis.anomalies.filter((anomaly) =>
      (taskStatusFilter === 'all' || getAnomalyTaskFilterValue(tasks, anomaly.id) === taskStatusFilter) &&
      matchSeverityFilter(anomaly, severityFilter) &&
      (storeFilter === 'all' || getStoreFilterKey(anomaly) === storeFilter),
    );
  }, [diagnosis.anomalies, severityFilter, storeFilter, taskStatusFilter, tasks]);
  const sortedAnomalies = useMemo(() => {
    const anomalies = [...filteredAnomalies];

    if (sortMode === 'severity_desc') {
      return anomalies.sort((first, second) =>
        severityRank[first.severity] - severityRank[second.severity] ||
        compareByDate(second, first),
      );
    }

    if (sortMode === 'date_desc') {
      return anomalies.sort((first, second) => compareByDate(second, first));
    }

    if (sortMode === 'date_asc') {
      return anomalies.sort(compareByDate);
    }

    if (sortMode === 'task_not_created_first') {
      return anomalies.sort((first, second) =>
        taskStatusRank[getAnomalyTaskFilterValue(tasks, first.id)] - taskStatusRank[getAnomalyTaskFilterValue(tasks, second.id)] ||
        severityRank[first.severity] - severityRank[second.severity] ||
        compareByDate(second, first),
      );
    }

    if (sortMode === 'task_doing_first') {
      return anomalies.sort((first, second) =>
        doingFirstRank[getAnomalyTaskFilterValue(tasks, first.id)] - doingFirstRank[getAnomalyTaskFilterValue(tasks, second.id)] ||
        severityRank[first.severity] - severityRank[second.severity] ||
        compareByDate(second, first),
      );
    }

    return anomalies;
  }, [filteredAnomalies, sortMode, tasks]);
  const hasAnomalies = diagnosis.anomalies.length > 0;
  const hasOnlyWatchResults = hasAnomalies && displaySummary.formalAnomalyCount === 0 && displaySummary.watchCount > 0;
  const canUseAiDebugTools = hasPermission(currentUser, 'ai-debug-tools');
  const canGenerateAiAdvice = hasPermission(currentUser, 'generate-ai-advice');
  const getAiContextStoreNames = (context: AiContext) => {
    const storeNames = Array.from(new Set(context.storeSnapshots.map((snapshot) => snapshot.storeName).filter(Boolean)));
    return storeNames.slice(0, 5).join('、') || context.storeName || '-';
  };
  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };
  const handleCopyAiContext = async () => {
    if (!lastAiContext) {
      setAiCopyMessage('请先生成 AI Context');
      return;
    }

    await copyTextToClipboard(JSON.stringify(lastAiContext, null, 2));
    setAiCopyMessage('AI Context 已复制');
  };
  const handleCopyAiAdvicePreview = async () => {
    if (!lastAiAdvicePreview) {
      setAiCopyMessage('请先生成 AI 建议');
      return;
    }

    await copyTextToClipboard(lastAiAdvicePreview);
    setAiCopyMessage('AI 建议预览已复制');
  };
  const handleCopyAiResponseJson = async () => {
    if (!lastAiContext || !lastAiAdviceResponse) {
      setAiCopyMessage('请先生成 AI 建议');
      return;
    }

    await copyTextToClipboard(JSON.stringify({
      copiedAt: new Date().toISOString(),
      provider: lastAiAdviceResponse.provider,
      model: lastAiAdviceResponse.model,
      requestId: lastAiAdviceResponse.requestId,
      context: lastAiContext,
      response: lastAiAdviceResponse,
    }, null, 2));
    setAiCopyMessage('AI 响应 JSON 已复制');
  };
  const handleCreateAiActionTask = (action: AiRecommendedAction) => {
    if (!lastAiContext || !lastAiAdviceResponse) {
      setAiCopyMessage('请先生成 AI 建议');
      return;
    }

    const sourceId = buildAiActionSourceId(lastAiAdviceResponse, action);
    const existingTask = tasks.find((task) => task.sourceType === 'operation_anomaly' && task.sourceId === sourceId);

    if (existingTask) {
      setAiActionTaskMessages((current) => ({ ...current, [action.actionCode]: '该 AI 动作已生成任务草稿。' }));
      return;
    }

    const storeSnapshot = lastAiContext.storeSnapshots[0];
    const task = taskDataSource.create({
      title: `AI 建议跟进：${action.actionName}`,
      storeId: lastAiContext.storeId || storeSnapshot?.storeId,
      storeName: lastAiContext.storeName || storeSnapshot?.storeName || '未识别店铺',
      operatorId: lastAiContext.operatorId || storeSnapshot?.operatorId,
      operatorName: lastAiContext.operatorName || storeSnapshot?.operatorName,
      sourceType: 'operation_anomaly',
      sourceId,
      sourceContent: [
        `AI 建议摘要：${lastAiAdviceResponse.summary}`,
        '',
        '问题概况：',
        ...lastAiAdviceResponse.problemOverview.map((item) => `- ${item}`),
        '',
        `推荐动作：${action.actionName}`,
        '',
        '执行步骤：',
        ...action.actionSteps.map((step) => `- ${step}`),
      ].join('\n'),
      suggestion: [
        `动作名称：${action.actionName}`,
        `负责人角色：${action.ownerRole}`,
        `预期效果：${action.expectedEffect}`,
        `风险提示：${action.riskNote}`,
        '',
        `AI 请求：${lastAiAdviceResponse.provider} / ${lastAiAdviceResponse.model} / ${lastAiAdviceResponse.requestId}`,
      ].join('\n'),
      priority: aiPriorityToTaskPriority(action.priority),
      status: 'todo',
    });

    setTasks(filterTasksByPermission(taskDataSource.load(), currentUser));
    setAiActionTaskMessages((current) => ({ ...current, [action.actionCode]: `任务草稿已生成：${task.title}` }));
  };
  const buildCurrentAiContext = () => {
    const contextAnomalies = sortedAnomalies.length > 0 ? sortedAnomalies : diagnosis.anomalies;
    const dates = contextAnomalies.map((anomaly) => anomaly.date).filter(Boolean).sort();
    const platforms = Array.from(new Set(contextAnomalies.map((anomaly) => anomaly.platform).filter(Boolean)));

    return buildAiContext({
      platform: platforms.join(','),
      storeId: firstText(contextAnomalies.map((anomaly) => anomaly.storeId)),
      storeName: firstText(contextAnomalies.map((anomaly) => anomaly.storeName)),
      operatorId: firstText(contextAnomalies.map((anomaly) => anomaly.operatorId)),
      operatorName: firstText(contextAnomalies.map((anomaly) => anomaly.operatorName)),
      dateRange: {
        startDate: dates[0] || auditReport.dataSummary.dateRange.startDate,
        endDate: dates.at(-1) || auditReport.dataSummary.dateRange.endDate,
      },
      anomalies: contextAnomalies,
    });
  };
  const handleGenerateAiContext = () => {
    const context = buildCurrentAiContext();

    console.log('AI Context', context);
    setLastAiContext(context);
    setLastAiAdviceResponse(null);
    setLastAiAdvicePreview('');
    setAiCopyMessage('');
    setAiContextMessage('AI Context 已生成，请在浏览器控制台查看');
  };
  const handleValidateOperationKnowledge = () => {
    setKnowledgeValidation(validateOperationKnowledge('TEMU'));
  };
  const handleRequestAiAdvice = async () => {
    const context = buildCurrentAiContext();

    setLastAiContext(context);
    setIsAiAdviceLoading(true);
    setAiCopyMessage('');
    setAiContextMessage('正在生成 AI 建议...');

    try {
      const response = await aiRequestClient.generateOperationAdvice({
        scenario: 'operation-diagnosis',
        context,
        responseLanguage: 'zh-CN',
      });

      setLastAiAdviceResponse(response);
      setLastAiAdvicePreview(response.rawText);
      setAiActionTaskMessages({});
      setAiContextMessage(`AI 建议已返回：${response.requestId}`);
    } catch (error) {
      console.error('Mock AI request failed', error);
      setAiContextMessage('AI 建议请求失败，请查看浏览器控制台');
    } finally {
      setIsAiAdviceLoading(false);
    }
  };

  return (
    <section className="operation-diagnosis-page">
      {canUseAiDebugTools ? (
        <details className="operation-ai-debug-panel" open={isAiDebugExpanded} onToggle={(event) => setIsAiDebugExpanded(event.currentTarget.open)}>
          <summary>AI调试工具（管理员）</summary>
          <div className="analysis-maintenance-bar operation-ai-debug-actions">
            <span className={`ai-runtime-status ai-runtime-status-${aiRuntimeStatus.provider}`}>
              AI：{aiRuntimeStatus.provider} / {aiRuntimeStatus.model}
            </span>
            <button type="button" onClick={handleGenerateAiContext}>生成 AI Context</button>
            <button type="button" onClick={handleValidateOperationKnowledge}>检查 AI运营知识体系</button>
            <button type="button" onClick={handleRequestAiAdvice} disabled={isAiAdviceLoading}>
              {isAiAdviceLoading ? 'AI 建议生成中...' : '生成 AI 建议'}
            </button>
            <button type="button" onClick={handleCopyAiContext} disabled={!lastAiContext}>复制 AI Context</button>
            <button type="button" onClick={handleCopyAiAdvicePreview} disabled={!lastAiAdvicePreview}>复制 AI 建议预览</button>
            <button type="button" onClick={handleCopyAiResponseJson} disabled={!lastAiAdviceResponse}>复制 AI 响应 JSON</button>
            {aiContextMessage && <span>{aiContextMessage}</span>}
            {aiCopyMessage && <span>{aiCopyMessage}</span>}
          </div>
        </details>
      ) : canGenerateAiAdvice ? (
        <div className="analysis-maintenance-bar">
          <button type="button" onClick={handleRequestAiAdvice} disabled={isAiAdviceLoading}>
            {isAiAdviceLoading ? 'AI 建议生成中...' : '生成 AI 建议'}
          </button>
          {aiContextMessage && <span>{aiContextMessage}</span>}
        </div>
      ) : null}

      {canUseAiDebugTools && knowledgeValidation && (
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>AI运营知识体系检查</h2>
              <p>平台：{knowledgeValidation.platform}</p>
            </div>
          </header>
          <section className="import-overview-grid">
            <article>
              <span>总规则数</span>
              <strong>{formatNumber(knowledgeValidation.totalRules)}</strong>
            </article>
            <article>
              <span>完整规则数</span>
              <strong>{formatNumber(knowledgeValidation.completeCount)}</strong>
            </article>
            <article>
              <span>缺失规则数</span>
              <strong>{formatNumber(knowledgeValidation.incompleteCount)}</strong>
            </article>
          </section>
          {knowledgeValidation.incompleteCount === 0 ? (
            <p className="operation-muted">AI运营知识体系完整。</p>
          ) : (
            <section className="operation-diagnosis-block">
              <h3>缺失项列表</h3>
              <ul>
                {knowledgeValidation.incompleteItems.map((item) => (
                  <li key={item.ruleCode}>
                    {item.ruleCode} / {item.ruleName} / {item.missingParts.join(', ')}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}

      {lastAiContext && (
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>AI Context 摘要</h2>
              <p>生成时间：{lastAiContext.generatedAt}</p>
            </div>
            <span>{lastAiContext.contextVersion}</span>
          </header>
          <section className="import-overview-grid">
            <article>
              <span>本次分析异常数量</span>
              <strong>{formatNumber(lastAiContext.anomalySummary.total)}</strong>
            </article>
            <article>
              <span>观察项数量</span>
              <strong>{formatNumber(lastAiContext.anomalySummary.watchCount)}</strong>
            </article>
            <article>
              <span>正式异常数量</span>
              <strong>{formatNumber(lastAiContext.anomalySummary.criticalCount + lastAiContext.anomalySummary.warningCount)}</strong>
            </article>
            <article>
              <span>涉及店铺名称</span>
              <strong>{getAiContextStoreNames(lastAiContext)}</strong>
            </article>
          </section>
          <section className="operation-diagnosis-columns">
            <section>
              <h3>可能原因</h3>
              {lastAiContext.possibleReasons.length > 0 ? (
                <ul>
                  {lastAiContext.possibleReasons.slice(0, 5).map((reason) => <li key={reason.reasonCode}>{reason.reasonName}</li>)}
                </ul>
              ) : (
                <p>暂无可推断原因</p>
              )}
            </section>
            <section>
              <h3>推荐动作</h3>
              {lastAiContext.recommendedActions.length > 0 ? (
                <ul>
                  {lastAiContext.recommendedActions.slice(0, 5).map((action) => <li key={action.actionCode}>{action.actionName}</li>)}
                </ul>
              ) : (
                <p>暂无推荐动作</p>
              )}
            </section>
            <section>
              <h3>数据质量提示</h3>
              {lastAiContext.dataQualityNotes.length > 0 ? (
                <ul>
                  {lastAiContext.dataQualityNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : (
                <p>数据质量正常</p>
              )}
            </section>
          </section>
        </article>
      )}

      {lastAiAdviceResponse && (
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>AI 建议结果</h2>
              <p>请求 ID：{lastAiAdviceResponse.requestId}</p>
            </div>
            <span>{lastAiAdviceResponse.provider} / {lastAiAdviceResponse.model}</span>
          </header>
          <section className="operation-ai-response">
            <strong>{lastAiAdviceResponse.summary}</strong>
            <div className="operation-diagnosis-columns">
              <section>
                <h3>问题概况</h3>
                <ul>
                  {lastAiAdviceResponse.problemOverview.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
              <section>
                <h3>关键原因</h3>
                {lastAiAdviceResponse.keyReasons.length > 0 ? (
                  <ul>
                    {lastAiAdviceResponse.keyReasons.map((reason) => <li key={reason.reasonCode}>{reason.reasonName}</li>)}
                  </ul>
                ) : (
                  <p>暂无关键原因</p>
                )}
              </section>
              <section>
                <h3>推荐动作</h3>
                {lastAiAdviceResponse.recommendedActions.length > 0 ? (
                  <div className="operation-ai-action-list">
                    {lastAiAdviceResponse.recommendedActions.map((action) => {
                      const sourceId = buildAiActionSourceId(lastAiAdviceResponse, action);
                      const existingTask = tasks.find((task) => task.sourceType === 'operation_anomaly' && task.sourceId === sourceId);
                      const message = aiActionTaskMessages[action.actionCode];

                      return (
                        <article key={action.actionCode}>
                          <div>
                            <strong>{action.actionName}</strong>
                            <span>{action.priority}</span>
                          </div>
                          <p>{action.expectedEffect}</p>
                          <button
                            type="button"
                            onClick={() => handleCreateAiActionTask(action)}
                            disabled={Boolean(existingTask)}
                          >
                            {existingTask ? '任务草稿已生成' : '生成任务草稿'}
                          </button>
                          {message && <em>{message}</em>}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p>暂无推荐动作</p>
                )}
              </section>
              <section>
                <h3>风险提示</h3>
                <ul>
                  {lastAiAdviceResponse.riskNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </section>
            </div>
            <div className="operation-ai-decision-grid">
              <article>
                <span>老板介入建议</span>
                <p>{lastAiAdviceResponse.bossAttentionAdvice}</p>
              </article>
              <article>
                <span>任务生成建议</span>
                <p>{lastAiAdviceResponse.taskCreationAdvice}</p>
              </article>
            </div>
          </section>
        </article>
      )}

      {lastAiAdvicePreview && (
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>AI 建议预览</h2>
              <p>基于当前 AI Context 返回，实际来源见上方 provider / model。</p>
            </div>
          </header>
          <p style={{ whiteSpace: 'pre-wrap' }}>{lastAiAdvicePreview}</p>
        </article>
      )}

      <section className="operation-diagnosis-summary import-overview-grid">
        <article>
          <span>正式异常数</span>
          <strong>{formatNumber(displaySummary.formalAnomalyCount)}</strong>
        </article>
        <article>
          <span>观察项数</span>
          <strong>{formatNumber(displaySummary.watchCount)}</strong>
        </article>
        <article>
          <span>高风险及以上</span>
          <strong>{formatNumber(displaySummary.highSeverityCount)}</strong>
        </article>
        <article>
          <span>影响店铺数</span>
          <strong>{formatNumber(displaySummary.affectedStoreCount)}</strong>
        </article>
        <article>
          <span>匹配处理建议数</span>
          <strong>{formatNumber(displaySummary.solutionCount)}</strong>
        </article>
      </section>

      <section className="operation-diagnosis-guidance excel-record-panel">
        <strong>运营口径说明</strong>
        <p>
          正式异常：达到异常阈值，需要优先处理。观察项：尚未达到异常阈值，但值得关注。
          当前规则按最近{operationAnomalyRuleConfig.recentWindowDays}天均值 vs 最近{operationAnomalyRuleConfig.baselineWindowDays}天均值判断，
          观察级阈值 {formatThreshold(operationAnomalyRuleConfig.watchDeclineThreshold)}，
          异常级阈值 {formatThreshold(operationAnomalyRuleConfig.declineThreshold)}。
        </p>
      </section>

      {hasOnlyWatchResults && (
        <article className="excel-record-panel operation-diagnosis-status-note">
          当前暂无正式异常，但有 {formatNumber(displaySummary.watchCount)} 个观察项。
        </article>
      )}

      {hasAnomalies && (
        <section className="operation-filter-panel" aria-label="异常筛选">
          <div className="operation-task-filter-bar" aria-label="异常任务状态筛选">
            {taskFilterOptions.map((filter) => (
              <button
                key={filter}
                className={taskStatusFilter === filter ? 'active' : ''}
                type="button"
                onClick={() => setTaskStatusFilter(filter)}
              >
                {taskFilterLabels[filter]} {formatNumber(taskFilterCounts[filter])}
              </button>
            ))}
          </div>

          <div className="operation-secondary-filters">
            <label>
              严重程度
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}>
                {severityFilterOptions.map((severity) => (
                  <option key={severity} value={severity}>{severityFilterLabels[severity]}</option>
                ))}
              </select>
            </label>
            <label>
              店铺
              <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="all">全部店铺</option>
                {storeFilterOptions.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>
            <label className="operation-sort-filter">
              排序
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as OperationSortMode)}>
                {sortModeOptions.map((mode) => (
                  <option key={mode} value={mode}>{sortModeLabels[mode]}</option>
                ))}
              </select>
            </label>
            <span>当前显示 {formatNumber(filteredAnomalies.length)} / 全部 {formatNumber(diagnosis.anomalies.length)} 条异常</span>
          </div>
        </section>
      )}

      {!hasAnomalies ? (
        <article className="excel-record-panel operation-diagnosis-empty operation-diagnosis-empty-audit">
          <strong>当前暂无异常或观察项。</strong>
          <p>下面是本次真实数据未触发异常或观察项的简要原因。</p>
          <ul>
            {buildEmptyAuditItems(auditReport).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      ) : filteredAnomalies.length === 0 ? (
        <article className="excel-record-panel operation-diagnosis-empty">
          当前筛选下暂无运营异常
        </article>
      ) : (
        <section className="operation-diagnosis-list">
          {sortedAnomalies.map((anomaly) => {
            const evaluation = evaluationsByAnomalyId.get(anomaly.id);
            const solutionMatch = findSolutionMatch(diagnosis.solutionMatches, anomaly.id);
            const relatedTask = findTaskByAnomaly(tasks, anomaly.id);
            const taskMessage = taskMessages[anomaly.id];
            const isExpanded = Boolean(expandedIds[anomaly.id]);
            const knowledgeRuleCode = getAnomalyKnowledgeRuleCode(anomaly);
            const operationKnowledge = knowledgeRuleCode
              ? getOperationKnowledgeByRuleCode(knowledgeRuleCode, getAnomalyPlatformCode(anomaly))
              : null;
            const aiReasonItems = buildAiReasonItems(anomaly, operationKnowledge);
            const recommendedActions = buildRecommendedActions(anomaly, operationKnowledge);

            return (
              <article
                key={anomaly.id}
                className={`excel-record-panel operation-diagnosis-card ${isWatchResult(anomaly) ? 'operation-diagnosis-card-watch' : 'operation-diagnosis-card-formal'}`}
              >
                <header>
                  <div>
                    <h2>{anomaly.ruleName}</h2>
                    <p>{anomaly.storeName || '未绑定店铺'} / {anomaly.date || '-'}</p>
                  </div>
                  <span className={`operation-severity operation-severity-${anomaly.severity}`}>
                    {getSeverityLabel(anomaly.severity)}
                  </span>
                </header>

                <section className="operation-diagnosis-main">
                  <div className="operation-diagnosis-summary-text">
                    <strong>{anomaly.summary}</strong>
                  </div>

                  <div className="operation-diagnosis-columns">
                    <section>
                      <h3>AI判断原因</h3>
                      <ul className="operation-ai-reason-list">
                        {aiReasonItems.map((reason) => {
                          const confirmationKey = getReasonConfirmationKey(anomaly.id, reason.key);
                          const confirmationStatus = reasonConfirmations[confirmationKey] ?? reason.confirmationStatus ?? 'pending';
                          const confirmed = getReasonConfirmed(reason, confirmationStatus);

                          return (
                            <li key={reason.key} className="reason-card">
                              <span className="reason-title">{reason.text}</span>
                              {(reason.confidenceLevel || confirmed !== undefined) && (
                                <div className="reason-tags">
                                  {reason.confidenceLevel && (
                                    <span className={`reason-tag reason-tag-${reason.confidenceLevel}`}>
                                      {aiReasonConfidenceLabels[reason.confidenceLevel]}
                                    </span>
                                  )}
                                  {confirmed !== undefined && (
                                    <span className={`reason-tag ${confirmed ? 'reason-tag-confirmed' : 'reason-tag-unconfirmed'}`}>
                                      {confirmed ? '已确认' : '未确认'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                    <section>
                      <h3>推荐处理动作</h3>
                      <ul>
                        {recommendedActions.map((action) => <li key={action}>{action}</li>)}
                      </ul>
                    </section>
                  </div>

                  <section className="operation-task-bar">
                    <div className="operation-task-status">
                      <span className={`task-status-${relatedTask?.status ?? 'todo'}`}>
                        {relatedTask ? '已生成任务' : '未生成任务'}
                      </span>
                      {relatedTask && (
                        <>
                          <span>任务状态：{taskStatusLabels[relatedTask.status]}</span>
                          <span>负责人：{relatedTask.operatorName || '未指派'}</span>
                          <span>截止日期：{formatTaskDate(relatedTask.dueDate)}</span>
                        </>
                      )}
                    </div>
                    {relatedTask ? (
                      <a className="excel-clear-button primary-action" href={`/admin/tasks?taskId=${encodeURIComponent(relatedTask.id)}`}>
                        查看任务
                      </a>
                    ) : (
                      <>
                        <button
                          className="excel-clear-button primary-action"
                          type="button"
                          onClick={() => {
                            const result = createTaskFromOperationAnomaly({
                              anomaly,
                              ruleTreeEvaluation: evaluation,
                              solutionMatch,
                            });
                            setTasks(filterTasksByPermission(taskDataSource.load(), currentUser));
                            setTaskMessages((current) => ({ ...current, [anomaly.id]: result.message }));
                          }}
                        >
                          生成任务
                        </button>
                        {isWatchResult(anomaly) && (
                          <span className="operation-watch-task-hint">观察项建议先人工确认后再生成任务。</span>
                        )}
                      </>
                    )}
                    <button
                      className="excel-clear-button"
                      type="button"
                      onClick={() => setExpandedIds((current) => ({ ...current, [anomaly.id]: !current[anomaly.id] }))}
                    >
                      {isExpanded ? '收起详情' : '展开详情'}
                    </button>
                    {taskMessage && <span>{taskMessage}</span>}
                  </section>

                  {renderRuleSource(operationKnowledge)}
                </section>

                {isExpanded && (
                  <section className="operation-diagnosis-body">
                    <section className="operation-diagnosis-block">
                      <h3>判断结果</h3>
                      {evaluation ? (
                        <>
                          <div className="operation-detail-meta">
                            <span>置信度：{evaluation.confidence}</span>
                          </div>
                          <div className="operation-cause-tags">
                            {(evaluation.likelyCauseKeys.length ? evaluation.likelyCauseKeys : ['暂无已命中原因']).map((causeKey) => (
                              <span key={causeKey}>{causeKey}</span>
                            ))}
                          </div>
                          <div className="operation-decision-list">
                            {evaluation.decisions.map((decision) => (
                              <section key={decision.nodeId} className={`operation-decision operation-decision-${decision.status}`}>
                                <header>
                                  <strong>{decision.metricKey || decision.nodeId}</strong>
                                  <span>{decisionStatusLabelMap[decision.status] ?? decision.status}</span>
                                </header>
                                <div className="operation-decision-metrics">
                                  <span>观测值：{formatMetricValue(decision.observedValue)}</span>
                                  <span>基准值：{formatMetricValue(decision.baselineValue)}</span>
                                  <span>变化率：{formatChangeRate(decision.changeRate)}</span>
                                </div>
                                <p>{decision.explanation}</p>
                              </section>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="operation-muted">暂无可用判断结果。</p>
                      )}
                    </section>

                    <section className="operation-diagnosis-block">
                      <h3>处理建议</h3>
                      {solutionMatch && solutionMatch.solutions.length > 0 ? (
                        <div className="operation-solution-list">
                          {solutionMatch.solutions.map((solution) => (
                            <section key={solution.id} className="operation-solution">
                              <header>
                                <strong>{solution.title}</strong>
                                <div>
                                  <span>{solutionPriorityLabelMap[solution.priority] ?? solution.priority}</span>
                                  <span>{solutionActionTypeLabelMap[solution.actionType] ?? solution.actionType}</span>
                                </div>
                              </header>
                              <p>{solution.description}</p>
                              <h4>排查步骤</h4>
                              <ul>
                                {solution.checkSteps.map((step) => <li key={step}>{step}</li>)}
                              </ul>
                              <h4>处理建议</h4>
                              <ul>
                                {solution.suggestedActions.map((action) => <li key={action}>{action}</li>)}
                              </ul>
                              <h4>预期效果</h4>
                              <p>{solution.expectedEffect}</p>
                            </section>
                          ))}
                        </div>
                      ) : (
                        <p className="operation-muted">暂无匹配处理建议。</p>
                      )}
                    </section>
                  </section>
                )}
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

export default OperationDiagnosisPage;
