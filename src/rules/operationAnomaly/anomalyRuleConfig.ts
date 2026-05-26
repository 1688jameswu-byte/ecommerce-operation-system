export const operationAnomalyRuleConfig = {
  declineThreshold: 0.3,
  watchDeclineThreshold: 0.1,
  recentWindowDays: 7,
  baselineWindowDays: 30,
  lowConversionRateThreshold: 0.01,
  highVisitorThreshold: 100,
} as const;
