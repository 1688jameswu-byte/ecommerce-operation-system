export const severityLabelMap: Record<string, string> = {
  critical: '严重异常',
  high: '高风险',
  medium: '异常',
  low: '观察项',
};

export const resultLevelLabelMap: Record<string, string> = {
  anomaly: '正式异常',
  watch: '观察项',
};

export const trafficWarningLevelLabelMap: Record<string, string> = {
  critical: '严重风险',
  warning: '需关注',
  insufficient: '数据不足',
  normal: '正常',
  opportunity: '增长机会',
};

export const trafficAnalysisResultTypeLabelMap: Record<string, string> = {
  risk: '风险问题',
  opportunity: '增长机会',
  insufficient: '数据不足',
  normal: '正常',
};

export const decisionStatusLabelMap: Record<string, string> = {
  matched: '已命中',
  notMatched: '未命中',
  insufficientData: '数据不足',
  unknown: '待确认',
};

export const solutionPriorityLabelMap: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

export const taskPriorityLabelMap: Record<string, string> = {
  high: '优先处理',
  medium: '正常处理',
  low: '低优先级',
};

export const taskStatusLabelMap: Record<string, string> = {
  todo: '待处理',
  doing: '处理中',
  done: '已完成',
  closed: '已关闭',
};

export const taskSourceTypeLabelMap: Record<string, string> = {
  manual: '手动',
  warning: '预警',
  opportunity: '增长机会',
  risk_warning: '预警',
  operation_anomaly: '运营异常',
  growth_opportunity: '增长机会',
};

export const taskReviewStatusLabelMap: Record<string, string> = {
  none: '未复盘',
  improved: '有改善',
  watching: '观察中',
  not_improved: '无改善',
  unknown: '无法判断',
};

export const solutionActionTypeLabelMap: Record<string, string> = {
  check: '排查',
  optimize: '优化',
  adjust: '调整',
  monitor: '观察',
  escalate: '升级',
};

export function getSeverityLabel(severity?: string) {
  return severity ? severityLabelMap[severity] ?? severity : '-';
}
