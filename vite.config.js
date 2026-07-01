import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { handleAlibaba1688Api } from './server/alibaba1688/api/alibaba1688ApiHandler.js';
import {
  readOrderImportStoreFromPostgres,
  readTemuCollectionFromPostgres,
  readTrafficConversionStoreFromPostgres,
  readWorkbenchKpiTargetsFromPostgres,
  replaceOrderStoreInPostgres,
  replaceTrafficStoreInPostgres,
  syncOrderStoreToPostgres,
  syncTemuReferenceJsonToPostgres,
  syncTrafficStoreToPostgres,
  syncWarningRulesToPostgres,
  upsertWorkbenchKpiTargetToPostgres,
} from './server/temu/temuPostgresRepository.js';
import { isTemuPostgresConfigured } from './server/temu/postgresDatabase.js';
import {
  assertImportFileShape,
  buildImportPreview,
  calculateNewProductFirstOrderStats,
  deleteAdImportBatch,
  deleteProductImportBatch,
  getAdStrategyConfig,
  getAdStrategyCounts,
  getAdStrategyExecution,
  getAdStrategyPending,
  getAdStrategyReview,
  getBossDashboard,
  getAdImportOverview,
  getAdSpendSummary,
  getOperatorDashboard,
  getOperatorOptions,
  getProductDetail,
  getProductImportOverview,
  getProductImportRankingSummary,
  getProducts,
  getRecommendations,
  getStoreOptions,
  getTemuStorageStatus,
  handleRecommendation,
  importAdRows,
  importProductRows,
  parseExcelDataUrl,
  readEffectiveListingsFromProductImport,
  rebuildNewProductSnapshots,
} from './server/temu/newProductCenterRepository.js';

const resolveProjectPath = (value, fallback) => path.resolve(process.cwd(), value || fallback);

const dataDir = resolveProjectPath(process.env.DATA_DIR, 'data');
const backupRootDir = resolveProjectPath(process.env.BACKUP_DIR, path.join(dataDir, 'backup'));
const dataFiles = {
  stores: 'stores.json',
  operators: 'operators.json',
  tasks: 'tasks.json',
  taskSuggestionTemplates: 'task-suggestion-templates.json',
  orderImportStore: 'order-import-store.json',
  storeOperatorRelations: 'store-operator-relations.json',
  trafficConversionStore: 'raw/traffic-conversion-store.json',
  trafficWarningRules: 'traffic-warning-rules.json',
  orderDailySummary: 'summary/order-daily-summary.json',
  trafficDailySummary: 'summary/traffic-daily-summary.json',
  riskResults: 'analysis/risk-results.json',
  growthOpportunities: 'analysis/growth-opportunities.json',
  businessAnalysisItems: 'analysis/business-analysis-items.json',
  salaryEmployees: 'employees.json',
  salaryPeriods: 'salary-periods.json',
  salaryAttendanceRecords: 'attendance-records.json',
  salaryAttendanceRules: 'salary-attendance-rules.json',
  salaryEmployeeTypeRules: 'salary-employee-type-rules.json',
  salaryPieceworkRecords: 'piecework-records.json',
  salaryPlans: 'salary-plans.json',
  salaryItems: 'salary-items.json',
  employeeSalaryPlans: 'employee-salary-plans.json',
  salaryRecords: 'salary-records.json',
  salaryFinancialDetails: 'salary-financial-details.json',
  salaryFinancialImportBatches: 'salary-financial-import-batches.json',
  operationWorkbenchKpiTargets: 'operation-workbench-kpi-targets.json',
  users: 'users.json',
  authSessions: 'auth-sessions.json',
  userPermissions: 'user-permissions.json',
  effectiveNewListings: 'effective-new-listings.json',
};

function formatBackupTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function copyJsonFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return 1;
}

function copyJsonFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  return fs.readdirSync(sourceDir, { withFileTypes: true }).reduce((count, item) => {
    const source = path.join(sourceDir, item.name);
    const target = path.join(targetDir, item.name);

    if (item.isDirectory()) {
      return count + copyJsonFiles(source, target);
    }

    return item.isFile() && item.name.endsWith('.json') ? count + copyJsonFile(source, target) : count;
  }, 0);
}

function countJsonFiles(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  return fs.readdirSync(sourceDir, { withFileTypes: true }).reduce((count, item) => {
    const source = path.join(sourceDir, item.name);

    if (item.isDirectory()) {
      return count + countJsonFiles(source);
    }

    return count + (item.isFile() && item.name.endsWith('.json') ? 1 : 0);
  }, 0);
}

function backupDataFiles() {
  const backupDirName = `backup-${formatBackupTime(new Date())}`;
  const backupDir = path.join(backupRootDir, backupDirName);
  let fileCount = 0;

  fs.mkdirSync(backupDir, { recursive: true });

  for (const dirName of ['raw', 'summary', 'analysis']) {
    fileCount += copyJsonFiles(path.join(dataDir, dirName), path.join(backupDir, dirName));
  }

  if (fs.existsSync(dataDir)) {
    for (const item of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith('.json')) {
        fileCount += copyJsonFile(path.join(dataDir, item.name), path.join(backupDir, item.name));
      }
    }
  }

  return { path: backupDir, fileCount };
}

function listBackups() {
  const backupsDir = backupRootDir;

  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  return fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name.startsWith('backup-'))
    .map((item) => {
      const backupPath = path.join(backupsDir, item.name);
      const stat = fs.statSync(backupPath);
      return {
        name: item.name,
        path: backupPath,
        fileCount: countJsonFiles(backupPath),
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((first, second) => second.name.localeCompare(first.name));
}

function deleteBackup(name) {
  if (!/^backup-\d{4}-\d{2}-\d{2}-\d{6}$/.test(name)) {
    throw new Error('Invalid backup name');
  }

  const backupsDir = backupRootDir;
  const backupPath = path.resolve(backupsDir, name);
  const safeRoot = path.resolve(backupsDir);

  if (!backupPath.startsWith(`${safeRoot}${path.sep}`)) {
    throw new Error('Invalid backup path');
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup not found');
  }

  fs.rmSync(backupPath, { recursive: true, force: false });
  return { name, path: backupPath };
}

function ensureDataFile(name) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, dataFiles[name]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const legacyFilePath = path.join(dataDir, `${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.json`);
    if (name === 'trafficConversionStore' && fs.existsSync(legacyFilePath)) {
      fs.copyFileSync(legacyFilePath, filePath);
      return filePath;
    }

    const initial = name === 'users'
      ? JSON.stringify(getDefaultUsers(), null, 2)
      : name === 'authSessions'
        ? '{}'
        : name === 'userPermissions'
          ? '[]'
        : name === 'taskSuggestionTemplates'
      ? JSON.stringify(getDefaultTaskSuggestionTemplates(), null, 2)
      : name === 'storeOperatorRelations' || name === 'operators' || name === 'stores' || name === 'tasks' || name === 'salaryEmployees' || name === 'salaryPeriods' || name === 'salaryAttendanceRecords' || name === 'salaryAttendanceRules' || name === 'salaryEmployeeTypeRules' || name === 'salaryPieceworkRecords' || name === 'salaryPlans' || name === 'salaryItems' || name === 'employeeSalaryPlans' || name === 'salaryRecords' || name === 'salaryFinancialDetails' || name === 'salaryFinancialImportBatches' || name === 'effectiveNewListings' || name === 'operationWorkbenchKpiTargets'
        ? '[]'
        : name === 'orderDailySummary' || name === 'trafficDailySummary'
        ? '{"items":[],"updatedAt":""}'
        : name === 'riskResults' || name === 'growthOpportunities' || name === 'businessAnalysisItems'
          ? '{"items":[],"updatedAt":""}'
          : name === 'trafficConversionStore'
            ? '{"records":[]}'
            : name === 'trafficWarningRules'
              ? '{"settings":{"displayLimit":5},"rules":[]}'
              : '{"batches":[]}';
    fs.writeFileSync(filePath, initial, 'utf-8');
  }

  return filePath;
}

function readJsonFile(name) {
  const filePath = ensureDataFile(name);

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

const jsonReadCache = new Map();
const persistentResponseCache = new Map();
const persistentResponseCacheTtlMs = 2 * 60 * 1000;
const dashboardSummaryCacheTtlMs = 5 * 60 * 1000;
let dashboardSummaryCache = null;

function clearDashboardSummaryCache() {
  dashboardSummaryCache = null;
}

function readJsonFileCached(name) {
  const filePath = ensureDataFile(name);

  try {
    const stat = fs.statSync(filePath);
    const cached = jsonReadCache.get(name);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.value;
    }

    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    jsonReadCache.set(name, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      value,
    });
    return value;
  } catch {
    return [];
  }
}

function readCollectionCached(name) {
  const value = readJsonFileCached(name);
  return Array.isArray(value) ? value : [];
}

function preferTemuPostgresReads() {
  return process.env.TEMU_READ_SOURCE === 'postgres' || process.env.TEMU_USE_POSTGRES_READS === 'true';
}

function getDataSourceRuntimeStatus() {
  const temuReadsPostgres = preferTemuPostgresReads();
  const postgresConfigured = isTemuPostgresConfigured();
  const temuSource = temuReadsPostgres ? 'postgres' : 'json';
  const temuMode = temuReadsPostgres ? 'PG优先，JSON兜底' : 'JSON读取，PG同步备用';

  return {
    generatedAt: nowIso(),
    environment: {
      temuReadSource: process.env.TEMU_READ_SOURCE || '',
      temuUsePostgresReads: process.env.TEMU_USE_POSTGRES_READS || '',
      postgresConfigured,
    },
    groups: [
      {
        name: 'TEMU核心数据',
        items: [
          { name: '订单数据', readSource: temuSource, writeSource: 'JSON + PG同步', fallback: 'JSON', mode: temuMode },
          { name: '广告/流量转化', readSource: temuSource, writeSource: 'PG，保留JSON兼容', fallback: 'JSON', mode: temuMode },
          { name: '店铺/运营/店铺关系', readSource: temuReadsPostgres ? 'postgres+json' : 'json', writeSource: 'JSON + PG同步', fallback: 'JSON', mode: temuReadsPostgres ? 'PG合并JSON' : 'JSON为主' },
          { name: '有效上新', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: '来自商品信息/SKU创建时间统计' },
        ],
      },
      {
        name: '新品中心',
        items: [
          { name: '商品信息/SKU', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: 'PG正式数据' },
          { name: '广告日报', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: 'PG正式数据' },
          { name: '新品统计/建议', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: 'PG正式数据' },
        ],
      },
      {
        name: '1688业务',
        items: [
          { name: '产品库/SKU/上架任务', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: 'PG正式数据' },
          { name: '供应商/图片/设置', readSource: 'postgres', writeSource: 'postgres', fallback: '无', mode: 'PG正式数据' },
        ],
      },
      {
        name: '仍在JSON的旧模块',
        items: [
          { name: '用户/权限/session', readSource: 'json', writeSource: 'json', fallback: '无', mode: '未迁移PG' },
          { name: '运营任务/任务模板', readSource: 'json', writeSource: 'json', fallback: '无', mode: '未迁移PG' },
          { name: '薪资绩效', readSource: 'json', writeSource: 'json', fallback: '无', mode: '未迁移PG' },
          { name: '旧异常分析/汇总文件', readSource: 'json', writeSource: 'json', fallback: '无', mode: '未迁移PG' },
        ],
      },
    ],
  };
}

function writeJsonFile(name, value) {
  const filePath = ensureDataFile(name);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
  jsonReadCache.delete(name);
  persistentResponseCache.clear();
  clearDashboardSummaryCache();
}

function nowIso() {
  return new Date().toISOString();
}

const authCookieName = 'ops_session';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const defaultPassword = '123456';
const menuKeys = {
  dashboard: 'dashboard',
  dataCenter: 'data-center',
  orderSalesImport: 'order-sales-import',
  effectiveNewListings: 'effective-new-listings',
  trafficConversionImport: 'traffic-conversion-import',
  dataManagement: 'data-management',
  dataBackup: 'data-backup',
  storeData: 'store-data',
  operationData: 'operation-data',
  analysisResults: 'analysis-results',
  storeManagement: 'store-management',
  operatorManagement: 'operator-management',
  accountManagement: 'account-management',
  newProductCenter: 'new-product-center',
  newProductBossDashboard: 'new-product-boss-dashboard',
  newProductOperatorDashboard: 'new-product-operator-dashboard',
  newProductProducts: 'new-product-products',
  newProductAdRecommendations: 'new-product-ad-recommendations',
  temuProductInfoImport: 'temu-product-info-import',
  temuAdReportImport: 'temu-ad-report-import',
  businessAnalysis: 'business-analysis',
  businessAnalysisCenter: 'business-analysis-center',
  business1688Center: '1688-business-center',
  business1688Products: '1688-products',
  business1688ListingTasks: '1688-listing-tasks',
  business1688Images: '1688-images',
  business1688Suppliers: '1688-suppliers',
  business1688Settings: '1688-settings',
  storeBusinessCenter: 'store-business-center',
  operatorAnalysisCenter: 'operator-analysis-center',
  operationDiagnosis: 'operation-diagnosis',
  aiOperationAnalysis: 'ai-operation-analysis',
  operatorPerformance: 'operator-performance',
  growthOpportunities: 'growth-opportunities',
  operationLoop: 'operation-loop',
  operationTools: 'operation-tools',
  operationTasks: 'operation-tasks',
  taskSuggestions: 'task-suggestions',
  aiImagePromptCenter: 'ai-image-prompt-center',
  ruleCenter: 'rule-center',
  kpiRules: 'kpi-rules',
  rankingRules: 'ranking-rules',
  businessRules: 'business-rules',
  anomalyRules: 'anomaly-rules',
  dataSource: 'data-source',
  dataSourceConfig: 'data-source-config',
  salaryPerformance: 'salary-performance',
  salaryEmployees: 'salary-employees',
  salaryPeriods: 'salary-periods',
  salaryImportTemplates: 'salary-import-templates',
  salaryAttendanceImport: 'salary-attendance-import',
  salaryPieceworkImport: 'salary-piecework-import',
  salaryDetails: 'salary-details',
  salaryPlan: 'salary-plan',
  financeDetailImport: 'finance-detail-import',
  operationSalaryStatistics: 'operation-salary-statistics',
};
const allMenuKeys = Object.values(menuKeys);
const menuKeyAliases = {
  'store-data': menuKeys.storeBusinessCenter,
  'store-business': menuKeys.storeBusinessCenter,
  storeBusinessCenter: menuKeys.storeBusinessCenter,
  'operation-data': menuKeys.operatorAnalysisCenter,
  'operator-analysis': menuKeys.operatorAnalysisCenter,
  operatorAnalysisCenter: menuKeys.operatorAnalysisCenter,
  'operator-performance': menuKeys.operatorAnalysisCenter,
};
const platformKeys = ['TEMU', '1688', 'Amazon', 'TikTok', 'SHEIN', 'Shopify', 'Other'];
const fieldPermissionKeys = ['supplier.read', 'cost.read', 'margin.read', 'settlement.read', 'bossRemark.read'];
const operationPermissionKeys = ['create', 'edit', 'delete', 'audit', 'export'];
const sensitiveFieldPermissionMap = {
  supplierName: 'supplier.read',
  supplierContact: 'supplier.read',
  supplierContacts: 'supplier.read',
  supplierPhone: 'supplier.read',
  supplierMobile: 'supplier.read',
  supplierWechat: 'supplier.read',
  supplierAddress: 'supplier.read',
  purchasePrice: 'cost.read',
  purchaseCost: 'cost.read',
  costPrice: 'cost.read',
  costAmount: 'cost.read',
  grossMargin: 'margin.read',
  grossMarginRate: 'margin.read',
  marginRate: 'margin.read',
  grossProfit: 'margin.read',
  grossProfitRate: 'margin.read',
  settlementMethod: 'settlement.read',
  settlementType: 'settlement.read',
  settlementCycle: 'settlement.read',
  bossRemark: 'bossRemark.read',
  bossNotes: 'bossRemark.read',
};
const legacyRoleCodes = ['admin', 'leader', 'operator'];
const roleDefinitions = {
  admin: {
    role: 'admin',
    platform: '',
    platformKeys,
    allowedMenuKeys: allMenuKeys,
    fieldPermissionKeys,
    operationPermissionKeys,
  },
  leader: {
    role: 'leader',
    platform: 'TEMU',
    platformKeys: ['TEMU'],
    allowedMenuKeys: [
      menuKeys.dashboard,
      menuKeys.orderSalesImport,
      menuKeys.trafficConversionImport,
      menuKeys.temuProductInfoImport,
      menuKeys.temuAdReportImport,
      menuKeys.newProductCenter,
      menuKeys.newProductBossDashboard,
      menuKeys.newProductOperatorDashboard,
      menuKeys.newProductProducts,
      menuKeys.newProductAdRecommendations,
      menuKeys.storeBusinessCenter,
      menuKeys.operatorAnalysisCenter,
      menuKeys.businessAnalysisCenter,
      menuKeys.operationDiagnosis,
      menuKeys.growthOpportunities,
      menuKeys.operationTasks,
      menuKeys.operatorManagement,
      menuKeys.taskSuggestions,
    ],
    fieldPermissionKeys,
    operationPermissionKeys: ['create', 'edit', 'audit', 'export'],
  },
  operator: {
    role: 'operator',
    platform: 'TEMU',
    platformKeys: ['TEMU'],
    allowedMenuKeys: [
      menuKeys.dashboard,
      menuKeys.orderSalesImport,
      menuKeys.trafficConversionImport,
      menuKeys.newProductCenter,
      menuKeys.newProductOperatorDashboard,
      menuKeys.newProductProducts,
      menuKeys.newProductAdRecommendations,
      menuKeys.storeBusinessCenter,
      menuKeys.operatorAnalysisCenter,
      menuKeys.businessAnalysisCenter,
      menuKeys.operationDiagnosis,
      menuKeys.growthOpportunities,
      menuKeys.operationTasks,
    ],
    fieldPermissionKeys,
    operationPermissionKeys: ['create', 'edit'],
  },
  temu_lead: null,
  temu_operator: null,
  '1688_lead': {
    role: 'leader',
    platform: '1688',
    platformKeys: ['1688'],
    allowedMenuKeys: [
      menuKeys.business1688Products,
      menuKeys.business1688ListingTasks,
      menuKeys.business1688Images,
      menuKeys.business1688Suppliers,
      menuKeys.business1688Settings,
      menuKeys.aiImagePromptCenter,
    ],
    fieldPermissionKeys,
    operationPermissionKeys: ['create', 'edit', 'audit', 'export'],
  },
  '1688_sales': {
    role: 'operator',
    platform: '1688',
    platformKeys: ['1688'],
    allowedMenuKeys: [
      menuKeys.business1688Products,
      menuKeys.business1688ListingTasks,
      menuKeys.business1688Images,
      menuKeys.aiImagePromptCenter,
    ],
    fieldPermissionKeys: [],
    operationPermissionKeys: ['create', 'edit'],
  },
  amazon_lead: null,
  amazon_operator: null,
  tiktok_lead: null,
  tiktok_operator: null,
};
roleDefinitions.temu_lead = { ...roleDefinitions.leader };
roleDefinitions.temu_operator = { ...roleDefinitions.operator };
roleDefinitions.amazon_lead = { ...roleDefinitions.leader, platform: 'Amazon', platformKeys: ['Amazon'] };
roleDefinitions.amazon_operator = { ...roleDefinitions.operator, platform: 'Amazon', platformKeys: ['Amazon'] };
roleDefinitions.tiktok_lead = { ...roleDefinitions.leader, platform: 'TikTok', platformKeys: ['TikTok'] };
roleDefinitions.tiktok_operator = { ...roleDefinitions.operator, platform: 'TikTok', platformKeys: ['TikTok'] };

function normalizeMenuKey(value) {
  return menuKeyAliases[value] ?? value;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:sha256:${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [method, digest, iterationsText, salt, expectedHash] = String(passwordHash).split(':');

  if (method !== 'pbkdf2' || digest !== 'sha256' || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.pbkdf2Sync(String(password), salt, Number(iterationsText), 32, digest).toString('hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function getDefaultUsers() {
  const time = nowIso();
  return [
    {
      userId: 'user-admin',
      username: 'admin',
      passwordHash: 'pbkdf2:sha256:100000:44403aeba6b140d743b90e3cadaaf141:ab05743a9911f4c09b8a704168e9c8874c5ceecdd7c92ebda897ab3a966d6ff7',
      displayName: '管理员',
      role: 'admin',
      operatorId: '',
      teamId: '',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
    {
      userId: 'user-leader01',
      username: 'leader01',
      passwordHash: 'pbkdf2:sha256:100000:d55db140d4d594b4fd8fb42d7aea28f4:4f56c3bff5f7c8f21276edfcbdb16a3d8fff5012036cf90318337186b5608a58',
      displayName: '组长01',
      role: 'leader',
      operatorId: '',
      teamId: 'team-01',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
    {
      userId: 'user-operator01',
      username: 'operator01',
      passwordHash: 'pbkdf2:sha256:100000:ea2f5a455056617cf38744443d5b89eb:1ea6ce730af89b778c92ae6e94f3f1cdb86f23974e40bb31f2c3d264c59bff7f',
      displayName: '运营01',
      role: 'operator',
      operatorId: 'operator01',
      teamId: 'team-01',
      allowedStoreIds: [],
      status: 'active',
      createdAt: time,
      updatedAt: time,
    },
  ];
}

function toCurrentUser(user) {
  if (!user) {
    return null;
  }

  const permissions = resolveUserPermissions(user);
  const permission = getUserPermission(user.userId);
  const baseUser = {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleCode: permissions.roleCode,
    platform: permissions.platform,
    operatorId: user.operatorId ?? '',
    operatorName: user.operatorName ?? user.displayName ?? user.username ?? '',
    teamId: user.teamId ?? '',
    allowedStoreIds: normalizeAllowedStoreIds(permission?.visibleStoreIds ?? user.allowedStoreIds),
  };
  const visibleStoreKeys = baseUser.role === 'admin'
    ? []
    : unique(getVisibleStores(baseUser).flatMap((store) => [store.id, store.storeName].filter(Boolean)));

  return {
    ...baseUser,
    allowedStoreIds: baseUser.role === 'admin' ? [] : visibleStoreKeys,
    platformKeys: permissions.platformKeys,
    allowedMenuKeys: permissions.allowedMenuKeys,
    fieldPermissionKeys: permissions.fieldPermissionKeys,
    operationPermissionKeys: permissions.operationPermissionKeys,
    passwordUpdatedAt: user.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(user.forceChangePassword),
  };
}

function toPublicUser(user) {
  return {
    ...toCurrentUser(user),
    status: user.status === 'disabled' ? 'disabled' : 'active',
    passwordUpdatedAt: user.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(user.forceChangePassword),
    createdAt: user.createdAt ?? '',
    updatedAt: user.updatedAt ?? '',
  };
}

function isAlibaba1688Assignee(user) {
  const publicUser = toPublicUser(user);

  return publicUser.status === 'active' &&
    publicUser.role === 'operator' &&
    (
      publicUser.roleCode === '1688_sales' ||
      publicUser.platform === '1688' ||
      publicUser.platformKeys?.includes('1688') ||
      publicUser.allowedMenuKeys?.includes(menuKeys.business1688ListingTasks)
    );
}

function requireAdminLegacy(req, res) {
  const user = findCurrentUser(req);

  if (!user || user.role !== 'admin') {
    res.statusCode = 403;
    res.end(JSON.stringify({ success: false, message: '无权访问' }));
    return null;
  }

  return user;
}

function normalizeAllowedStoreIds(value) {
  return Array.isArray(value)
    ? unique(value.map((item) => String(item ?? '').trim()))
    : [];
}

function normalizeAllowedMenuKeys(value, role) {
  if (role === 'admin') {
    return allMenuKeys;
  }

  return Array.isArray(value)
    ? unique(value.map((item) => normalizeMenuKey(String(item ?? '').trim())).filter((item) => allMenuKeys.includes(item)))
    : [];
}

function normalizeRoleCode(value, role = 'operator') {
  const text = String(value ?? '').trim();
  if (Object.prototype.hasOwnProperty.call(roleDefinitions, text)) {
    return text;
  }

  return legacyRoleCodes.includes(role) ? role : 'operator';
}

function getRoleDefinition(roleCode, role = 'operator') {
  return roleDefinitions[normalizeRoleCode(roleCode, role)] ?? roleDefinitions.operator;
}

function normalizePlatformKeys(value, roleCode, role) {
  const definition = getRoleDefinition(roleCode, role);
  if (definition.role === 'admin') {
    return platformKeys;
  }

  return Array.isArray(value)
    ? unique(value.map((item) => String(item ?? '').trim()).filter((item) => platformKeys.includes(item)))
    : [...definition.platformKeys];
}

function normalizePermissionKeys(value, validKeys, defaults) {
  return Array.isArray(value)
    ? unique(value.map((item) => String(item ?? '').trim()).filter((item) => validKeys.includes(item)))
    : [...defaults];
}

function resolveUserPermissions(user) {
  if (!user) {
    return {
      roleCode: 'operator',
      platform: 'TEMU',
      platformKeys: [],
      allowedMenuKeys: [],
      fieldPermissionKeys: [],
      operationPermissionKeys: [],
    };
  }

  const roleCode = normalizeRoleCode(user.roleCode, user.role);
  const definition = getRoleDefinition(roleCode, user.role);
  const permission = getUserPermission(user.userId);

  if (definition.role === 'admin' || user.role === 'admin') {
    return {
      roleCode: 'admin',
      platform: user.platform ?? '',
      platformKeys,
      allowedMenuKeys: allMenuKeys,
      fieldPermissionKeys,
      operationPermissionKeys,
    };
  }

  return {
    roleCode,
    platform: platformKeys.includes(user.platform) ? user.platform : definition.platform,
    platformKeys: normalizePlatformKeys(permission?.platformKeys ?? user.platformKeys, roleCode, user.role),
    allowedMenuKeys: normalizeAllowedMenuKeys(permission?.allowedMenuKeys ?? user.allowedMenuKeys ?? definition.allowedMenuKeys, user.role),
    fieldPermissionKeys: normalizePermissionKeys(
      permission?.fieldPermissionKeys ?? user.fieldPermissionKeys,
      fieldPermissionKeys,
      definition.fieldPermissionKeys,
    ),
    operationPermissionKeys: normalizePermissionKeys(
      permission?.operationPermissionKeys ?? user.operationPermissionKeys,
      operationPermissionKeys,
      definition.operationPermissionKeys,
    ),
  };
}

function canAccessPlatform(currentUser, platform) {
  const value = String(platform ?? '').trim();
  if (!value) {
    return true;
  }

  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return true;
  }

  const permissions = resolveUserPermissions(currentUser);
  return permissions.platformKeys.includes(value);
}

function sanitizeSensitiveFields(value, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return value;
  }

  const permissions = resolveUserPermissions(currentUser);
  const allowedFields = new Set(permissions.fieldPermissionKeys);

  function sanitizeItem(item) {
    if (Array.isArray(item)) {
      return item.map(sanitizeItem);
    }

    if (!item || typeof item !== 'object') {
      return item;
    }

    return Object.fromEntries(Object.entries(item).map(([key, nestedValue]) => {
      const permissionKey = sensitiveFieldPermissionMap[key];
      if (permissionKey && !allowedFields.has(permissionKey)) {
        return [key, null];
      }

      return [key, sanitizeItem(nestedValue)];
    }));
  }

  return sanitizeItem(value);
}

function readUserPermissions() {
  const value = readJsonFile('userPermissions');
  return Array.isArray(value) ? value : [];
}

function getUserPermission(userId) {
  return readUserPermissions().find((item) => item?.userId === userId) ?? null;
}

function writeUserPermission(userId, payload, role) {
  const permissions = readUserPermissions();
  const current = permissions.find((item) => item?.userId === userId) ?? {};
  const roleCode = normalizeRoleCode(payload.roleCode ?? current.roleCode, role);
  const definition = getRoleDefinition(roleCode, role);
  const next = {
    ...current,
    userId,
    platformKeys: normalizePlatformKeys(payload.platformKeys ?? current.platformKeys, roleCode, role),
    visibleStoreIds: normalizeAllowedStoreIds(payload.allowedStoreIds ?? payload.visibleStoreIds ?? current.visibleStoreIds),
    allowedMenuKeys: normalizeAllowedMenuKeys(payload.allowedMenuKeys ?? current.allowedMenuKeys ?? definition.allowedMenuKeys, role),
    fieldPermissionKeys: normalizePermissionKeys(
      payload.fieldPermissionKeys ?? current.fieldPermissionKeys,
      fieldPermissionKeys,
      definition.fieldPermissionKeys,
    ),
    operationPermissionKeys: normalizePermissionKeys(
      payload.operationPermissionKeys ?? current.operationPermissionKeys,
      operationPermissionKeys,
      definition.operationPermissionKeys,
    ),
  };
  writeJsonFile('userPermissions', [
    ...permissions.filter((item) => item?.userId !== userId),
    next,
  ]);
}

function getAllowedMenuKeys(user) {
  if (!user) {
    return [];
  }

  return resolveUserPermissions(user).allowedMenuKeys;
}

function userCanAccessMenu(user, menuKey) {
  return user?.role === 'admin' || getAllowedMenuKeys(user).includes(menuKey);
}

function requireMenu(req, res, menuKey) {
  const user = findCurrentUser(req);

  if (!user || !userCanAccessMenu(user, menuKey)) {
    res.statusCode = 403;
    res.end(JSON.stringify({ success: false, message: '无权访问' }));
    return null;
  }

  return user;
}

function requireAdmin(req, res, message = '仅管理员可删除导入数据。') {
  const user = findCurrentUser(req);
  if (user?.role !== 'admin') {
    res.statusCode = 403;
    res.end(JSON.stringify({ ok: false, success: false, message, error: message }));
    return null;
  }

  return user;
}

function userCanOperate(currentUser, operationKey) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return true;
  }

  return resolveUserPermissions(currentUser).operationPermissionKeys.includes(operationKey);
}

function requireOperation(res, currentUser, operationKey, message = '当前账号无权执行该操作') {
  if (userCanOperate(currentUser, operationKey)) {
    return true;
  }

  res.statusCode = 403;
  res.end(JSON.stringify({ ok: false, success: false, message, error: message }));
  return false;
}

function normalizeUserPayload(payload, current) {
  const time = nowIso();
  const username = String(payload.username ?? current?.username ?? '').trim();
  const displayName = String(payload.displayName ?? current?.displayName ?? username).trim();
  const incomingRoleCode = normalizeRoleCode(payload.roleCode ?? current?.roleCode, payload.role ?? current?.role);
  const roleDefinition = getRoleDefinition(incomingRoleCode, payload.role ?? current?.role);
  const role = roleDefinition.role ?? current?.role ?? 'operator';
  const status = ['active', 'disabled'].includes(payload.status) ? payload.status : current?.status ?? 'active';

  if (!username) {
    throw new Error('username is required');
  }

  return {
    ...current,
    userId: current?.userId ?? payload.userId ?? createId('user'),
    username,
    displayName,
    role,
    roleCode: incomingRoleCode,
    platform: platformKeys.includes(payload.platform) ? payload.platform : current?.platform ?? roleDefinition.platform ?? '',
    operatorId: String(payload.operatorId ?? current?.operatorId ?? '').trim(),
    teamId: String(payload.teamId ?? current?.teamId ?? '').trim(),
    allowedStoreIds: normalizeAllowedStoreIds(payload.allowedStoreIds ?? current?.allowedStoreIds),
    status,
    passwordUpdatedAt: current?.passwordUpdatedAt ?? '',
    forceChangePassword: Boolean(current?.forceChangePassword),
    createdAt: current?.createdAt ?? time,
    updatedAt: time,
  };
}

function removeUserPermission(userId) {
  const permissions = readJsonFile('userPermissions');

  if (Array.isArray(permissions)) {
    writeJsonFile('userPermissions', permissions.filter((item) => item?.userId !== userId));
    return;
  }

  if (permissions && typeof permissions === 'object') {
    const next = { ...permissions };
    delete next[userId];
    writeJsonFile('userPermissions', next);
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret === 'replace-with-server-secret' || secret === 'replace-with-a-long-random-string')
  ) {
    throw new Error('生产环境必须配置有效 SESSION_SECRET');
  }

  return secret || 'dev-session-secret';
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', getSessionSecret()).update(sessionId).digest('hex');
}

function createCookie(sessionId) {
  return `${authCookieName}=${sessionId}.${signSessionId(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`;
}

function clearCookie() {
  return `${authCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((item) => {
    const [key, ...value] = item.trim().split('=');
    return [key, value.join('=')];
  }).filter(([key]) => key));
}

function getSignedSessionId(req) {
  const value = parseCookies(req)[authCookieName];
  const [sessionId, signature] = String(value ?? '').split('.');

  if (!sessionId || !signature || signSessionId(sessionId) !== signature) {
    return '';
  }

  return sessionId;
}

function readSessions() {
  const sessions = readJsonFile('authSessions');
  return sessions && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {};
}

function writeSessions(sessions) {
  writeJsonFile('authSessions', sessions);
}

function findCurrentUser(req) {
  const sessionId = getSignedSessionId(req);

  if (!sessionId) {
    return null;
  }

  const sessions = readSessions();
  const session = sessions[sessionId];

  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    delete sessions[sessionId];
    writeSessions(sessions);
    return null;
  }

  const users = readJsonFile('users');
  return Array.isArray(users)
    ? users.find((user) => user.userId === session.userId && user.status === 'active') ?? null
    : null;
}

async function handleAuthApi(req, res, next) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const pathname = (req.url ?? '').split('?')[0];

  if (pathname === '/login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const users = readJsonFile('users');
    const user = Array.isArray(users)
      ? users.find((item) => item.username === username && item.status === 'active')
      : null;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: '账号或密码错误' }));
      return;
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessions = readSessions();
    sessions[sessionId] = {
      userId: user.userId,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString(),
    };
    writeSessions(sessions);
    res.setHeader('Set-Cookie', createCookie(sessionId));
    res.end(JSON.stringify({ success: true, user: toCurrentUser(user) }));
    return;
  }

  if (pathname === '/me' && req.method === 'GET') {
    const user = findCurrentUser(req);
    res.end(JSON.stringify({ success: Boolean(user), user: toCurrentUser(user) }));
    return;
  }

  if (pathname === '/logout' && req.method === 'POST') {
    const sessionId = getSignedSessionId(req);
    const sessions = readSessions();

    if (sessionId) {
      delete sessions[sessionId];
      writeSessions(sessions);
    }

    res.setHeader('Set-Cookie', clearCookie());
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/change-password' && req.method === 'POST') {
    const currentUser = findCurrentUser(req);
    if (!currentUser) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: '请先登录' }));
      return;
    }

    const body = JSON.parse((await readBody(req)) || '{}');
    const password = String(body.password ?? '');
    if (!password) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '密码不能为空' }));
      return;
    }

    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const updatedAt = nowIso();
    const next = {
      ...currentUser,
      passwordHash: hashPassword(password),
      passwordUpdatedAt: updatedAt,
      forceChangePassword: false,
      updatedAt,
    };
    writeJsonFile('users', users.map((user) => user.userId === currentUser.userId ? next : user));
    res.end(JSON.stringify({ success: true, user: toCurrentUser(next) }));
    return;
  }

  if (pathname === '/users' && req.method === 'GET') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const users = readJsonFile('users');
    res.end(JSON.stringify({
      success: true,
      users: Array.isArray(users) ? users.map(toPublicUser) : [],
    }));
    return;
  }

  if (pathname === '/1688-assignees' && req.method === 'GET') {
    const user = findCurrentUser(req);
    const currentUser = user ? toCurrentUser(user) : null;
    const canReadAssignees = currentUser &&
      (
        currentUser.role === 'admin' ||
        currentUser.role === 'leader' ||
        currentUser.allowedMenuKeys?.includes(menuKeys.business1688ListingTasks)
      );

    if (!canReadAssignees) {
      res.statusCode = 403;
      res.end(JSON.stringify({ success: false, message: '无权访问' }));
      return;
    }

    const users = readJsonFile('users');
    res.end(JSON.stringify({
      success: true,
      users: Array.isArray(users) ? users.filter(isAlibaba1688Assignee).map(toPublicUser) : [],
    }));
    return;
  }

  if (pathname === '/users' && req.method === 'POST') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];

      if (users.some((user) => user.username === String(body.username ?? '').trim())) {
        res.statusCode = 409;
        res.end(JSON.stringify({ success: false, message: '用户名已存在' }));
        return;
      }
      const password = String(body.password ?? '') || defaultPassword;
      const updatedAt = nowIso();
      const user = {
        ...normalizeUserPayload(body),
        passwordHash: hashPassword(password),
        passwordUpdatedAt: updatedAt,
        forceChangePassword: true,
      };
      writeJsonFile('users', [...users, user]);
      writeUserPermission(user.userId, body, user.role);
      syncOperatorUsers();
      const syncedUser = (Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [])
        .find((item) => item.userId === user.userId) ?? user;
      res.end(JSON.stringify({ success: true, user: toPublicUser(syncedUser) }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
    return;
  }

  if (pathname.startsWith('/users/') && req.method === 'PUT') {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', ''));
    const body = JSON.parse((await readBody(req)) || '{}');
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    if (current.userId === adminUser.userId && body.status === 'disabled') {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能停用当前登录账号' }));
      return;
    }

    if (
      current.userId === adminUser.userId &&
      Array.isArray(body.allowedMenuKeys) &&
      !normalizeAllowedMenuKeys(body.allowedMenuKeys, body.role ?? current.role).includes(menuKeys.accountManagement)
    ) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能移除当前账号的账号管理权限' }));
      return;
    }

    const passwordChanged = Boolean(String(body.password ?? ''));
    const next = {
      ...normalizeUserPayload(body, current),
      passwordHash: passwordChanged ? hashPassword(body.password) : current.passwordHash,
      passwordUpdatedAt: passwordChanged ? nowIso() : current.passwordUpdatedAt ?? '',
      forceChangePassword: current.forceChangePassword ?? false,
    };
    writeJsonFile('users', users.map((user) => user.userId === userId ? next : user));
    writeUserPermission(next.userId, body, next.role);
    syncOperatorUsers();
    const syncedUser = (Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [])
      .find((user) => user.userId === userId) ?? next;
    res.end(JSON.stringify({ success: true, user: toPublicUser(syncedUser) }));
    return;
  }

  if (pathname.startsWith('/users/') && pathname.endsWith('/reset-password') && req.method === 'POST') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', '').replace('/reset-password', ''));
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    const updatedAt = nowIso();
    const next = {
      ...current,
      passwordHash: hashPassword(defaultPassword),
      passwordUpdatedAt: updatedAt,
      forceChangePassword: true,
      updatedAt,
    };
    writeJsonFile('users', users.map((user) => user.userId === userId ? next : user));
    res.end(JSON.stringify({ success: true, user: toPublicUser(next) }));
    return;
  }

  if (pathname.startsWith('/users/') && req.method === 'DELETE') {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) {
      return;
    }

    const userId = decodeURIComponent(pathname.replace('/users/', ''));
    const users = Array.isArray(readJsonFile('users')) ? readJsonFile('users') : [];
    const current = users.find((user) => user.userId === userId);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    if (current.username === 'admin' || current.userId === 'user-admin') {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '默认管理员账号不能删除' }));
      return;
    }

    if (current.userId === adminUser.userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '不能删除当前登录账号' }));
      return;
    }

    writeJsonFile('users', users.filter((user) => user.userId !== userId));
    removeUserPermission(userId);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (next) {
    next();
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, message: 'Not found' }));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultTaskSuggestionTemplates() {
  const defaults = [
    {
      id: 'suggestion-traffic',
      name: '流量下降处理建议',
      problemType: 'traffic',
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
  const time = nowIso();

  return defaults.map((item) => ({
    ...item,
    enabled: true,
    createdAt: time,
    updatedAt: time,
  }));
}

function normalizeStorePayload(payload, current) {
  const time = nowIso();
  const storeName = String(payload.storeName ?? current?.storeName ?? '').trim();

  if (!storeName) {
    throw new Error('storeName is required');
  }

  return {
    ...current,
    id: current?.id ?? payload.id ?? createId('store'),
    storeName,
    platform: platformKeys.includes(payload.platform)
      ? payload.platform
      : current?.platform ?? 'TEMU',
    platformStoreId: String(payload.platformStoreId ?? current?.platformStoreId ?? '').trim(),
    siteCountry: String(payload.siteCountry ?? current?.siteCountry ?? payload.country ?? current?.country ?? '').trim(),
    storeGroup: String(payload.storeGroup ?? current?.storeGroup ?? payload.groupName ?? current?.groupName ?? '').trim(),
    country: String(payload.country ?? current?.country ?? '').trim(),
    status: ['active', 'inactive', 'disabled', 'paused', 'closed'].includes(payload.status) ? payload.status : current?.status ?? 'active',
    groupName: String(payload.groupName ?? current?.groupName ?? '').trim(),
    remark: String(payload.remark ?? current?.remark ?? '').trim(),
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: time,
  };
}

function syncCommonStoreFromAlibabaStore(alibabaStore) {
  const storeName = String(alibabaStore?.storeName ?? '').trim();
  if (!storeName) {
    return;
  }

  const stores = Array.isArray(readJsonFile('stores')) ? readJsonFile('stores') : [];
  const time = nowIso();
  const id = String(alibabaStore.id ?? '').trim()
    ? `1688-${String(alibabaStore.id).trim()}`
    : `1688-${storeName}`;
  const current = stores.find((store) => store.id === id || (store.platform === '1688' && store.storeName === storeName));
  const next = {
    ...current,
    id: current?.id ?? id,
    storeName,
    platform: '1688',
    platformStoreId: String(alibabaStore.id ?? current?.platformStoreId ?? '').trim(),
    shopUrl: String(alibabaStore.shopUrl ?? current?.shopUrl ?? '').trim(),
    siteCountry: String(current?.siteCountry ?? '').trim(),
    storeGroup: String(current?.storeGroup ?? '').trim(),
    country: String(current?.country ?? '').trim(),
    status: alibabaStore.isActive === false ? 'inactive' : 'active',
    groupName: String(current?.groupName ?? '').trim(),
    remark: String(alibabaStore.remark ?? current?.remark ?? '来自1688店铺映射').trim(),
    createdAt: current?.createdAt ?? alibabaStore.createdAt ?? time,
    updatedAt: time,
  };

  writeJsonFile('stores', current
    ? stores.map((store) => store.id === current.id ? next : store)
    : [...stores, next]);
}

function getStores() {
  const stores = readJsonFile('stores');

  if (Array.isArray(stores) && stores.length > 0) {
    return stores;
  }

  const relations = readJsonFile('storeOperatorRelations');
  const time = nowIso();
  const storeMap = new Map();

  if (Array.isArray(relations)) {
    for (const relation of relations) {
      if (!relation?.storeName && !relation?.storeId) {
        continue;
      }

      const storeName = String(relation.storeName || relation.storeId).trim();
      const id = String(relation.storeId || storeName).trim();
      storeMap.set(id, {
        id,
        storeName,
        platform: String(relation.platform ?? 'TEMU'),
        platformStoreId: '',
        siteCountry: '',
        storeGroup: '',
        country: '',
        status: 'active',
        groupName: '',
        remark: '',
        createdAt: time,
        updatedAt: time,
      });
    }
  }

  const migratedStores = Array.from(storeMap.values());

  if (migratedStores.length > 0) {
    writeJsonFile('stores', migratedStores);
  }

  return migratedStores;
}

function getOperators() {
  syncOperatorUsers();
  const operators = readJsonFile('operators');

  if (Array.isArray(operators) && operators.length > 0) {
    return operators.map((operator) => ({
      ...operator,
      operatorName: operator.operatorName ?? operator.name ?? '',
      groupName: operator.groupName ?? '',
      level: operator.level ?? '',
      status: operator.status ?? 'active',
      remark: operator.remark ?? '',
    }));
  }

  const relations = readJsonFile('storeOperatorRelations');
  const time = nowIso();
  const operatorMap = new Map();

  if (Array.isArray(relations)) {
    for (const relation of relations) {
      if (!relation?.operatorName && !relation?.operatorId) {
        continue;
      }

      const operatorName = String(relation.operatorName || relation.operatorId).trim();
      const id = String(relation.operatorId || `operator-${operatorName}`).trim();
      operatorMap.set(id, {
        id,
        operatorName,
        groupName: '',
        level: '',
        status: 'active',
        remark: '',
        createdAt: time,
        updatedAt: time,
      });
    }
  }

  const migratedOperators = Array.from(operatorMap.values());

  if (migratedOperators.length > 0) {
    writeJsonFile('operators', migratedOperators);
  }

  return migratedOperators;
}

function normalizeSyncedOperatorName(value) {
  const rawName = String(value ?? '').trim();
  return rawName
    .replace(/^(temu|TEMU|Temu)\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .replace(/^(temu|TEMU|Temu)?\s*\u8FD0\u8425\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .replace(/^\u8FD0\u8425\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .replace(/^1688\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .replace(/^1688\s*(\u4E1A\u52A1\u5458|\u8FD0\u8425|\u9500\u552E)\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .replace(/^(\u4E1A\u52A1\u5458|1688\u9500\u552E|\u9500\u552E)\s*[-_:\uFF1A\uFF0D\u2014\u2013\s]*/u, '')
    .trim();
}

function isAccountSyncedOperator(operator) {
  return String(operator?.remark ?? '').includes('\u6765\u81EA\u8D26\u53F7\u7BA1\u7406');
}

function shouldPreferOperator(candidate, current, normalizedName) {
  const candidateName = String(candidate?.operatorName ?? candidate?.name ?? '').trim();
  const currentName = String(current?.operatorName ?? current?.name ?? '').trim();
  const candidateIsClean = candidateName === normalizedName;
  const currentIsClean = currentName === normalizedName;

  if (candidateIsClean !== currentIsClean) {
    return candidateIsClean;
  }

  const candidateIsSynced = isAccountSyncedOperator(candidate);
  const currentIsSynced = isAccountSyncedOperator(current);
  if (candidateIsSynced !== currentIsSynced) {
    return !candidateIsSynced;
  }

  return false;
}

function mergeOperatorRecords(target, source, normalizedName, time) {
  return {
    ...target,
    operatorName: normalizedName,
    groupName: String(target.groupName ?? '').trim() || String(source.groupName ?? '').trim(),
    level: String(target.level ?? '').trim() || String(source.level ?? '').trim(),
    status: target.status === 'active' || source.status === 'active' ? 'active' : (target.status || source.status || 'active'),
    remark: String(target.remark ?? '').trim() || String(source.remark ?? '').trim(),
    createdAt: target.createdAt ?? source.createdAt ?? time,
    updatedAt: time,
  };
}

function normalizeOperatorCollection(operators) {
  if (!Array.isArray(operators)) {
    return [];
  }

  const time = nowIso();
  const canonicalByName = new Map();

  operators.forEach((operator) => {
    const rawName = String(operator?.operatorName ?? operator?.name ?? '').trim();
    const operatorName = normalizeSyncedOperatorName(rawName) || rawName;
    if (!operatorName) {
      return;
    }

    const normalizedOperator = {
      ...operator,
      operatorName,
    };
    const current = canonicalByName.get(operatorName);
    if (!current) {
      canonicalByName.set(operatorName, normalizedOperator);
      return;
    }

    const preferred = shouldPreferOperator(normalizedOperator, current, operatorName) ? normalizedOperator : current;
    const merged = preferred === current
      ? mergeOperatorRecords(current, normalizedOperator, operatorName, time)
      : mergeOperatorRecords(normalizedOperator, current, operatorName, time);
    canonicalByName.set(operatorName, merged);
  });

  return Array.from(canonicalByName.values());
}

function getOperatorNameFromUser(user) {
  const displayName = String(user?.displayName ?? '').trim();
  const username = String(user?.username ?? '').trim();
  const rawName = displayName || username;
  const cleanedName = normalizeSyncedOperatorName(rawName);

  return cleanedName || username;
}

function shouldSyncUserToOperator(user) {
  return user?.role === 'operator' || normalizeRoleCode(user?.roleCode, user?.role) === 'operator';
}

function syncOperatorUsers() {
  const users = readJsonFile('users');
  const operators = readJsonFile('operators');

  if (!Array.isArray(users) || !Array.isArray(operators)) {
    return;
  }

  const time = nowIso();
  let operatorsChanged = false;
  let usersChanged = false;
  const operatorIdRedirect = new Map();
  const canonicalByName = new Map();

  operators.forEach((operator) => {
    const rawName = String(operator.operatorName ?? operator.name ?? '').trim();
    const operatorName = normalizeSyncedOperatorName(rawName) || rawName;
    const normalizedOperator = {
      ...operator,
      operatorName,
    };

    if (operatorName !== rawName) {
      operatorsChanged = true;
    }

    const current = canonicalByName.get(operatorName);
    if (!current) {
      canonicalByName.set(operatorName, normalizedOperator);
      return;
    }

    operatorsChanged = true;
    const preferred = shouldPreferOperator(normalizedOperator, current, operatorName) ? normalizedOperator : current;
    const merged = preferred === current
      ? mergeOperatorRecords(current, normalizedOperator, operatorName, time)
      : mergeOperatorRecords(normalizedOperator, current, operatorName, time);
    const dropped = preferred === current ? normalizedOperator : current;

    canonicalByName.set(operatorName, merged);
    if (dropped.id && merged.id && dropped.id !== merged.id) {
      operatorIdRedirect.set(String(dropped.id), String(merged.id));
    }
  });

  const nextOperators = Array.from(canonicalByName.values());
  const operatorById = new Map(nextOperators.map((operator) => [String(operator.id), operator]));
  const operatorByName = new Map(nextOperators.map((operator) => [String(operator.operatorName ?? '').trim(), operator]));
  const nextUsers = users.map((user) => {
    if (!shouldSyncUserToOperator(user)) {
      return user;
    }

    const operatorName = getOperatorNameFromUser(user);
    if (!operatorName) {
      return user;
    }

    const userOperatorId = String(user.operatorId ?? '').trim();
    const canonicalOperatorId = operatorIdRedirect.get(userOperatorId) || userOperatorId;
    const currentOperator = canonicalOperatorId
      ? operatorById.get(canonicalOperatorId)
      : null;
    let operator = currentOperator || operatorByName.get(operatorName);

    if (!operator) {
      operator = {
        id: createId('operator'),
        operatorName,
        groupName: '',
        level: '',
        status: user.status === 'disabled' ? 'inactive' : 'active',
        remark: user.platform ? `来自账号管理：${user.platform}` : '来自账号管理',
        createdAt: time,
        updatedAt: time,
      };
      nextOperators.push(operator);
      operatorById.set(operator.id, operator);
      operatorByName.set(operatorName, operator);
      operatorsChanged = true;
    }

    if (String(user.operatorId ?? '') !== operator.id || String(user.operatorName ?? '') !== String(operator.operatorName ?? '')) {
      usersChanged = true;
      return {
        ...user,
        operatorId: operator.id,
        operatorName: operator.operatorName,
        updatedAt: time,
      };
    }

    return user;
  });

  const relations = readJsonFile('storeOperatorRelations');
  if (Array.isArray(relations)) {
    let relationsChanged = false;
    const nextRelations = relations.map((relation) => {
      const relationOperatorId = String(relation.operatorId ?? '').trim();
      const canonicalOperatorId = operatorIdRedirect.get(relationOperatorId) || relationOperatorId;
      const relationName = normalizeSyncedOperatorName(relation.operatorName ?? '');
      const operator = (canonicalOperatorId ? operatorById.get(canonicalOperatorId) : null) || operatorByName.get(relationName);

      if (!operator) {
        return relation;
      }

      if (relation.operatorId === operator.id && relation.operatorName === operator.operatorName) {
        return relation;
      }

      relationsChanged = true;
      return {
        ...relation,
        operatorId: operator.id,
        operatorName: operator.operatorName,
        updatedAt: time,
      };
    });

    if (relationsChanged) {
      writeJsonFile('storeOperatorRelations', nextRelations);
    }
  }

  if (operatorsChanged) {
    writeJsonFile('operators', nextOperators);
  }

  if (usersChanged) {
    writeJsonFile('users', nextUsers);
  }
}

function normalizeRelationPayload(payload, current) {
  const time = nowIso();
  const rawRole = String(payload.role ?? current?.role ?? '').trim();
  const role = ['primary', 'assistant', 'temporary'].includes(rawRole) ? rawRole : 'primary';
  const status = ['active', 'inactive'].includes(payload.status)
    ? payload.status
    : ['active', 'inactive'].includes(current?.status)
      ? current.status
      : 'active';

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('relation'),
    storeId: String(payload.storeId ?? current?.storeId ?? payload.storeName ?? current?.storeName ?? '').trim(),
    operatorId: String(payload.operatorId ?? current?.operatorId ?? '').trim(),
    role,
    platform: String(payload.platform ?? current?.platform ?? 'TEMU').trim() || 'TEMU',
    startDate: String(payload.startDate ?? current?.startDate ?? '').trim(),
    endDate: String(payload.endDate ?? current?.endDate ?? '').trim(),
    status,
    remark: String(payload.remark ?? current?.remark ?? '').trim(),
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: time,
  };
}

function dateRangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  const startA = String(firstStart || '0000-01-01');
  const endA = String(firstEnd || '9999-12-31');
  const startB = String(secondStart || '0000-01-01');
  const endB = String(secondEnd || '9999-12-31');
  return startA <= endB && startB <= endA;
}

function assertUniquePrimaryRelation(relations, relation) {
  if (relation.status === 'inactive' || relation.role !== 'primary') {
    return;
  }

  const duplicate = relations.find((item) =>
    item.id !== relation.id &&
    item.status !== 'inactive' &&
    item.role === 'primary' &&
    String(item.storeId || item.storeName || '').trim() === String(relation.storeId || relation.storeName || '').trim() &&
    dateRangesOverlap(item.startDate, item.endDate, relation.startDate, relation.endDate),
  );

  if (duplicate) {
    const error = new Error('同一个店铺同一时间只能有一个 active primary 负责人');
    error.statusCode = 409;
    throw error;
  }
}

function findTaskAssignee(storeId, storeName) {
  const storeKey = String(storeId || storeName || '').trim();
  if (!storeKey) {
    return null;
  }

  const relation = readCollection('storeOperatorRelations')
    .find((item) => item.status !== 'inactive' && (item.storeId === storeKey || item.storeName === storeKey));
  const operator = relation?.operatorId ? getOperators().find((item) => item.id === relation.operatorId) : null;

  return relation ? {
    operatorId: relation.operatorId || operator?.id || '',
    operatorName: relation.operatorName || operator?.operatorName || '',
  } : null;
}

function findTaskStore(storeId, storeName) {
  const storeKey = String(storeId || storeName || '').trim();
  if (!storeKey) {
    return null;
  }

  return getStores().find((store) => store.id === storeKey || store.storeName === storeKey) ?? null;
}

function firstNonBlank(...values) {
  return String(values.find((value) => String(value ?? '').trim()) ?? '').trim();
}

function normalizeTaskPayload(payload, current) {
  const time = nowIso();
  const isReadNormalization = Boolean(current) && payload === current;
  const title = String(payload.title ?? current?.title ?? '').trim();
  const storeName = String(payload.storeName ?? current?.storeName ?? '').trim();
  const storeId = firstNonBlank(payload.storeId, current?.storeId);
  const store = findTaskStore(storeId, storeName);
  const assignee = findTaskAssignee(storeId, storeName);
  const sourceType = ['manual', 'warning', 'opportunity', 'risk_warning', 'operation_anomaly', 'growth_opportunity'].includes(payload.sourceType)
    ? payload.sourceType
    : current?.sourceType ?? 'manual';
  const priority = ['high', 'medium', 'low'].includes(payload.priority)
    ? payload.priority
    : current?.priority ?? 'medium';
  const status = ['todo', 'doing', 'done', 'closed'].includes(payload.status)
    ? payload.status
    : current?.status ?? 'todo';
  const reviewStatus = ['none', 'improved', 'watching', 'not_improved', 'unknown'].includes(payload.reviewStatus)
    ? payload.reviewStatus
    : current?.reviewStatus ?? 'none';
  const wasCompleted = current?.status === 'done' || current?.status === 'closed';
  const isCompleted = status === 'done' || status === 'closed';
  const completedAt = isReadNormalization
    ? current?.completedAt ?? ''
    : isCompleted
      ? current?.completedAt || time
      : wasCompleted
        ? ''
        : current?.completedAt ?? '';

  if (!title) {
    throw new Error('title is required');
  }

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('task'),
    title,
    platform: firstNonBlank(payload.platform, current?.platform, store?.platform),
    storeId,
    storeName,
    operatorId: firstNonBlank(payload.operatorId, current?.operatorId, assignee?.operatorId),
    operatorName: firstNonBlank(payload.operatorName, current?.operatorName, assignee?.operatorName),
    sourceType,
    sourceId: String(payload.sourceId ?? current?.sourceId ?? '').trim(),
    taskDedupKey: String(payload.taskDedupKey ?? current?.taskDedupKey ?? '').trim(),
    latestAnomalyDate: String(payload.latestAnomalyDate ?? current?.latestAnomalyDate ?? '').trim(),
    anomalyDurationDays: Number.isFinite(Number(payload.anomalyDurationDays ?? current?.anomalyDurationDays))
      ? Number(payload.anomalyDurationDays ?? current?.anomalyDurationDays)
      : 0,
    latestSeverity: String(payload.latestSeverity ?? current?.latestSeverity ?? '').trim(),
    latestTriggerTime: String(payload.latestTriggerTime ?? current?.latestTriggerTime ?? '').trim(),
    sourceContent: String(payload.sourceContent ?? current?.sourceContent ?? '').trim(),
    suggestion: String(payload.suggestion ?? current?.suggestion ?? '').trim(),
    priority,
    status,
    dueDate: String(payload.dueDate ?? current?.dueDate ?? '').trim(),
    resultNote: String(payload.resultNote ?? current?.resultNote ?? '').trim(),
    reviewStatus,
    reviewNote: String(payload.reviewNote ?? current?.reviewNote ?? '').trim(),
    reviewedAt: reviewStatus !== 'none'
      ? payload.reviewedAt ?? current?.reviewedAt ?? time
      : '',
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: isReadNormalization ? current?.updatedAt ?? time : time,
    completedAt,
  };
}

function normalizeTaskSuggestionTemplatePayload(payload, current) {
  const time = nowIso();
  const name = String(payload.name ?? current?.name ?? '').trim();
  const content = String(payload.content ?? current?.content ?? '').trim();
  const problemType = ['traffic', 'conversion', 'deal', 'opportunity'].includes(payload.problemType)
    ? payload.problemType
    : current?.problemType ?? 'traffic';

  if (!name) {
    throw new Error('name is required');
  }

  if (!content) {
    throw new Error('content is required');
  }

  return {
    ...current,
    ...payload,
    id: current?.id ?? payload.id ?? createId('suggestion'),
    name,
    problemType,
    content,
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : current?.enabled ?? true,
    sortWeight: Number.isFinite(Number(payload.sortWeight ?? current?.sortWeight))
      ? Number(payload.sortWeight ?? current?.sortWeight)
      : 0,
    createdAt: current?.createdAt ?? payload.createdAt ?? time,
    updatedAt: payload === current ? current?.updatedAt ?? time : time,
  };
}

function readCollection(name) {
  const value = readJsonFile(name);

  if (!Array.isArray(value)) {
    return [];
  }

  if (name === 'tasks') {
    let changed = false;
    const next = value.map((item) => {
      const normalized = normalizeTaskPayload(item, item);
      changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
      return normalized;
    });

    if (changed) {
      writeJsonFile(name, next);
    }

    return next;
  }

  if (name === 'taskSuggestionTemplates') {
    const templates = value.length > 0 ? value : getDefaultTaskSuggestionTemplates();
    let changed = value.length === 0;
    const next = templates.map((item) => {
      const normalized = normalizeTaskSuggestionTemplatePayload(item, item);
      changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
      return normalized;
    });

    if (changed) {
      writeJsonFile(name, next);
    }

    return next;
  }

  if (name !== 'storeOperatorRelations') {
    return value;
  }

  let changed = false;
  const next = value.map((item) => {
    const normalized = normalizeRelationPayload(item, item);
    changed = changed || JSON.stringify(normalized) !== JSON.stringify(item);
    return normalized;
  });

  if (changed) {
    writeJsonFile(name, next);
  }

  return next;
}

function mergeTemuPostgresCollection(name, jsonData, postgresData) {
  if (!Array.isArray(postgresData) || postgresData.length === 0) {
    return jsonData;
  }

  if (name === 'stores') {
    const postgresIds = new Set(postgresData.map((item) => item.id).filter(Boolean));
    const postgresNames = new Set(postgresData.map((item) => item.storeName).filter(Boolean));
    return [
      ...(Array.isArray(jsonData) ? jsonData.filter((item) => (
        String(item?.platform ?? '').toUpperCase() !== 'TEMU' &&
        !postgresIds.has(item?.id) &&
        !postgresNames.has(item?.storeName)
      )) : []),
      ...postgresData,
    ];
  }

  if (name === 'operators') {
    const postgresIds = new Set(postgresData.map((item) => item.id).filter(Boolean));
    const postgresNames = new Set(postgresData.map((item) => normalizeSyncedOperatorName(item.operatorName) || item.operatorName).filter(Boolean));
    return normalizeOperatorCollection([
      ...(Array.isArray(jsonData) ? jsonData.filter((item) => (
        !postgresIds.has(item?.id) &&
        !postgresNames.has(normalizeSyncedOperatorName(item?.operatorName) || item?.operatorName)
      )) : []),
      ...postgresData,
    ]);
  }

  if (name === 'storeOperatorRelations') {
    const postgresIds = new Set(postgresData.map((item) => item.id).filter(Boolean));
    return [
      ...(Array.isArray(jsonData) ? jsonData.filter((item) => (
        String(item?.platform ?? '').toUpperCase() !== 'TEMU' &&
        !postgresIds.has(item?.id)
      )) : []),
      ...postgresData,
    ];
  }

  return jsonData;
}

async function readCollectionForApi(name) {
  const jsonData = name === 'stores' ? getStores() : name === 'operators' ? getOperators() : readCollection(name);
  if (!['stores', 'operators', 'storeOperatorRelations'].includes(name) || !preferTemuPostgresReads()) {
    return jsonData;
  }

  try {
    const postgresData = await readTemuCollectionFromPostgres(name);
    return mergeTemuPostgresCollection(name, jsonData, postgresData);
  } catch (error) {
    console.warn(`[TEMU PostgreSQL] ${name} read fallback to JSON:`, error instanceof Error ? error.message : error);
    return jsonData;
  }
}

async function mirrorTemuReferenceJsonToPostgres() {
  try {
    await syncTemuReferenceJsonToPostgres({
      stores: getStores(),
      operators: getOperators(),
      relations: readCollection('storeOperatorRelations'),
    });
    clearNewProductCenterApiCache();
  } catch (error) {
    console.warn('[TEMU PostgreSQL] reference sync skipped:', error instanceof Error ? error.message : error);
  }
}

async function readPersistentDataForApi(name, filePath) {
  if (!preferTemuPostgresReads()) {
    return readJsonFileCached(name);
  }

  if (name === 'orderImportStore') {
    try {
      const postgresData = await readOrderImportStoreFromPostgres();
      const postgresOrderCount = (postgresData?.batches ?? []).reduce((total, batch) => total + (batch?.orders ?? []).length, 0);
      const jsonData = readJsonFileCached(name);
      const jsonOrderCount = (jsonData?.batches ?? []).reduce((total, batch) => total + (batch?.orders ?? []).length, 0);
      if (jsonOrderCount > postgresOrderCount) {
        console.warn('[TEMU PostgreSQL] orderImportStore stale in PostgreSQL, fallback to JSON');
        return jsonData;
      }
      if (postgresOrderCount > 0) {
        return postgresData;
      }
      if (jsonOrderCount > 0) {
        console.warn('[TEMU PostgreSQL] orderImportStore empty in PostgreSQL, fallback to JSON');
        return jsonData;
      }
      return postgresData;
    } catch (error) {
      console.warn('[TEMU PostgreSQL] orderImportStore read fallback to JSON:', error instanceof Error ? error.message : error);
      return readJsonFileCached(name);
    }
  }

  if (name === 'trafficConversionStore') {
    try {
      const postgresData = await readTrafficConversionStoreFromPostgres();
      const jsonData = readJsonFileCached(name);
      const postgresRecordCount = (postgresData?.records ?? []).length;
      const postgresBatchCount = (postgresData?.batches ?? []).length;
      const jsonRecordCount = (jsonData?.records ?? []).length;
      const jsonBatchCount = (jsonData?.batches ?? []).length;
      if (jsonRecordCount > postgresRecordCount || jsonBatchCount > postgresBatchCount) {
        console.warn('[TEMU PostgreSQL] trafficConversionStore stale in PostgreSQL, fallback to JSON');
        return jsonData;
      }
      if ((postgresData?.records ?? []).length > 0 || (postgresData?.batches ?? []).length > 0) {
        return postgresData;
      }

      return (jsonData?.records ?? []).length > 0 || (jsonData?.batches ?? []).length > 0 ? jsonData : postgresData;
    } catch (error) {
      console.warn('[TEMU PostgreSQL] trafficConversionStore read fallback to JSON:', error instanceof Error ? error.message : error);
    }
  }

  return readJsonFileCached(name);
}

async function rebuildOrderImportSnapshots(orderStore) {
  const dates = new Set();
  for (const batch of orderStore?.batches ?? []) {
    for (const order of batch?.orders ?? []) {
      const date = String(order?.orderDate || order?.orderTime || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dates.add(date);
      }
    }
  }

  if (dates.size === 0) {
    await rebuildNewProductSnapshots({});
    return;
  }

  for (const snapshotDate of Array.from(dates).sort()) {
    await rebuildNewProductSnapshots({ snapshotDate });
  }
}

async function mirrorPersistentTemuDataToPostgres(name, data) {
  try {
    if (name === 'orderImportStore') {
      await replaceOrderStoreInPostgres(data);
      await rebuildOrderImportSnapshots(data);
    } else if (name === 'trafficConversionStore') {
      await syncTrafficStoreToPostgres(data);
    } else if (name === 'trafficWarningRules') {
      await syncWarningRulesToPostgres(data);
    }
  } catch (error) {
    console.error(`[TEMU PostgreSQL] ${name} sync failed:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

function filterSalaryAttendanceRecords(data, searchParams) {
  const startDate = String(searchParams.get('startDate') ?? '').trim();
  const endDate = String(searchParams.get('endDate') ?? '').trim();
  const period = String(searchParams.get('period') ?? '').trim();
  const employeeId = String(searchParams.get('employeeId') ?? '').trim();

  if (!startDate && !endDate && !period && !employeeId) {
    return data;
  }

  return (Array.isArray(data) ? data : []).filter((record) => {
    const workDate = String(record?.workDate ?? '');
    const matchesDate = (!startDate || workDate >= startDate) && (!endDate || workDate <= endDate);
    const matchesPeriod = !period || String(record?.periodKey ?? workDate.slice(0, 7)) === period;
    const matchesEmployee = !employeeId || String(record?.employeeId ?? '') === employeeId;
    return matchesDate && matchesPeriod && matchesEmployee;
  });
}

function isCompanyDashboardRead(req) {
  if (req.method !== 'GET') {
    return false;
  }

  const requestUrl = new URL(req.url ?? '/', 'http://local');
  return requestUrl.searchParams.get('scope') === 'company-dashboard';
}

async function handleCollectionApi(req, res, name, prefix) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const menuKey = getCollectionMenuKey(name);
    const currentUser = readCurrentUser(req);

    if (isCompanyDashboardRead(req) && ['stores', 'operators', 'storeOperatorRelations'].includes(name)) {
      const data = await readCollectionForApi(name);
      res.end(JSON.stringify(data));
      return;
    }

    if (req.method === 'GET' && ['stores', 'operators', 'storeOperatorRelations'].includes(name) && menuKey) {
      if (currentUser?.role === 'admin' || userCanAccessMenu(findCurrentUser(req), menuKey)) {
        const data = await readCollectionForApi(name);
        res.end(JSON.stringify(filterCollectionForUser(name, data, currentUser)));
        return;
      }

      if (name === 'stores') {
        res.end(JSON.stringify(getVisibleStores(currentUser)));
        return;
      }

      if (name === 'storeOperatorRelations') {
        res.end(JSON.stringify(filterCollectionForUser(name, readCollection(name), currentUser)));
        return;
      }

      res.end(JSON.stringify([]));
      return;
    }

    if (menuKey && !requireMenu(req, res, menuKey)) {
      return;
    }

    if (req.method === 'GET') {
      const requestUrl = new URL(req.url ?? '/', 'http://local');
      const data = await readCollectionForApi(name);
      const filteredData = name === 'salaryAttendanceRecords'
        ? filterSalaryAttendanceRecords(data, requestUrl.searchParams)
        : data;
      res.end(JSON.stringify(filterCollectionForUser(name, filteredData, currentUser)));
      return;
    }

    const id = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/+/, ''));
    const collection = readCollection(name);

    if (req.method === 'POST') {
      if (!requireOperation(res, currentUser, 'create', '当前账号无权新增数据')) {
        return;
      }

      const body = JSON.parse((await readBody(req)) || '{}');
      if (name === 'stores') {
        const next = normalizeStorePayload(body);
        if (!requireStoreWriteScope(req, res, name, next, currentUser)) {
          return;
        }
        writeJsonFile(name, [...getStores(), next]);
        await mirrorTemuReferenceJsonToPostgres();
        res.end(JSON.stringify(next));
        return;
      }

      const next = name === 'storeOperatorRelations'
        ? normalizeRelationPayload(body)
        : name === 'tasks'
          ? normalizeTaskPayload(body)
        : name === 'taskSuggestionTemplates'
          ? normalizeTaskSuggestionTemplatePayload(body)
        : name === 'operators'
          ? {
              ...body,
              id: body.id || createId(prefix),
              operatorName: String(body.operatorName ?? body.name ?? '').trim(),
              groupName: String(body.groupName ?? '').trim(),
              level: String(body.level ?? '').trim(),
              status: ['active', 'inactive'].includes(body.status) ? body.status : 'active',
              remark: String(body.remark ?? '').trim(),
              createdAt: body.createdAt || nowIso(),
              updatedAt: nowIso(),
            }
        : { ...body, id: body.id || createId(prefix), createdAt: body.createdAt || nowIso(), updatedAt: nowIso() };
      if (name === 'storeOperatorRelations') {
        if (!requireStoreWriteScope(req, res, name, next, currentUser)) {
          return;
        }
        assertUniquePrimaryRelation(collection, next);
      }
      writeJsonFile(name, [...collection, next]);
      if (['operators', 'storeOperatorRelations'].includes(name)) {
        await mirrorTemuReferenceJsonToPostgres();
      }
      res.end(JSON.stringify(next));
      return;
    }

    if (req.method === 'PUT' && id) {
      if (!requireOperation(res, currentUser, 'edit', '当前账号无权编辑数据')) {
        return;
      }

      const body = JSON.parse((await readBody(req)) || '{}');
      if (name === 'stores') {
        const stores = getStores();
        const current = stores.find((item) => item.id === id);

        if (!current) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const next = normalizeStorePayload(body, current);
        if (!requireStoreWriteScope(req, res, name, current, currentUser) || !requireStoreWriteScope(req, res, name, next, currentUser)) {
          return;
        }
        writeJsonFile(name, stores.map((item) => item.id === id ? next : item));
        await mirrorTemuReferenceJsonToPostgres();
        res.end(JSON.stringify(next));
        return;
      }

      const current = collection.find((item) => item.id === id);

      if (!current) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (name === 'tasks' && currentUser?.role !== 'admin' && !itemMatchesVisibleTask(current, getVisibleStoreKeys(currentUser), currentUser)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '无权编辑该任务' }));
        return;
      }

      if (name === 'tasks' && body.status === 'closed' && currentUser?.role !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '普通运营无权关闭任务' }));
        return;
      }

      const updateBody = name === 'tasks' && currentUser?.role !== 'admin'
        ? {
            status: body.status,
            resultNote: body.resultNote,
            reviewStatus: body.reviewStatus,
            reviewNote: body.reviewNote,
          }
        : body;
      const next = name === 'storeOperatorRelations'
        ? normalizeRelationPayload(updateBody, current)
        : name === 'tasks'
          ? normalizeTaskPayload(updateBody, current)
        : name === 'taskSuggestionTemplates'
          ? normalizeTaskSuggestionTemplatePayload(updateBody, current)
        : name === 'operators'
          ? {
              ...current,
              ...updateBody,
              id,
              operatorName: String(updateBody.operatorName ?? updateBody.name ?? current.operatorName ?? current.name ?? '').trim(),
              groupName: String(updateBody.groupName ?? current.groupName ?? '').trim(),
              level: String(updateBody.level ?? current.level ?? '').trim(),
              status: ['active', 'inactive'].includes(updateBody.status) ? updateBody.status : current.status ?? 'active',
              remark: String(updateBody.remark ?? current.remark ?? '').trim(),
              updatedAt: nowIso(),
          }
        : { ...current, ...updateBody, id, updatedAt: nowIso() };
      if (name === 'storeOperatorRelations') {
        if (!requireStoreWriteScope(req, res, name, current, currentUser) || !requireStoreWriteScope(req, res, name, next, currentUser)) {
          return;
        }
        assertUniquePrimaryRelation(collection, next);
      }
      writeJsonFile(name, collection.map((item) => item.id === id ? next : item));
      if (['operators', 'storeOperatorRelations'].includes(name)) {
        await mirrorTemuReferenceJsonToPostgres();
      }
      res.end(JSON.stringify(next));
      return;
    }

    if (req.method === 'DELETE' && id) {
      if (!requireOperation(res, currentUser, 'delete', '当前账号无权删除数据')) {
        return;
      }

      if (name === 'tasks' && currentUser?.role !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '普通运营无权删除任务' }));
        return;
      }

      if (name === 'stores') {
        const current = getStores().find((item) => item.id === id);
        if (!current) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        if (!requireStoreWriteScope(req, res, name, current, currentUser)) {
          return;
        }
      }

      if (name === 'storeOperatorRelations') {
        const current = collection.find((item) => item.id === id);
        if (!current) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        if (!requireStoreWriteScope(req, res, name, current, currentUser)) {
          return;
        }
      }

      writeJsonFile(name, (name === 'stores' ? getStores() : collection).filter((item) => item.id !== id));
      if (['stores', 'operators', 'storeOperatorRelations'].includes(name)) {
        await mirrorTemuReferenceJsonToPostgres();
      }
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    res.statusCode = error?.statusCode || 500;
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCurrentUser(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value;
}

function readCurrentUser(req) {
  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const sessionUser = toCurrentUser(findCurrentUser(req));

  if (sessionUser) {
    return sessionUser;
  }

  const currentUserText = requestUrl.searchParams.get('currentUser');

  if (currentUserText) {
    try {
      return normalizeCurrentUser(JSON.parse(currentUserText));
    } catch {
      return null;
    }
  }

  return normalizeCurrentUser({
    role: requestUrl.searchParams.get('role') || undefined,
    id: requestUrl.searchParams.get('id') || undefined,
    userId: requestUrl.searchParams.get('userId') || undefined,
    username: requestUrl.searchParams.get('username') || undefined,
    account: requestUrl.searchParams.get('account') || undefined,
    name: requestUrl.searchParams.get('name') || undefined,
    operatorId: requestUrl.searchParams.get('operatorId') || undefined,
    operatorName: requestUrl.searchParams.get('operatorName') || undefined,
    teamId: requestUrl.searchParams.get('teamId') || undefined,
    groupName: requestUrl.searchParams.get('groupName') || undefined,
  });
}

function getUserKeys(currentUser) {
  return unique([
    currentUser?.operatorId,
    currentUser?.operatorName,
    currentUser?.id,
    currentUser?.userId,
    currentUser?.username,
    currentUser?.account,
    currentUser?.name,
  ].map((value) => String(value ?? '').trim()));
}

function relationMatchesOperator(relation, operatorKeys) {
  return operatorKeys.includes(String(relation?.operatorId ?? '').trim()) ||
    operatorKeys.includes(String(relation?.operatorName ?? '').trim());
}

function getStoreIdFromRelation(relation) {
  return String(relation?.storeId || relation?.storeName || '').trim();
}

function getAllowedStoreIds(currentUser) {
  return Array.isArray(currentUser?.allowedStoreIds)
    ? unique(currentUser.allowedStoreIds.map((item) => String(item ?? '').trim()))
    : [];
}

function getVisibleStoreIds(currentUser) {
  const stores = getStores();
  const relations = readCollection('storeOperatorRelations');
  const role = String(currentUser?.role ?? '').toLowerCase();
  const activeRelations = relations.filter((relation) => relation.status !== 'inactive');

  if (role === 'admin') {
    return unique(stores.map((store) => store.id || store.storeName));
  }

  if (role === 'operator' || role === 'leader') {
    const allowedStoreIds = getAllowedStoreIds(currentUser);
    if (allowedStoreIds.length > 0) {
      return allowedStoreIds;
    }

    const operatorKeys = getUserKeys(currentUser);

    return unique(activeRelations
      .filter((relation) => relationMatchesOperator(relation, operatorKeys))
      .map(getStoreIdFromRelation));
  }

  return [];
}

function getVisibleStores(currentUser) {
  const stores = getStores();
  const storeIds = getVisibleStoreIds(currentUser);
  const storeIdSet = new Set(storeIds);

  return stores.filter((store) => (
    canAccessPlatform(currentUser, store.platform) &&
    (storeIdSet.has(store.id) || storeIdSet.has(store.storeName))
  ));
}

async function attachTemuStoreDatabaseIds(stores) {
  const temuStores = stores.filter(isTemuStore);
  if (temuStores.length === 0 || !preferTemuPostgresReads()) {
    return stores;
  }

  try {
    const postgresStores = await readTemuCollectionFromPostgres('stores');
    const byLegacyId = new Map(postgresStores.map((store) => [String(store.id || '').trim(), store.dbId]).filter(([key, value]) => key && value));
    const byName = new Map(postgresStores.map((store) => [String(store.storeName || '').trim(), store.dbId]).filter(([key, value]) => key && value));
    return stores.map((store) => ({
      ...store,
      dbId: isTemuStore(store) ? (byLegacyId.get(String(store.id || '').trim()) || byName.get(String(store.storeName || '').trim()) || store.dbId) : store.dbId,
    }));
  } catch (error) {
    console.warn('[TEMU PostgreSQL] visible stores dbId mapping skipped:', error instanceof Error ? error.message : error);
    return stores;
  }
}

function isTemuStore(store) {
  return String(store?.platform ?? 'TEMU').trim().toUpperCase() === 'TEMU';
}

function getTemuStores() {
  return getStores().filter(isTemuStore);
}

function getTemuVisibleStores(currentUser) {
  const stores = getTemuStores();
  const role = String(currentUser?.role ?? '').toLowerCase();

  if (role === 'admin') {
    return stores;
  }

  const storeIds = getVisibleStoreIds(currentUser);
  const storeIdSet = new Set(storeIds);

  return stores.filter((store) => (
    canAccessPlatform(currentUser, store.platform) &&
    (storeIdSet.has(store.id) || storeIdSet.has(store.storeName))
  ));
}

function getVisibleStoreKeys(currentUser) {
  return new Set(getVisibleStores(currentUser).flatMap((store) => [store.id, store.storeName].filter(Boolean)));
}

function getTemuVisibleStoreKeys(currentUser) {
  return new Set(getTemuVisibleStores(currentUser).flatMap((store) => [store.id, store.storeName].filter(Boolean)));
}

function normalizeSearchText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

function findKnownStoreByKey(storeKey) {
  const normalizedKey = normalizeSearchText(storeKey);
  if (!normalizedKey) {
    return null;
  }

  return getStores().find((store) =>
    normalizeSearchText(store?.id) === normalizedKey ||
    normalizeSearchText(store?.storeName) === normalizedKey,
  ) ?? null;
}

function itemMatchesTemuImportStore(item) {
  const explicitPlatform = String(item?.platform ?? '').trim();
  if (explicitPlatform) {
    return explicitPlatform.toUpperCase() === 'TEMU';
  }

  const store = findKnownStoreByKey(item?.storeId) ?? findKnownStoreByKey(item?.storeName);
  return store ? isTemuStore(store) : true;
}

function isTemuImportStoreKey(storeKey) {
  const store = findKnownStoreByKey(storeKey);
  return store ? isTemuStore(store) : true;
}

function itemMatchesVisibleStore(item, visibleStoreKeys) {
  return visibleStoreKeys.has(String(item?.storeId ?? '').trim()) ||
    visibleStoreKeys.has(String(item?.storeName ?? '').trim());
}

function itemMatchesVisibleStoreRecord(item, visibleStoreKeys) {
  return visibleStoreKeys.has(String(item?.id ?? '').trim()) ||
    visibleStoreKeys.has(String(item?.storeName ?? '').trim());
}

function itemMatchesPlatform(item, currentUser) {
  if (!item || typeof item !== 'object') {
    return true;
  }

  return canAccessPlatform(currentUser, item.platform);
}

function canWriteStoreScopedItem(name, item, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return true;
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);

  if (name === 'stores') {
    return itemMatchesVisibleStoreRecord(item, visibleStoreKeys);
  }

  if (name === 'storeOperatorRelations') {
    return itemMatchesVisibleStore(item, visibleStoreKeys);
  }

  return true;
}

function requireStoreWriteScope(req, res, name, item, currentUser) {
  if (canWriteStoreScopedItem(name, item, currentUser)) {
    return true;
  }

  res.statusCode = 403;
  res.end(JSON.stringify({ ok: false, success: false, message: '当前账号无权修改该店铺数据' }));
  return false;
}

function itemMatchesVisibleTask(item, visibleStoreKeys, currentUser) {
  const operatorKeys = new Set(getUserKeys(currentUser));
  return itemMatchesVisibleStore(item, visibleStoreKeys) ||
    operatorKeys.has(String(item?.operatorId ?? '').trim()) ||
    operatorKeys.has(String(item?.operatorName ?? '').trim());
}

function getStoreKeysFromItems(items) {
  return unique((items ?? []).flatMap((item) => [
    String(item?.storeId ?? '').trim(),
    String(item?.storeName ?? '').trim(),
  ]));
}

function getImportStoreKeys(name, data) {
  if (name === 'orderImportStore') {
    return getStoreKeysFromItems((data?.batches ?? []).flatMap((batch) => batch.orders ?? []));
  }

  if (name === 'trafficConversionStore') {
    return getStoreKeysFromItems([...(data?.records ?? []), ...(data?.batches ?? [])]);
  }

  return [];
}

function mergeOrderImportAppendWithExisting(existingData, incoming) {
  const existing = existingData || { batches: [] };
  const incomingBatches = Array.isArray(incoming?.batches)
    ? incoming.batches
    : Array.isArray(incoming?.orders)
      ? [{
        ...incoming,
        batchId: incoming.batchId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }]
      : [];
  const stores = getStores();
  const normalizeOrderStoreName = (value) => {
    const name = String(value ?? '').trim();
    const key = name.replace(/\s+/g, '').toLowerCase();
    if (key === 'h点' || key === 'h店' || key === 'honeyjewels') {
      return 'H店';
    }
    const store = stores.find((item) => String(item?.storeName ?? '').replace(/\s+/g, '').toLowerCase() === key);
    return store?.storeName || name;
  };
  const getOrderReplaceKey = (order) => {
    const storeName = normalizeOrderStoreName(order?.storeName);
    const orderDate = String(order?.orderDate ?? order?.date ?? '').slice(0, 10);
    return storeName && orderDate ? `${storeName}|${orderDate}` : '';
  };
  const replacePairs = new Set(incomingBatches.flatMap((batch) =>
    (batch.orders ?? []).map(getOrderReplaceKey).filter(Boolean),
  ));
  let removedDataCount = 0;
  const batches = (existing?.batches ?? [])
    .map((batch) => {
      const oldOrders = batch.orders ?? [];
      const orders = oldOrders.filter((order) => !replacePairs.has(getOrderReplaceKey(order)));
      removedDataCount += oldOrders.length - orders.length;
      return { ...batch, orders, validRows: orders.length };
    })
    .filter((batch) => batch.orders.length > 0);
  const existingBatchCount = (existing?.batches ?? []).length;
  const incomingBatchCount = incomingBatches.length;
  const finalBatchCount = batches.length + incomingBatchCount;
  const existingDataCount = (existing?.batches ?? []).reduce((total, batch) => total + (batch.orders ?? []).length, 0);
  const newDataCount = incomingBatches.reduce((total, batch) => total + (batch.orders ?? []).length, 0);
  const finalDataCount = batches.reduce((total, batch) => total + (batch.orders ?? []).length, 0) + newDataCount;
  const affectedKeys = Array.from(replacePairs);

  console.info('[order-import-save]', {
    incomingShape: Array.isArray(incoming?.batches) ? 'batches' : Array.isArray(incoming?.orders) ? 'orders' : typeof incoming,
    existingBatchCount,
    removedBatchCount: existingBatchCount - batches.length,
    incomingBatchCount,
    finalBatchCount,
    existingDataCount,
    removedDataCount,
    newDataCount,
    finalDataCount,
    affectedStores: unique(affectedKeys.map((key) => key.split('|')[0]).filter(Boolean)),
    affectedDates: unique(affectedKeys.map((key) => key.split('|')[1]).filter(Boolean)),
  });

  return { ...existing, batches: [...batches, ...incomingBatches] };
}

function mergeOrderImportAppend(incoming) {
  return mergeOrderImportAppendWithExisting(readJsonFile('orderImportStore'), incoming);
}

function summarizeOrderImportStore(data) {
  const batches = Array.isArray(data?.batches) ? data.batches : [];
  return {
    recordCount: batches.length,
    orderCount: batches.reduce((total, batch) => total + (Array.isArray(batch?.orders) ? batch.orders.length : 0), 0),
    batches: batches.map((batch) => ({
      batchId: batch?.batchId ?? batch?.id ?? '',
      fileName: batch?.fileName ?? '',
      importedAt: batch?.importedAt ?? '',
      stores: unique((batch?.orders ?? []).map((order) => String(order?.storeName ?? '').trim()).filter(Boolean)),
      dates: unique((batch?.orders ?? []).map((order) => String(order?.orderDate ?? order?.date ?? '').slice(0, 10)).filter(Boolean)),
      count: Array.isArray(batch?.orders) ? batch.orders.length : 0,
    })),
  };
}

function getTrafficRecordKeys(record) {
  const date = String(record?.date ?? '').trim();
  return unique([
    String(record?.storeId ?? '').trim(),
    String(record?.storeName ?? '').trim(),
  ].filter(Boolean).map((storeKey) => `${storeKey}|${date}`));
}

function mergeTrafficConversionImportWithExisting(existingData, incoming) {
  const existing = existingData || { records: [], batches: [] };
  const incomingRecords = Array.isArray(incoming?.records) ? incoming.records : [];
  const incomingKeys = new Set(incomingRecords.flatMap(getTrafficRecordKeys));
  const records = [
    ...(existing?.records ?? []).filter((record) => !getTrafficRecordKeys(record).some((key) => incomingKeys.has(key))),
    ...incomingRecords,
  ];
  const batches = [
    ...(existing?.batches ?? []).filter((batch) => {
      const recordKeys = Array.isArray(batch?.recordKeys) ? batch.recordKeys : [];
      return recordKeys.length === 0 || !recordKeys.every((key) => incomingKeys.has(String(key ?? '').trim()));
    }),
    ...(incoming?.batches ?? []),
  ];

  return { ...existing, ...incoming, records, batches };
}

function mergeTrafficConversionImport(incoming) {
  return mergeTrafficConversionImportWithExisting(readJsonFile('trafficConversionStore'), incoming);
}

function buildTrafficImportBatch(records, coveredCount, batchId) {
  const dates = records.map((record) => String(record?.date ?? '')).filter(Boolean).sort();
  const firstRecord = records[0] ?? {};
  const detailCount = records.length;
  const detailPayConversionRateAvg = detailCount
    ? records.reduce((total, record) => total + (Number(record?.detailPayConversionRate) || 0), 0) / detailCount
    : 0;

  return {
    id: batchId,
    importedAt: firstRecord.importedAt || nowIso(),
    platform: firstRecord.platform || 'Other',
    storeId: firstRecord.storeId || '',
    platformStoreId: firstRecord.platformStoreId || '',
    storeName: firstRecord.storeName || '',
    fileName: firstRecord.fileName || '',
    dateStart: dates[0] ?? '',
    dateEnd: dates.at(-1) ?? '',
    detailCount,
    coveredCount,
    newCount: Math.max(detailCount - coveredCount, 0),
    productVisitorsTotal: records.reduce((total, record) => total + (Number(record?.productVisitors) || 0), 0),
    totalPayBuyersTotal: records.reduce((total, record) => total + (Number(record?.totalPayBuyers) || 0), 0),
    detailPayConversionRateAvg,
    status: detailCount === 0 ? 'missing' : coveredCount > 0 ? 'covered' : 'success',
    recordKeys: records.map((record) => `${record.storeName}|${record.date}`),
  };
}

function mergeTrafficConversionAppendWithExisting(existingData, incoming, filePath) {
  const existing = existingData || { records: [], batches: [] };
  const incomingRecords = Array.isArray(incoming?.records) ? incoming.records : [];
  const incomingKeys = new Set(incomingRecords.flatMap(getTrafficRecordKeys));
  const existingRecords = existing?.records ?? [];
  const coveredCount = existingRecords.filter((record) => getTrafficRecordKeys(record).some((key) => incomingKeys.has(key))).length;
  const records = [
    ...existingRecords.filter((record) => !getTrafficRecordKeys(record).some((key) => incomingKeys.has(key))),
    ...incomingRecords,
  ];
  const batchId = incomingRecords[0]?.batchId || `traffic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batch = buildTrafficImportBatch(incomingRecords, coveredCount, batchId);
  const batches = [
    ...(existing?.batches ?? []).filter((item) => {
      const recordKeys = Array.isArray(item?.recordKeys) ? item.recordKeys : [];
      return recordKeys.length === 0 || !recordKeys.every((key) => incomingKeys.has(String(key ?? '').trim()));
    }),
    batch,
  ];
  const fileSizeMB = fs.existsSync(filePath) ? Number((fs.statSync(filePath).size / 1024 / 1024).toFixed(2)) : 0;
  console.log('[Traffic Import Save]', {
    filePath,
    existingCount: existingRecords.length,
    newCount: incomingRecords.length,
    finalCount: records.length,
    fileSizeMB,
  });

  return { data: { ...existing, records, batches }, batch };
}

function mergeTrafficConversionAppend(incoming, filePath) {
  return mergeTrafficConversionAppendWithExisting(readJsonFile('trafficConversionStore'), incoming, filePath);
}

function deleteTrafficConversionBatchFromStore(existingData, payload, filePath) {
  const batchId = String(payload?.batchId ?? '').trim();
  if (!batchId) {
    throw new Error('缺少要删除的流量导入批次 ID');
  }

  const existing = existingData || { records: [], batches: [] };
  const existingRecords = Array.isArray(existing?.records) ? existing.records : [];
  const existingBatches = Array.isArray(existing?.batches) ? existing.batches : [];
  const batchExists = existingBatches.some((batch) => String(batch?.id ?? '') === batchId);
  if (!batchExists) {
    return {
      data: existing,
      summary: {
        batchId,
        deleted: false,
        removedBatchCount: 0,
        removedRecordCount: 0,
        beforeBatchCount: existingBatches.length,
        afterBatchCount: existingBatches.length,
        filePath,
      },
    };
  }

  const records = existingRecords.filter((record) => String(record?.batchId ?? '') !== batchId);
  const batches = existingBatches.filter((batch) => String(batch?.id ?? '') !== batchId);
  const fileSizeMB = fs.existsSync(filePath) ? Number((fs.statSync(filePath).size / 1024 / 1024).toFixed(2)) : 0;
  const summary = {
    batchId,
    deleted: true,
    removedBatchCount: existingBatches.length - batches.length,
    removedRecordCount: existingRecords.length - records.length,
    beforeBatchCount: existingBatches.length,
    afterBatchCount: batches.length,
    filePath,
    fileSizeMB,
  };
  console.log('[Traffic Import Delete]', summary);

  return { data: { ...existing, records, batches }, summary };
}

function deleteTrafficConversionBatch(payload, filePath) {
  return deleteTrafficConversionBatchFromStore(readJsonFile('trafficConversionStore'), payload, filePath);
}

function assertTrafficImportSearchText(searchableText, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return;
  }

  const authorizedStores = getTemuVisibleStores(currentUser);
  if (authorizedStores.length === 0) {
    throw new Error('当前账号未配置可导入店铺，请联系管理员。');
  }

  const authorizedKeys = new Set(authorizedStores.flatMap((store) => [store.id, store.storeName].filter(Boolean)));
  const searchable = normalizeSearchText(searchableText);
  const blockedStores = getTemuStores()
    .filter((store) => !authorizedKeys.has(store.id) && !authorizedKeys.has(store.storeName))
    .filter((store) => store.storeName && searchable.includes(normalizeSearchText(store.storeName)))
    .map((store) => store.storeName);

  if (blockedStores.length > 0) {
    throw new Error(`导入失败：当前文件包含未授权店铺【${unique(blockedStores).join('、')}】，请重新检查文件。`);
  }
}

function assertImportDataMatchesTemu(name, data) {
  if (!['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return;
  }

  const blockedStores = unique(getImportStoreKeys(name, data).filter((storeKey) => !isTemuImportStoreKey(storeKey)));
  if (blockedStores.length > 0) {
    throw new Error(`导入失败：${blockedStores.join('、')} 不是 TEMU 店铺，请不要在订单销售导入或流量转化导入中导入。`);
  }
}

function assertCanWriteImportData(name, data, currentUser, searchableText = '') {
  assertImportDataMatchesTemu(name, data);

  if (String(currentUser?.role ?? '').toLowerCase() === 'admin' || !['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return;
  }

  if (name === 'trafficConversionStore') {
    assertTrafficImportSearchText(searchableText, currentUser);
  }

  const visibleStoreKeys = getTemuVisibleStoreKeys(currentUser);
  if (visibleStoreKeys.size === 0) {
    throw new Error('当前账号未配置可导入店铺，请联系管理员。');
  }

  const blockedStore = getImportStoreKeys(name, data).find((storeKey) => !visibleStoreKeys.has(storeKey));

  if (blockedStore) {
    throw new Error('当前账号无权导入该店铺数据');
  }
}

function mergeVisibleImportData(name, incoming, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin' || !['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return incoming;
  }

  const existing = readJsonFile(name);
  const visibleStoreKeys = getTemuVisibleStoreKeys(currentUser);

  if (name === 'orderImportStore') {
    const hiddenBatches = (existing?.batches ?? []).map((batch) => ({
      ...batch,
      orders: (batch.orders ?? []).filter((order) => !itemMatchesVisibleStore(order, visibleStoreKeys)),
    })).filter((batch) => batch.orders.length > 0);

    return { ...incoming, batches: [...hiddenBatches, ...(incoming?.batches ?? [])] };
  }

  return {
    ...incoming,
    ...mergeTrafficConversionImport(incoming),
  };
}

function attendanceRecordKey(record) {
  const periodKey = String(record?.periodKey || '').trim();
  const employeeKey = normalizeAttendanceEmployeeName(record?.employeeName);
  const workDate = String(record?.workDate || '').trim();
  if (!periodKey || !employeeKey || !workDate) return '';
  return [periodKey, employeeKey, workDate].join('|');
}

function attendanceRecordDateKey(record) {
  const periodKey = String(record?.periodKey || '').trim();
  const workDate = String(record?.workDate || '').trim();
  return periodKey && workDate ? [periodKey, workDate].join('|') : '';
}

function normalizeAttendanceEmployeeName(value) {
  return String(value ?? '').replace(/\u3000/g, ' ').trim().replace(/\s+/g, '');
}

function mergeAttendanceRecords(existing, incoming) {
  const merged = new Map();

  (Array.isArray(existing) ? existing : []).forEach((record) => {
    const key = attendanceRecordKey(record);
    if (key) merged.set(key, record);
  });

  (Array.isArray(incoming) ? incoming : []).forEach((record) => {
    const key = attendanceRecordKey(record);
    if (!key) return;

    let current = merged.get(key);
    if (!current && record?.employeeId && record?.sourceEmployeeCode) {
      const dateKey = attendanceRecordDateKey(record);
      const sourceCode = String(record.sourceEmployeeCode).trim();
      const repairEntry = Array.from(merged.entries()).find(([, item]) => (
        item?.status === 'unmatched_employee' &&
        attendanceRecordDateKey(item) === dateKey &&
        String(item?.sourceEmployeeCode || item?.employeeCode || '').trim() === sourceCode
      ));
      if (repairEntry) {
        current = repairEntry[1];
        merged.delete(repairEntry[0]);
      }
    }

    const currentEmployeeId = String(current?.employeeId || '').trim();
    const incomingEmployeeId = String(record?.employeeId || '').trim();
    if (currentEmployeeId && incomingEmployeeId && currentEmployeeId !== incomingEmployeeId) {
      merged.set(key, {
        ...current,
        status: 'conflict_employee_match',
        remark: String(current?.remark || '员工匹配冲突，请人工核对。'),
      });
      return;
    }

    merged.set(key, {
      ...current,
      ...record,
      id: current?.id || record.id,
      createdAt: current?.createdAt || record.createdAt,
    });
  });

  return Array.from(merged.values());
}

function filterCollectionForUser(name, data, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return sanitizeSensitiveFields(data, currentUser);
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);
  const sanitize = (value) => sanitizeSensitiveFields(value, currentUser);

  if (name === 'stores') {
    return sanitize(getVisibleStores(currentUser));
  }

  if (name === 'tasks') {
    return sanitize(Array.isArray(data) ? data.filter((item) => itemMatchesPlatform(item, currentUser) && itemMatchesVisibleTask(item, visibleStoreKeys, currentUser)) : data);
  }

  if (name === 'storeOperatorRelations') {
    return sanitize(Array.isArray(data) ? data.filter((item) => itemMatchesPlatform(item, currentUser) && itemMatchesVisibleStore(item, visibleStoreKeys)) : data);
  }

  return sanitize(Array.isArray(data) ? data.filter((item) => itemMatchesPlatform(item, currentUser)) : data);
}

function filterPersistentDataForUser(name, data, currentUser) {
  if (!currentUser && ['orderImportStore', 'trafficConversionStore'].includes(name)) {
    return data;
  }

  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return sanitizeSensitiveFields(data, currentUser);
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);
  const sanitize = (value) => sanitizeSensitiveFields(value, currentUser);

  if (name === 'orderImportStore' && data?.batches) {
    return sanitize({
      ...data,
      batches: data.batches.map((batch) => ({
        ...batch,
        orders: (batch.orders ?? []).filter((order) => itemMatchesPlatform(order, currentUser) && itemMatchesVisibleStore(order, visibleStoreKeys)),
      })).filter((batch) => batch.orders.length > 0),
    });
  }

  if (name === 'trafficConversionStore') {
    return sanitize({
      ...data,
      records: (data?.records ?? []).filter((record) => itemMatchesPlatform(record, currentUser) && itemMatchesVisibleStore(record, visibleStoreKeys)),
      batches: (data?.batches ?? []).filter((batch) => itemMatchesPlatform(batch, currentUser) && itemMatchesVisibleStore(batch, visibleStoreKeys)),
    });
  }

  if (['orderDailySummary', 'trafficDailySummary', 'riskResults', 'growthOpportunities', 'businessAnalysisItems'].includes(name)) {
    return sanitize({
      ...data,
      items: (data?.items ?? []).filter((item) => itemMatchesPlatform(item, currentUser) && itemMatchesVisibleStore(item, visibleStoreKeys)),
    });
  }

  return sanitize(data);
}

function normalizePersistentCacheParams(searchParams) {
  const params = new URLSearchParams(searchParams);
  params.delete('t');
  return Array.from(params.entries())
    .sort(([firstKey, firstValue], [secondKey, secondValue]) => (
      firstKey.localeCompare(secondKey) || firstValue.localeCompare(secondValue)
    ))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function getPersistentUserScopeKey(currentUser, companyDashboardRead) {
  if (companyDashboardRead) {
    return 'company-dashboard';
  }

  return [
    currentUser?.role ?? '',
    currentUser?.roleCode ?? '',
    currentUser?.id ?? '',
    currentUser?.username ?? '',
    currentUser?.operatorId ?? '',
    currentUser?.displayName ?? '',
    [...(currentUser?.allowedStoreIds ?? [])].sort().join('|'),
  ].join('::');
}

function getPersistentResponseCacheKey(name, searchParams, currentUser, companyDashboardRead) {
  if (!['orderImportStore', 'trafficConversionStore', 'riskResults', 'growthOpportunities', 'businessAnalysisItems', 'trafficDailySummary'].includes(name)) {
    return '';
  }

  const view = searchParams.get('view') || '';
  if ((name === 'orderImportStore' || name === 'trafficConversionStore') && !view) {
    return '';
  }

  return [
    name,
    normalizePersistentCacheParams(searchParams),
    getPersistentUserScopeKey(currentUser, companyDashboardRead),
  ].join('::');
}

function readPersistentResponseCache(key) {
  if (!key) {
    return undefined;
  }

  const cached = persistentResponseCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    persistentResponseCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function writePersistentResponseCache(key, value) {
  if (!key) {
    return;
  }

  persistentResponseCache.set(key, {
    value,
    expiresAt: Date.now() + persistentResponseCacheTtlMs,
  });
}

function filterEffectiveListingsForUser(items, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin' || !currentUser) {
    return sanitizeSensitiveFields(items, currentUser);
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);
  return sanitizeSensitiveFields(
    items.filter((item) => itemMatchesPlatform(item, currentUser) && itemMatchesVisibleStore(item, visibleStoreKeys)),
    currentUser,
  );
}

function filterEffectiveListingsByQuery(items, searchParams) {
  const startParam = searchParams.get('dateStart') || searchParams.get('startDate') || '';
  const endParam = searchParams.get('dateEnd') || searchParams.get('endDate') || '';
  const recentDays = Number(searchParams.get('recentDays') || searchParams.get('days') || 0);
  let startDate = startParam;
  let endDate = endParam;

  if (!startDate && !endDate && Number.isFinite(recentDays) && recentDays > 0) {
    const latestDate = items
      .map((item) => String(item?.siteJoinDate || '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1);
    if (latestDate) {
      const start = new Date(`${latestDate}T00:00:00`);
      start.setDate(start.getDate() - Math.ceil(recentDays) + 1);
      startDate = formatOrderDateKey(start);
      endDate = latestDate;
    }
  }

  if (!startDate && !endDate) return items;
  return items.filter((item) => {
    const date = String(item?.siteJoinDate || '').slice(0, 10);
    return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
}

async function handleEffectiveNewListingsApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const queryParams = Object.fromEntries(requestUrl.searchParams.entries());
    const currentUser = readCurrentUser(req);
    const items = Array.isArray(readJsonFile('effectiveNewListings')) ? readJsonFile('effectiveNewListings') : [];

    if (req.method === 'GET') {
      let data = filterEffectiveListingsByQuery(items, requestUrl.searchParams);
      try {
        const productInfoItems = await readEffectiveListingsFromProductImport(queryParams);
        data = productInfoItems.length > 0 ? productInfoItems : items;
      } catch (error) {
        console.warn('[TEMU PostgreSQL] effective listings from product import fallback to JSON:', error instanceof Error ? error.message : error);
      }
      data = filterEffectiveListingsByQuery(data, requestUrl.searchParams);
      res.end(JSON.stringify(isCompanyDashboardRead(req) ? data : filterEffectiveListingsForUser(data, currentUser)));
      return;
    }

    if (!currentUser) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, success: false, message: '请先登录' }));
      return;
    }

    if (req.method === 'POST') {
      res.statusCode = 410;
      res.end(JSON.stringify({ ok: false, success: false, message: '有效上新录入页面已下线，请使用商品信息导入。' }));
      return;
    }

    if (req.method === 'PUT') {
      res.statusCode = 410;
      res.end(JSON.stringify({ ok: false, success: false, message: '有效上新录入页面已下线，请使用商品信息导入。' }));
      return;
    }

    if (req.method === 'DELETE') {
      res.statusCode = 410;
      res.end(JSON.stringify({ ok: false, success: false, message: '有效上新录入页面已下线，请使用商品信息导入。' }));
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.statusCode = message.includes('必填') || message.includes('至少') || message.includes('重复') ? 400 : 500;
    res.end(JSON.stringify({ ok: false, success: false, message, error: message }));
  }
}

function getNewProductCenterScope(currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return {};
  }

  return {
    storeNames: getTemuVisibleStores(currentUser).map((store) => store.storeName).filter(Boolean),
  };
}

function appendSearchParams(requestUrl, extra) {
  return {
    ...Object.fromEntries(requestUrl.searchParams.entries()),
    ...extra,
  };
}

const temuImportPreviewCache = new Map();
const temuImportPreviewTtlMs = 30 * 60 * 1000;

function cleanupTemuImportPreviewCache() {
  const now = Date.now();
  for (const [previewId, preview] of temuImportPreviewCache.entries()) {
    if (!preview?.createdAt || now - preview.createdAt > temuImportPreviewTtlMs) {
      temuImportPreviewCache.delete(previewId);
    }
  }
}

function saveTemuImportPreview(type, payload) {
  cleanupTemuImportPreviewCache();
  const previewId = crypto.randomUUID();
  temuImportPreviewCache.set(previewId, {
    ...payload,
    type,
    createdAt: Date.now(),
  });
  return previewId;
}

function getTemuImportPreview(previewId, type) {
  cleanupTemuImportPreviewCache();
  const preview = temuImportPreviewCache.get(String(previewId || ''));
  if (!preview || preview.type !== type) {
    return null;
  }
  return preview;
}

async function handleTemuProductInfoImportApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const currentUser = readCurrentUser(req);
    if (!currentUser) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, message: '请先登录' }));
      return;
    }
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const action = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
    if (req.method === 'GET' && action === 'ranking-summary') {
      const scope = getNewProductCenterScope(currentUser);
      res.end(JSON.stringify(await getProductImportRankingSummary({
        ...Object.fromEntries(requestUrl.searchParams.entries()),
        ...scope,
      })));
      return;
    }
    if (req.method === 'GET' && action === 'records') {
      const scope = getNewProductCenterScope(currentUser);
      res.end(JSON.stringify(await getProductImportOverview({
        ...Object.fromEntries(requestUrl.searchParams.entries()),
        ...scope,
      })));
      return;
    }
    if (req.method === 'DELETE' && action.startsWith('batches/')) {
      if (String(currentUser.role || '').toLowerCase() !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '仅管理员可删除商品信息导入批次。' }));
        return;
      }
      const batchId = decodeURIComponent(action.replace(/^batches\//, ''));
      const result = await deleteProductImportBatch(batchId);
      clearOperationWorkbenchDashboardCache();
      clearNewProductCenterApiCache();
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }
    const bodyText = await readBody(req);
    console.info('[temu-product-info-api]', {
      method: req.method,
      action,
      bodySize: bodyText.length,
    });
    const body = JSON.parse(bodyText || '{}');
    if (action === 'upload' || action === 'preview') {
      const parsed = body.rows ? { rows: body.rows, headers: body.headers || Object.keys(body.rows[0] || {}) } : parseExcelDataUrl(body.dataUrl);
      assertImportFileShape({ headers: parsed.headers, type: 'product' });
      const previewId = saveTemuImportPreview('product', {
        fileName: body.fileName || '',
        rows: parsed.rows,
        headers: parsed.headers,
      });
      console.info('[temu-product-info-preview]', {
        fileName: body.fileName || '',
        previewId,
        rows: parsed.rows.length,
        headers: parsed.headers.length,
      });
      res.end(JSON.stringify({ ok: true, previewId, fileName: body.fileName || '', rows: [], ...buildImportPreview({ ...parsed, type: 'product' }) }));
      return;
    }
    if (action === 'confirm') {
      const cachedPreview = getTemuImportPreview(body.previewId, 'product');
      const rows = cachedPreview?.rows || body.rows || [];
      const headers = cachedPreview?.headers || Object.keys(rows[0] || {});
      const fileName = body.fileName || cachedPreview?.fileName || '';
      assertImportFileShape({ headers, mapping: body.mapping || {}, type: 'product' });
      console.info('[temu-product-info-confirm-start]', {
        fileName,
        previewId: body.previewId || '',
        storeName: body.storeName || '',
        rows: Array.isArray(rows) ? rows.length : 0,
      });
      const result = await importProductRows({
        rows,
        mapping: body.mapping || {},
        fileName,
        storeName: body.storeName || '',
        currentUser,
      });
      if (body.previewId) {
        temuImportPreviewCache.delete(String(body.previewId));
      }
      console.info('[temu-product-info-confirm-done]', {
        fileName,
        totalRows: result.totalRows,
        successRows: result.successRows,
        errorRows: result.errorRows,
      });
      clearOperationWorkbenchDashboardCache();
      clearNewProductCenterApiCache();
      res.end(JSON.stringify(result));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, message: 'Not found' }));
  } catch (error) {
    console.error('[temu-product-info-api-error]', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.statusCode = messageIncludesImportError(error) ? 400 : 500;
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}

function messageIncludesImportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('导入信息错误');
}

async function handleTemuAdReportImportApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const currentUser = readCurrentUser(req);
    if (!currentUser) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, message: '请先登录' }));
      return;
    }
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const action = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
    if (req.method === 'GET' && action === 'records') {
      const scope = getNewProductCenterScope(currentUser);
      res.end(JSON.stringify(await getAdImportOverview({
        ...Object.fromEntries(requestUrl.searchParams.entries()),
        ...scope,
      })));
      return;
    }
    if (req.method === 'DELETE' && action.startsWith('batches/')) {
      if (String(currentUser.role || '').toLowerCase() !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, message: '仅管理员可删除广告数据导入批次。' }));
        return;
      }
      const batchId = decodeURIComponent(action.replace(/^batches\//, ''));
      const result = await deleteAdImportBatch(batchId);
      clearOperationWorkbenchDashboardCache();
      clearNewProductCenterApiCache();
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }
    const bodyText = await readBody(req);
    console.info('[temu-ad-report-api]', {
      method: req.method,
      action,
      bodySize: bodyText.length,
    });
    const body = JSON.parse(bodyText || '{}');
    if (action === 'upload' || action === 'preview') {
      const parsed = body.rows ? { rows: body.rows, headers: body.headers || Object.keys(body.rows[0] || {}) } : parseExcelDataUrl(body.dataUrl);
      assertImportFileShape({ headers: parsed.headers, type: 'ad' });
      const previewId = saveTemuImportPreview('ad', {
        fileName: body.fileName || '',
        rows: parsed.rows,
        headers: parsed.headers,
      });
      console.info('[temu-ad-report-preview]', {
        fileName: body.fileName || '',
        previewId,
        rows: parsed.rows.length,
        headers: parsed.headers.length,
      });
      res.end(JSON.stringify({ ok: true, previewId, fileName: body.fileName || '', rows: [], ...buildImportPreview({ ...parsed, type: 'ad' }) }));
      return;
    }
    if (action === 'confirm') {
      const cachedPreview = getTemuImportPreview(body.previewId, 'ad');
      const rows = cachedPreview?.rows || body.rows || [];
      const headers = cachedPreview?.headers || Object.keys(rows[0] || {});
      const fileName = body.fileName || cachedPreview?.fileName || '';
      assertImportFileShape({ headers, mapping: body.mapping || {}, type: 'ad' });
      console.info('[temu-ad-report-confirm-start]', {
        fileName,
        previewId: body.previewId || '',
        reportDate: body.reportDate || '',
        storeName: body.storeName || '',
        rows: Array.isArray(rows) ? rows.length : 0,
      });
      const result = await importAdRows({
        rows,
        mapping: body.mapping || {},
        fileName,
        reportDate: body.reportDate,
        storeName: body.storeName || '',
        currentUser,
      });
      if (body.previewId) {
        temuImportPreviewCache.delete(String(body.previewId));
      }
      console.info('[temu-ad-report-confirm-done]', {
        fileName,
        totalRows: result.totalRows,
        successRows: result.successRows,
        errorRows: result.errorRows,
      });
      clearOperationWorkbenchDashboardCache();
      clearNewProductCenterApiCache();
      res.end(JSON.stringify(result));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, message: 'Not found' }));
  } catch (error) {
    console.error('[temu-ad-report-api-error]', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.statusCode = messageIncludesImportError(error) ? 400 : 500;
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}

function getNewProductPayloadRows(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (Array.isArray(payload.records)) return payload.records.length;
  if (Array.isArray(payload.recommendations)) return payload.recommendations.length;
  if (Array.isArray(payload.operators)) return payload.operators.length;
  if (Array.isArray(payload.stores)) return payload.stores.length;
  if (payload.summary && typeof payload.summary === 'object') return 1;
  if (payload.counts && typeof payload.counts === 'object') return Object.keys(payload.counts).length;
  return 0;
}

function logNewProductApiTiming(pathname, startTime, payload) {
  const durationMs = Math.round(performance.now() - startTime);
  const entry = {
    scope: 'new-product-center-api',
    endpoint: pathname,
    durationMs,
    rows: getNewProductPayloadRows(payload),
    slow: durationMs > 1000,
  };
  console[entry.slow ? 'warn' : 'log'](JSON.stringify(entry));
}

const newProductCenterApiCache = new Map();
const NEW_PRODUCT_CENTER_STATIC_TTL_MS = 5 * 60_000;
const NEW_PRODUCT_CENTER_DYNAMIC_TTL_MS = 45_000;

function clearNewProductCenterApiCache() {
  newProductCenterApiCache.clear();
}

function getNewProductCenterCacheTtl(pathname) {
  if (pathname === 'ad-strategy/config' || pathname === 'store-options' || pathname === 'operator-options') {
    return NEW_PRODUCT_CENTER_STATIC_TTL_MS;
  }
  if (pathname === 'ad-strategy/counts' || pathname === 'ad-strategy/pending') {
    return NEW_PRODUCT_CENTER_DYNAMIC_TTL_MS;
  }
  return 0;
}

function getNewProductCenterCacheKey(pathname, params, currentUser) {
  const normalizedParams = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('&');
  const visibleStores = Array.isArray(params?.storeNames) ? [...params.storeNames].sort().join(',') : '';
  return [
    pathname,
    String(currentUser?.userId || currentUser?.id || currentUser?.username || ''),
    String(currentUser?.role || ''),
    String(currentUser?.operatorId || ''),
    visibleStores,
    normalizedParams,
  ].join('|');
}

async function getCachedNewProductCenterPayload(pathname, params, currentUser, producer) {
  const ttlMs = getNewProductCenterCacheTtl(pathname);
  if (!ttlMs) return producer();
  const key = getNewProductCenterCacheKey(pathname, params, currentUser);
  const now = Date.now();
  const cached = newProductCenterApiCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise || cached.value;
  }
  const promise = Promise.resolve()
    .then(producer)
    .then((value) => {
      newProductCenterApiCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      newProductCenterApiCache.delete(key);
      throw error;
    });
  newProductCenterApiCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

async function handleNewProductCenterApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const startTime = performance.now();
  const sendJson = (pathname, payload) => {
    logNewProductApiTiming(pathname, startTime, payload);
    res.end(JSON.stringify(payload));
  };
  try {
    const currentUser = toCurrentUser(findCurrentUser(req));
    if (!currentUser) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, message: '请先登录' }));
      return;
    }
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const pathname = requestUrl.pathname.replace(/^\/+/, '');
    const scope = getNewProductCenterScope(currentUser);
    const params = appendSearchParams(requestUrl, scope);

    if (req.method === 'GET' && pathname === 'boss-dashboard') {
      sendJson(pathname, await getBossDashboard(params));
      return;
    }
    if (req.method === 'GET' && pathname === 'operator-dashboard') {
      sendJson(pathname, await getOperatorDashboard(params));
      return;
    }
    if (req.method === 'GET' && pathname === 'operator-options') {
      sendJson(pathname, await getCachedNewProductCenterPayload(pathname, params, currentUser, () => getOperatorOptions(params)));
      return;
    }
    if (req.method === 'GET' && pathname === 'store-options') {
      sendJson(pathname, await getCachedNewProductCenterPayload(pathname, params, currentUser, () => getStoreOptions(params)));
      return;
    }
    if (req.method === 'GET' && pathname === 'products') {
      sendJson(pathname, await getProducts(params));
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('products/')) {
      sendJson(pathname, await getProductDetail(decodeURIComponent(pathname.replace(/^products\//, '')), params));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-recommendations') {
      sendJson(pathname, await getRecommendations(params));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-strategy/config') {
      sendJson(pathname, await getCachedNewProductCenterPayload(pathname, params, currentUser, () => getAdStrategyConfig()));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-strategy/counts') {
      sendJson(pathname, await getCachedNewProductCenterPayload(pathname, params, currentUser, () => getAdStrategyCounts(params)));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-strategy/pending') {
      sendJson(pathname, await getCachedNewProductCenterPayload(pathname, params, currentUser, () => getAdStrategyPending(params)));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-strategy/execution') {
      sendJson(pathname, await getAdStrategyExecution(params));
      return;
    }
    if (req.method === 'GET' && pathname === 'ad-strategy/review') {
      sendJson(pathname, await getAdStrategyReview(params));
      return;
    }
    if (req.method === 'POST' && pathname.startsWith('ad-recommendations/') && pathname.endsWith('/handle')) {
      const id = decodeURIComponent(pathname.replace(/^ad-recommendations\//, '').replace(/\/handle$/, ''));
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = await handleRecommendation(id, body, currentUser);
      clearNewProductCenterApiCache();
      sendJson(pathname, result);
      return;
    }
    if (req.method === 'POST' && pathname === 'rebuild-snapshot') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = await rebuildNewProductSnapshots({ snapshotDate: body.snapshotDate });
      clearNewProductCenterApiCache();
      sendJson(pathname, result);
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, message: 'Not found' }));
  } catch (error) {
    logNewProductApiTiming('error', startTime, { records: [] });
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}

function getOrderDateKey(order) {
  return String(order?.orderDate ?? order?.date ?? order?.orderTime ?? '').slice(0, 10);
}

function normalizeOrderImportStoreName(value) {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .trim();
  if (!name) {
    return '未知店铺';
  }
  const key = name.replace(/\s+/g, '').toLowerCase();
  if (key === 'honeyjewels' || key === 'h点' || key === 'h店') {
    return 'H店';
  }
  return name;
}

function formatOrderDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDateRangeKeys(startValue, endValue, maxDays = 370) {
  const start = String(startValue ?? '').slice(0, 10);
  const end = String(endValue ?? startValue ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return [];
  }

  const keys = [];
  const date = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (date <= endDate && keys.length < maxDays) {
    keys.push(formatOrderDateKey(date));
    date.setDate(date.getDate() + 1);
  }
  return keys;
}

function getOrderImportStatus(batch, orders, storeName, date) {
  if (!storeName || !date || orders.length === 0) {
    return 'missing';
  }
  if (orders.some((order) => Number(order?.salesAmount) < 0 || Number.isNaN(Number(order?.salesAmount)))) {
    return 'abnormal';
  }
  if (Number(batch?.duplicateRows ?? 0) > 0) {
    return 'duplicate';
  }
  return 'normal';
}

function getRecentOrderCheckDates(days = 7, endDateKey = '') {
  const latest = /^\d{4}-\d{2}-\d{2}$/.test(String(endDateKey)) ? new Date(`${endDateKey}T00:00:00`) : null;
  const yesterday = latest ?? new Date();
  if (!latest) {
    yesterday.setDate(yesterday.getDate() - 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(yesterday);
    date.setDate(yesterday.getDate() - (days - 1 - index));
    return formatOrderDateKey(date);
  });
}

function getVisibleOrderStoreNames(currentUser, data) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    const stores = getTemuStores().map((store) => normalizeOrderImportStoreName(store?.storeName || store?.id)).filter(Boolean);
    return stores.length ? unique(stores) : unique((data?.batches ?? []).flatMap((batch) =>
      (batch.orders ?? []).map((order) => normalizeOrderImportStoreName(order?.storeName)),
    )).filter((storeName) => isTemuImportStoreKey(storeName));
  }

  const visible = getTemuVisibleStores(currentUser).map((store) => normalizeOrderImportStoreName(store?.storeName || store?.id)).filter(Boolean);
  return visible.length ? unique(visible) : unique((data?.batches ?? []).flatMap((batch) =>
    (batch.orders ?? []).map((order) => normalizeOrderImportStoreName(order?.storeName)),
  )).filter((storeName) => isTemuImportStoreKey(storeName));
}

function buildOrderImportRecords(data) {
  return (data?.batches ?? []).flatMap((batch) => {
    const groups = new Map();
    for (const order of batch.orders ?? []) {
      const date = getOrderDateKey(order);
      const storeName = normalizeOrderImportStoreName(order?.storeName);
      if (!date || !storeName) {
        continue;
      }
      const key = `${date}|${storeName}`;
      const current = groups.get(key) ?? [];
      current.push(order);
      groups.set(key, current);
    }

    return Array.from(groups.entries()).map(([key, orders]) => {
      const [date, storeName] = key.split('|');
      const salesAmount = Number(orders.reduce((total, order) => total + (Number(order?.salesAmount) || 0), 0).toFixed(2));
      return {
        id: `${batch.batchId}-${key}`,
        batchId: batch.batchId,
        date,
        orderDate: date,
        storeName,
        fileName: String(batch.fileName ?? ''),
        importedAt: String(batch.importedAt ?? ''),
        importedBy: String(batch.importedBy ?? batch.operatorName ?? batch.username ?? '-'),
        detailCount: orders.length,
        salesAmount,
        firstOrderCount: orders.filter((order) => Boolean(order?.isFirstOrder)).length,
        status: getOrderImportStatus(batch, orders, storeName, date),
      };
    });
  }).sort((first, second) =>
    `${second.orderDate} ${second.importedAt}`.localeCompare(`${first.orderDate} ${first.importedAt}`),
  );
}

function filterOrderImportRecords(records, searchParams) {
  const rawStoreName = String(searchParams.get('storeName') || '').trim();
  const storeName = rawStoreName ? normalizeOrderImportStoreName(rawStoreName) : '';
  const orderDate = searchParams.get('orderDate') || searchParams.get('date') || '';
  const importDate = searchParams.get('importDate') || '';
  const fileName = String(searchParams.get('fileName') || '').trim().toLowerCase();
  const status = searchParams.get('status') || '';

  return records.filter((record) =>
    (!storeName || record.storeName === storeName) &&
    (!orderDate || record.orderDate === orderDate) &&
    (!importDate || String(record.importedAt ?? '').slice(0, 10) === importDate) &&
    (!fileName || record.fileName.toLowerCase().includes(fileName)) &&
    (!status || record.status === status)
  );
}

function buildOrderImportSummary(data, records, currentUser) {
  const today = formatOrderDateKey(new Date());
  const todayRows = records.filter((row) => row.orderDate === today);
  const importedKeys = new Set(records.map((row) => `${normalizeOrderImportStoreName(row.storeName)}|${row.orderDate}`));
  const storeOptions = unique(records.filter(itemMatchesTemuImportStore).map((row) => row.storeName)).sort();
  const dateOptions = unique(records.map((row) => row.orderDate)).sort().reverse();
  const visibleStoreNames = getVisibleOrderStoreNames(currentUser, data);
  const checkEndDate = dateOptions[0] || '';
  const missingOrderItems = visibleStoreNames.flatMap((storeName) =>
    getRecentOrderCheckDates(7, checkEndDate).filter((date) => !importedKeys.has(`${normalizeOrderImportStoreName(storeName)}|${date}`))
      .map((date) => ({ storeName, date })),
  );

  return {
    todayStoreCount: new Set(todayRows.map((row) => row.storeName)).size,
    todaySalesAmount: Number(todayRows.reduce((total, row) => total + row.salesAmount, 0).toFixed(2)),
    todayFirstOrderCount: todayRows.reduce((total, row) => total + row.firstOrderCount, 0),
    batchCount: (data?.batches ?? []).length,
    abnormalStoreCount: records.filter((row) => row.status === 'abnormal').length,
    missingOrderItems,
    storeOptions,
    dateOptions,
  };
}

function summarizeOrderImportRecords(records) {
  return {
    dateCount: new Set(records.map((row) => row.orderDate)).size,
    storeCount: new Set(records.map((row) => row.storeName)).size,
    batchCount: new Set(records.map((row) => row.batchId)).size,
    detailCount: records.reduce((total, row) => total + row.detailCount, 0),
    salesAmount: Number(records.reduce((total, row) => total + row.salesAmount, 0).toFixed(2)),
  };
}

function buildStoreBusinessOrderDaily(data, searchParams) {
  const { start, end } = resolveOrderDateRange(data, searchParams);
  const groups = new Map();

  for (const batch of data?.batches ?? []) {
    for (const order of batch.orders ?? []) {
      const date = getOrderDateKey(order);
      if (!date || (start && date < start) || (end && date > end)) {
        continue;
      }
      const storeName = normalizeOrderImportStoreName(order?.storeName);
      const key = `${storeName}|${date}`;
      const current = groups.get(key) ?? {
        storeName,
        orderDate: date,
        salesAmount: 0,
        firstOrderCount: 0,
        orderCount: 0,
      };
      current.salesAmount += Number(order?.salesAmount) || 0;
      current.firstOrderCount += order?.isFirstOrder ? 1 : 0;
      current.orderCount += 1;
      groups.set(key, current);
    }
  }

  const result = {
    dateStart: start,
    dateEnd: end,
    records: Array.from(groups.values())
      .map((item) => ({ ...item, salesAmount: Number(item.salesAmount.toFixed(2)) }))
      .sort((first, second) => `${first.storeName} ${first.orderDate}`.localeCompare(`${second.storeName} ${second.orderDate}`)),
  };

  if (searchParams.get('includeSkuTrend') === '1') {
    result.skuTrend = buildSkuSalesTrendSummary(data);
  }

  if (searchParams.get('includeFirstOrderProducts') === '1') {
    result.firstOrderProducts = buildFirstOrderProductSummary(data);
  }

  if (searchParams.get('includeAveragePriceSummary') === '1') {
    result.averagePriceSummary = buildStoreAveragePriceSummary(
      data,
      new URLSearchParams({ recentDays: String(searchParams.get('averagePriceRecentDays') || 30) }),
    );
  }

  return result;
}

function getFirstOrderProductKeyForSummary(order) {
  return String(order?.skc || order?.skcCode || order?.productSku || order?.skuCode || order?.productName || order?.uniqueKey || '')
    .trim()
    .toLowerCase();
}

function buildFirstOrderProductSummary(data) {
  const latestDate = (data?.batches ?? [])
    .flatMap((batch) => batch.orders ?? [])
    .map(getOrderDateKey)
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  const month = latestDate.slice(0, 7);
  const stores = getStores().filter((store) => store.platform === 'TEMU');
  const storeIds = new Set(stores.map((store) => store.id).filter(Boolean));
  const storeNames = new Set(stores.map((store) => normalizeOrderImportStoreName(store.storeName || store.id)).filter(Boolean));
  const allRelations = Array.isArray(readJsonFile('storeOperatorRelations')) ? readJsonFile('storeOperatorRelations') : [];
  const relations = allRelations.filter((relation) =>
    relation?.platform === 'TEMU' ||
    storeIds.has(relation?.storeId) ||
    storeNames.has(normalizeOrderImportStoreName(relation?.storeName)),
  );
  const operators = getOperators();
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const groups = new Map();

  for (const batch of data?.batches ?? []) {
    for (const order of batch.orders ?? []) {
      const date = getOrderDateKey(order);
      if (!order?.isFirstOrder || !month || String(order?.month || date.slice(0, 7)) !== month) {
        continue;
      }

      const storeName = normalizeOrderImportStoreName(order?.storeName);
      if (!storeNames.has(storeName)) {
        continue;
      }

      const store = stores.find((item) => item.id === order?.storeId || normalizeOrderImportStoreName(item.storeName) === storeName);
      const storeId = store?.id || order?.storeId || storeName;
      const relation = relations.find((item) =>
        dashboardRelationActiveOnDate(item, date) &&
        (item.storeId === storeId || normalizeOrderImportStoreName(item.storeName) === storeName),
      );
      const operator = relation ? operatorById.get(relation.operatorId) : undefined;
      const operatorId = relation?.operatorId || operator?.id || order?.operatorId || '未绑定运营';
      const operatorName = operator?.operatorName || relation?.operatorName || order?.operatorName || '未绑定运营';
      const key = getDashboardOperatorKey(operatorId, operatorName);
      const productKey = getFirstOrderProductKeyForSummary(order);

      if (!key || !productKey) {
        continue;
      }

      const current = groups.get(key) ?? { operatorId, operatorName: normalizeDashboardOperatorName(operatorName) || operatorId, products: new Set() };
      current.products.add(productKey);
      groups.set(key, current);
    }
  }

  return {
    month,
    records: Array.from(groups.values())
      .map((item) => ({
        operatorId: item.operatorId,
        operatorName: item.operatorName,
        firstOrderCount: item.products.size,
      }))
      .sort((first, second) => second.firstOrderCount - first.firstOrderCount || first.operatorName.localeCompare(second.operatorName)),
  };
}

function buildDashboardOrderStore(data, searchParams) {
  const { start, end } = resolveOrderDateRange(data, searchParams);
  const temuStoreNames = new Set(getStores()
    .filter((store) => store.platform === 'TEMU')
    .map((store) => normalizeOrderImportStoreName(store.storeName || store.id))
    .filter(Boolean));

  return {
    batches: (data?.batches ?? []).map((batch) => {
      const orders = (batch.orders ?? [])
        .filter((order) => {
          const date = getOrderDateKey(order);
          const storeName = normalizeOrderImportStoreName(order?.storeName);
          return (!start || date >= start) &&
            (!end || date <= end) &&
            (!temuStoreNames.size || temuStoreNames.has(storeName));
        })
        .map((order) => ({
          orderId: order?.orderId ?? '',
          isFirstOrder: Boolean(order?.isFirstOrder),
          skc: order?.skc ?? '',
          skcCode: order?.skcCode ?? '',
          skuCode: order?.skuCode ?? '',
          productSku: order?.productSku ?? '',
          productName: order?.productName ?? '',
          declarePrice: Number(order?.declarePrice) || 0,
          quantity: Number(order?.quantity) || 0,
          orderTime: order?.orderTime ?? '',
          orderDate: getOrderDateKey(order),
          month: order?.month ?? String(getOrderDateKey(order)).slice(0, 7),
          storeName: normalizeOrderImportStoreName(order?.storeName),
          salesAmount: Number(order?.salesAmount) || 0,
          uniqueKey: order?.uniqueKey ?? '',
        }));

      return {
        batchId: batch?.batchId ?? batch?.id ?? '',
        fileName: batch?.fileName ?? '',
        importedAt: batch?.importedAt ?? '',
        orders,
      };
    }).filter((batch) => batch.orders.length > 0),
  };
}

const dashboardMetricFallbacks = {
  yesterdaySalesAmount: { title: '最新订单日销售额', unit: '¥', iconType: 'sales', colorTheme: 'gold' },
  monthlySalesAmount: { title: '本月销售额', unit: '¥', iconType: 'sales', colorTheme: 'blue' },
  yesterdayOrderCount: { title: '最新订单日订单数', iconType: 'order', colorTheme: 'cyan' },
  monthlyOrderCount: { title: '本月订单数', iconType: 'order', colorTheme: 'purple' },
  storeCount: { title: '店铺数量', iconType: 'store', colorTheme: 'green' },
  abnormalStoreCount: { title: '异常店铺数', iconType: 'warning', colorTheme: 'red' },
};

function normalizeDashboardOperatorName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u202a-\u202e\ufeff]/g, '').trim();
}

function getDashboardOperatorKey(operatorId, operatorName) {
  return normalizeDashboardOperatorName(operatorName) || String(operatorId ?? '').trim();
}

function dashboardRelationActiveOnDate(relation, date) {
  return relation?.status === 'active' &&
    relation?.role === 'primary' &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date);
}

function getDashboardDateFromOrder(order) {
  return getOrderDateKey(order);
}

function getDashboardOrderSalesAmount(order) {
  const salesAmount = Number(order?.salesAmount);
  if (Number.isFinite(salesAmount) && salesAmount > 0) return salesAmount;
  const declarePrice = Number(order?.declarePrice);
  const quantity = Number(order?.quantity) || 0;
  return Number.isFinite(declarePrice) ? declarePrice * quantity : 0;
}

function metricItem(id, value, overrides = {}) {
  const fallback = dashboardMetricFallbacks[id] ?? {};
  return {
    id,
    title: fallback.title ?? id,
    value: Number((Number(value) || 0).toFixed(2)),
    unit: fallback.unit,
    compareText: '',
    trend: 'flat',
    iconType: fallback.iconType ?? 'sales',
    colorTheme: fallback.colorTheme ?? 'blue',
    ...overrides,
  };
}

function buildDashboardRanking(entries, unit, limit = 10) {
  return entries
    .sort((first, second) => second[1] - first[1] || String(first[0]).localeCompare(String(second[0])))
    .slice(0, limit)
    .map(([name, value], index) => ({
      rank: index + 1,
      name,
      value: Number((Number(value) || 0).toFixed(2)),
      unit,
      trend: 'flat',
    }));
}

async function buildCompanyDashboardData() {
  const orderStore = readJsonFile('orderImportStore');
  const allStores = Array.isArray(readJsonFile('stores')) ? readJsonFile('stores') : [];
  const allRelations = Array.isArray(readJsonFile('storeOperatorRelations')) ? readJsonFile('storeOperatorRelations') : [];
  const allOperators = Array.isArray(readJsonFile('operators')) ? readJsonFile('operators') : [];
  const legacyEffectiveListings = Array.isArray(readJsonFile('effectiveNewListings')) ? readJsonFile('effectiveNewListings') : [];
  let effectiveListings = legacyEffectiveListings;
  try {
    const productInfoListings = await readEffectiveListingsFromProductImport();
    effectiveListings = productInfoListings.length > 0 ? productInfoListings : legacyEffectiveListings;
  } catch (error) {
    console.warn('[TEMU PostgreSQL] dashboard effective listings from product import fallback to JSON:', error instanceof Error ? error.message : error);
  }
  const riskStore = readJsonFile('riskResults') || { items: [] };
  const growthStore = readJsonFile('growthOpportunities') || { items: [] };
  const stores = allStores.filter((store) => store?.platform === 'TEMU');
  const storeIds = new Set(stores.map((store) => store.id).filter(Boolean));
  const storeNames = new Set(stores.map((store) => normalizeOrderImportStoreName(store.storeName || store.id)).filter(Boolean));
  const relations = allRelations.filter((relation) =>
    relation?.platform === 'TEMU' ||
    storeIds.has(relation?.storeId) ||
    storeNames.has(normalizeOrderImportStoreName(relation?.storeName)),
  );
  const operatorIds = new Set(relations.map((relation) => relation.operatorId).filter(Boolean));
  const operatorNames = new Set(relations.map((relation) => normalizeDashboardOperatorName(relation.operatorName)).filter(Boolean));
  const operators = allOperators.filter((operator) =>
    operatorIds.has(operator.id) || operatorNames.has(normalizeDashboardOperatorName(operator.operatorName)),
  );
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const latestImportedAt = (orderStore?.batches ?? []).map((batch) => batch.importedAt).filter(Boolean).sort().at(-1) || nowIso();
  const orders = (orderStore?.batches ?? []).flatMap((batch) =>
    (batch.orders ?? []).map((order) => {
      const date = getDashboardDateFromOrder(order);
      const storeName = normalizeOrderImportStoreName(order?.storeName);
      if (!date || !storeNames.has(storeName)) return null;
      const store = stores.find((item) => item.id === order?.storeId || normalizeOrderImportStoreName(item.storeName) === storeName);
      const storeId = store?.id || order?.storeId || storeName;
      const relation = relations.find((item) => dashboardRelationActiveOnDate(item, date) && (item.storeId === storeId || normalizeOrderImportStoreName(item.storeName) === storeName));
      const operator = relation ? operatorById.get(relation.operatorId) : undefined;
      const operatorName = operator?.operatorName || relation?.operatorName || '未绑定运营';
      return {
        ...order,
        date,
        month: order?.month || date.slice(0, 7),
        storeId,
        storeName: store?.storeName || storeName,
        operatorId: relation?.operatorId || '未绑定运营',
        operatorName,
        salesAmount: getDashboardOrderSalesAmount(order),
      };
    }).filter(Boolean),
  );
  const reportDateKey = orders.map((order) => order.date).filter(Boolean).sort().at(-1) || formatOrderDateKey(new Date());
  const reportDate = new Date(`${reportDateKey}T00:00:00`);
  const currentMonth = reportDateKey.slice(0, 7);
  const reportDateOrders = orders.filter((order) => order.date === reportDateKey);
  const monthOrders = orders.filter((order) => order.month === currentMonth);
  const sumSales = (items) => items.reduce((total, order) => total + getDashboardOrderSalesAmount(order), 0);
  const sumQuantity = (items) => items.reduce((total, order) => total + (Number(order?.quantity) || 0), 0);
  const groupSales = (items, getKey, getName, baseEntries = []) => {
    const totals = new Map(baseEntries.map((item) => [item.key, { name: item.name, value: 0 }]));
    for (const order of items) {
      const key = getKey(order);
      const current = totals.get(key) ?? { name: getName(order), value: 0 };
      current.value += getDashboardOrderSalesAmount(order);
      totals.set(key, current);
    }
    return Array.from(totals.values()).map((item) => [item.name, item.value]);
  };
  const operatorBase = operators.map((operator) => ({
    key: getDashboardOperatorKey(operator.id, operator.operatorName),
    name: normalizeDashboardOperatorName(operator.operatorName) || operator.id,
  }));
  const storeBase = stores.map((store) => ({ key: store.id || store.storeName, name: store.storeName || store.id }));
  const dateKeys30 = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(reportDate);
    date.setDate(reportDate.getDate() - (29 - index));
    return formatOrderDateKey(date);
  });
  const salesTrend30Days = dateKeys30.map((date) => {
    const dailyOrders = orders.filter((order) => order.date === date);
    return { date: date.slice(5), salesAmount: Number(sumSales(dailyOrders).toFixed(2)), orderCount: dailyOrders.length };
  });
  const listingStoreIds = storeIds;
  const listingStoreNames = storeNames;
  const newProductGroups = new Map(operatorBase.map((item) => [item.key, { name: item.name, skcs: new Set() }]));
  for (const item of effectiveListings) {
    if (String(item?.siteJoinDate ?? '').slice(0, 7) !== currentMonth) continue;
    if (!listingStoreIds.has(item?.storeId) && !listingStoreNames.has(normalizeOrderImportStoreName(item?.storeName))) continue;
    const relation = relations.find((relation) => dashboardRelationActiveOnDate(relation, item.siteJoinDate) && (relation.storeId === item.storeId || normalizeOrderImportStoreName(relation.storeName) === normalizeOrderImportStoreName(item.storeName)));
    const operator = relation ? operatorById.get(relation.operatorId) : undefined;
    const key = getDashboardOperatorKey(operator?.id || relation?.operatorId || item?.operatorId || item?.createdBy, operator?.operatorName || relation?.operatorName || item?.operatorName || item?.createdByName);
    const current = newProductGroups.get(key) ?? { name: normalizeDashboardOperatorName(operator?.operatorName || relation?.operatorName || item?.operatorName || item?.createdByName) || key, skcs: new Set() };
    if (item?.skc) current.skcs.add(String(item.skc).trim().toLowerCase());
    newProductGroups.set(key, current);
  }
  const firstOrderGroups = new Map(operatorBase.map((item) => [item.key, { name: item.name, products: new Set() }]));
  for (const order of orders) {
    if (!order?.isFirstOrder || order.month !== currentMonth) continue;
    const productKey = String(order.skc || order.skcCode || order.productSku || order.skuCode || order.productName || order.uniqueKey || '').trim().toLowerCase();
    if (!productKey) continue;
    const key = getDashboardOperatorKey(order.operatorId, order.operatorName);
    const current = firstOrderGroups.get(key) ?? { name: normalizeDashboardOperatorName(order.operatorName) || key, products: new Set() };
    current.products.add(productKey);
    firstOrderGroups.set(key, current);
  }
  const firstOrderTrendStores = [];
  const firstOrderTrend30Days = dateKeys30.map((date) => ({ date: date.slice(5), firstOrderCount: orders.filter((order) => order.date === date && order.isFirstOrder).length }));
  const warnings = (riskStore?.items ?? [])
    .filter((item) => item?.level && item.level !== 'insufficient')
    .slice(0, 5)
    .map((item, index) => ({
      id: item.id || `traffic-${index}`,
      type: item.type || 'traffic',
      storeName: item.storeName || '-',
      content: item.content || '-',
      time: String(item.triggeredAt || item.date || '').replace('T', ' ').slice(11, 16),
      level: item.level === 'critical' ? 'critical' : 'high',
    }));
  const growthOpportunities = (growthStore?.items ?? []).slice(0, 5).map((item, index) => ({
    id: item.id || `growth-${index}`,
    type: item.type || 'traffic',
    storeName: item.storeName || '-',
    content: item.content || '-',
    growthRate: Number(item.growthRate) || 0,
  }));
  const firstOrderDangerCount = firstOrderTrendStores.filter((item) => item.status === 'danger').length;

  return {
    updatedAt: String(latestImportedAt).replace('T', ' ').slice(0, 19),
    dataUpdatedAt: String(latestImportedAt).replace('T', ' ').slice(0, 19),
    dataSource: '真实数据',
    statisticsPeriod: currentMonth,
    metrics: [
      metricItem('yesterdaySalesAmount', sumSales(reportDateOrders), { compareText: `订单日期 ${reportDateKey}` }),
      metricItem('monthlySalesAmount', sumSales(monthOrders), { compareText: `${currentMonth} Excel订单明细` }),
      metricItem('yesterdayOrderCount', sumQuantity(reportDateOrders), { compareText: `订单日期 ${reportDateKey}` }),
      metricItem('monthlyOrderCount', sumQuantity(monthOrders), { compareText: `${currentMonth} Excel有效明细` }),
      metricItem('storeCount', stores.length, { compareText: `TEMU店铺 ${stores.length}` }),
      metricItem('abnormalStoreCount', firstOrderDangerCount, { compareText: '首单趋势风险' }),
    ],
    operatorSalesRanking: buildDashboardRanking(groupSales(monthOrders, (order) => getDashboardOperatorKey(order.operatorId, order.operatorName), (order) => order.operatorName, operatorBase), '¥', operatorBase.length || 10),
    storeSalesRanking: buildDashboardRanking(groupSales(monthOrders, (order) => order.storeId || order.storeName, (order) => order.storeName, storeBase), '¥', storeBase.length || 10),
    newProductRanking: buildDashboardRanking(Array.from(newProductGroups.values()).map((item) => [item.name, item.skcs.size]), '款', newProductGroups.size || 10),
    firstOrderRanking: buildDashboardRanking(Array.from(firstOrderGroups.values()).map((item) => [item.name, item.products.size]), '款', firstOrderGroups.size || 10),
    salesTrend30Days,
    firstOrderTrendStores,
    firstOrderTrend30Days,
    storeStatus: { total: stores.length, normal: Math.max(stores.length - firstOrderDangerCount, 0), abnormal: firstOrderDangerCount, closed: 0 },
    warnings,
    growthOpportunities,
  };
}

async function getCompanyDashboardDataCached(force = false) {
  const now = Date.now();
  if (!force && dashboardSummaryCache && dashboardSummaryCache.expiresAt > now) {
    return {
      ...dashboardSummaryCache.data,
      cache: {
        hit: true,
        generatedAt: dashboardSummaryCache.generatedAt,
        ttlSeconds: Math.round((dashboardSummaryCache.expiresAt - now) / 1000),
      },
    };
  }

  const data = await buildCompanyDashboardData();
  dashboardSummaryCache = {
    data,
    generatedAt: nowIso(),
    expiresAt: now + dashboardSummaryCacheTtlMs,
  };

  return {
    ...data,
    cache: {
      hit: false,
      generatedAt: dashboardSummaryCache.generatedAt,
      ttlSeconds: Math.round(dashboardSummaryCacheTtlMs / 1000),
    },
  };
}

async function handleCompanyDashboardApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=30');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, message: 'Method not allowed' }));
    return;
  }

  try {
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const force = requestUrl.searchParams.get('refresh') === 'true' || requestUrl.searchParams.get('force') === 'true';
    res.end(JSON.stringify(await getCompanyDashboardDataCached(force)));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

function resolveTrafficDateRange(data, searchParams) {
  const start = searchParams.get('dateStart') || searchParams.get('startDate') || '';
  const end = searchParams.get('dateEnd') || searchParams.get('endDate') || '';

  if (start || end) {
    return { start, end };
  }

  const recentDays = Number(searchParams.get('recentDays') || searchParams.get('days') || 0);
  if (!Number.isFinite(recentDays) || recentDays <= 0) {
    return { start: '', end: '' };
  }

  const latest = (data?.records ?? [])
    .map((record) => String(record?.date ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latest) {
    return { start: '', end: '' };
  }

  const startDate = new Date(`${latest}T00:00:00`);
  startDate.setDate(startDate.getDate() - recentDays + 1);
  return { start: formatOrderDateKey(startDate), end: latest };
}

function buildStoreBusinessTraffic(data, searchParams) {
  const { start, end } = resolveTrafficDateRange(data, searchParams);
  const groups = new Map();

  for (const record of data?.records ?? []) {
    const date = String(record?.date ?? '').slice(0, 10);
    if (!date || (start && date < start) || (end && date > end)) {
      continue;
    }

    const storeName = normalizeOrderImportStoreName(record?.storeName);
    const storeId = String(record?.storeId ?? '').trim();
    const key = `${storeId || storeName}|${date}`;
    const current = groups.get(key) ?? {
      storeId,
      storeName,
      date,
      totalVisitors: 0,
      productVisitors: 0,
      totalPayBuyers: 0,
      totalPayConversionRate: 0,
      detailPayConversionRate: 0,
    };

    current.totalVisitors += Number(record?.totalVisitors) || 0;
    current.productVisitors += Number(record?.productVisitors) || 0;
    current.totalPayBuyers += Number(record?.totalPayBuyers ?? record?.detailPayBuyers) || 0;
    current.totalPayConversionRate = Number(record?.totalPayConversionRate || record?.detailPayConversionRate || current.totalPayConversionRate || 0);
    current.detailPayConversionRate = Number(record?.detailPayConversionRate || current.detailPayConversionRate || 0);
    groups.set(key, current);
  }

  return {
    dateStart: start,
    dateEnd: end,
    records: Array.from(groups.values())
      .sort((first, second) => `${first.storeName} ${first.date}`.localeCompare(`${second.storeName} ${second.date}`)),
  };
}

function resolveOrderDateRange(data, searchParams) {
  const start = searchParams.get('dateStart') || searchParams.get('startDate') || '';
  const end = searchParams.get('dateEnd') || searchParams.get('endDate') || '';

  if (start || end) {
    return { start, end };
  }

  const recentDays = Number(searchParams.get('recentDays') || searchParams.get('days') || 0);
  if (!Number.isFinite(recentDays) || recentDays <= 0) {
    return { start: '', end: '' };
  }

  const latest = (data?.batches ?? [])
    .flatMap((batch) => batch.orders ?? [])
    .map(getOrderDateKey)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latest) {
    return { start: '', end: '' };
  }

  const startDate = new Date(`${latest}T00:00:00`);
  startDate.setDate(startDate.getDate() - recentDays + 1);
  return { start: formatOrderDateKey(startDate), end: latest };
}

function getOrderStockQuantityForSummary(order) {
  const value = Number(
    order?.quantity ??
    order?.['\u5907\u8d27\u6570\u91cf'] ??
    order?.stockQuantity ??
    order?.prepareQuantity ??
    order?.backupQuantity ??
    order?.qty ??
    0,
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getOrderSkuForSummary(order) {
  return String(
    order?.sku ??
    order?.skuCode ??
    order?.productSku ??
    order?.productSkuCode ??
    order?.productCode ??
    order?.skc ??
    order?.productId ??
    order?.['\u5546\u54c1SKU'] ??
    order?.['SKU\u7f16\u7801'] ??
    order?.['\u5546\u54c1\u7f16\u7801'] ??
    '',
  ).trim();
}

function getSkuTrendLabel(recent30Quantity, recent7Quantity, previous23Quantity) {
  if (recent30Quantity <= 0) {
    return '暂无数据';
  }
  if (previous23Quantity <= 0 && recent7Quantity > 0) {
    return '新品起量';
  }
  if (previous23Quantity > 0 && recent7Quantity <= 0) {
    return '明显下降';
  }

  const previous23DailyAverage = previous23Quantity / 23;
  if (previous23DailyAverage <= 0) {
    return '稳定';
  }

  const recent7DailyAverage = recent7Quantity / 7;
  const trendChangeRate = (recent7DailyAverage - previous23DailyAverage) / previous23DailyAverage;
  if (trendChangeRate >= 0.2) {
    return '上升';
  }
  if (trendChangeRate <= -0.2) {
    return '下降';
  }
  return '稳定';
}

function getDecliningSkuRiskLevel(previous23Quantity, recent7Quantity, declineRate) {
  if (previous23Quantity >= 5 && recent7Quantity <= 0) {
    return '断崖下降';
  }
  if (declineRate >= 0.5) {
    return '严重下降';
  }
  if (declineRate >= 0.3) {
    return '明显下降';
  }
  return '轻微下降';
}

function buildDecliningSkuRanking(allSkus) {
  return allSkus
    .map((item) => {
      const dailyDrop = Math.max(0, item.previous23DailyAverage - item.recent7DailyAverage);
      const declineRate = item.previous23DailyAverage > 0 ? dailyDrop / item.previous23DailyAverage : null;
      return {
        ...item,
        dailyDrop,
        declineRate,
        riskLevel: getDecliningSkuRiskLevel(item.previous23Quantity, item.recent7Quantity, declineRate ?? 1),
      };
    })
    .filter((item) => {
      const cliffDrop = item.previous23Quantity >= 5 && item.recent7Quantity <= 0;
      const normalDrop = item.recent30Quantity >= 10 &&
        item.previous23Quantity >= 5 &&
        item.declineRate !== null &&
        item.declineRate >= 0.15 &&
        item.dailyDrop > 0;
      return cliffDrop || normalDrop;
    })
    .sort((first, second) => second.dailyDrop - first.dailyDrop || (second.declineRate ?? 0) - (first.declineRate ?? 0))
    .slice(0, 10);
}

function buildSkuSalesTrendSummary(data) {
  const allOrders = (data?.batches ?? []).flatMap((batch) => batch.orders ?? []);
  const latest = allOrders
    .filter(itemMatchesTemuImportStore)
    .map(getOrderDateKey)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latest) {
    return {
      dateEnd: '',
      dateStart30: '',
      dateStart7: '',
      storeSkuRankings: [],
    };
  }

  const start30Date = new Date(`${latest}T00:00:00`);
  start30Date.setDate(start30Date.getDate() - 29);
  const start7Date = new Date(`${latest}T00:00:00`);
  start7Date.setDate(start7Date.getDate() - 6);
  const dateStart30 = formatOrderDateKey(start30Date);
  const dateStart7 = formatOrderDateKey(start7Date);
  const storeGroups = new Map();

  for (const order of allOrders) {
    if (!itemMatchesTemuImportStore(order)) {
      continue;
    }

    const date = getOrderDateKey(order);
    if (!date || date < dateStart30 || date > latest) {
      continue;
    }

    const storeName = normalizeOrderImportStoreName(order?.storeName);
    const sku = getOrderSkuForSummary(order);
    const quantity = getOrderStockQuantityForSummary(order);
    if (!storeName || !sku || quantity <= 0) {
      continue;
    }

    const skuMap = storeGroups.get(storeName) ?? new Map();
    const current = skuMap.get(sku) ?? { sku, recent30Quantity: 0, recent7Quantity: 0 };
    current.recent30Quantity += quantity;
    if (date >= dateStart7) {
      current.recent7Quantity += quantity;
    }
    skuMap.set(sku, current);
    storeGroups.set(storeName, skuMap);
  }

  return {
    dateEnd: latest,
    dateStart30,
    dateStart7,
    storeSkuRankings: Array.from(storeGroups.entries())
      .map(([storeName, skuMap]) => {
        const allSkus = Array.from(skuMap.values()).map((item) => {
          const recent30Quantity = Number(item.recent30Quantity) || 0;
          const recent7Quantity = Number(item.recent7Quantity) || 0;
          const previous23Quantity = Math.max(0, recent30Quantity - recent7Quantity);
          const recent7Ratio = recent30Quantity > 0 ? recent7Quantity / recent30Quantity : 0;
          const recent7DailyAverage = recent7Quantity / 7;
          const previous23DailyAverage = previous23Quantity / 23;
          const trendChangeRate = previous23DailyAverage > 0
            ? (recent7DailyAverage - previous23DailyAverage) / previous23DailyAverage
            : null;
          const trend = getSkuTrendLabel(recent30Quantity, recent7Quantity, previous23Quantity);
          return {
            sku: item.sku,
            recent30Quantity,
            recent7Quantity,
            previous23Quantity,
            recent7Ratio,
            recent7DailyAverage,
            previous23DailyAverage,
            trendChangeRate,
            trend,
          };
        });
        return {
          storeName,
          summary: {
            recent30ActiveSkuCount: allSkus.filter((item) => item.recent30Quantity > 0).length,
            recent7ActiveSkuCount: allSkus.filter((item) => item.recent7Quantity > 0).length,
            risingSkuCount: allSkus.filter((item) => item.trend === '上升' || item.trend === '新品起量').length,
            stableSkuCount: allSkus.filter((item) => item.trend === '稳定').length,
            decliningSkuCount: allSkus.filter((item) => item.trend === '下降' || item.trend === '明显下降').length,
          },
          decliningSkus: buildDecliningSkuRanking(allSkus),
          topSkus: allSkus
            .sort((first, second) => second.recent30Quantity - first.recent30Quantity || first.sku.localeCompare(second.sku))
            .slice(0, 10),
        };
      })
      .filter((item) => item.topSkus.length > 0)
      .sort((first, second) => first.storeName.localeCompare(second.storeName)),
  };
}

function buildStoreAveragePriceSummary(data, searchParams) {
  const { start, end } = resolveOrderDateRange(data, searchParams);
  const groups = new Map();

  for (const batch of data?.batches ?? []) {
    for (const order of batch.orders ?? []) {
      const date = getOrderDateKey(order);
      if (!date || (start && date < start) || (end && date > end)) {
        continue;
      }

      const storeName = normalizeOrderImportStoreName(order?.storeName);
      const current = groups.get(storeName) ?? {
        storeName,
        salesAmount: 0,
        stockQuantity: 0,
      };
      current.salesAmount += Number(order?.salesAmount) || 0;
      current.stockQuantity += getOrderStockQuantityForSummary(order);
      groups.set(storeName, current);
    }
  }

  return {
    dateStart: start,
    dateEnd: end,
    records: Array.from(groups.values())
      .map((item) => ({
        storeName: item.storeName,
        salesAmount: Number(item.salesAmount.toFixed(2)),
        stockQuantity: item.stockQuantity,
        averagePrice: item.stockQuantity > 0 ? Number((item.salesAmount / item.stockQuantity).toFixed(2)) : null,
        dateStart: start,
        dateEnd: end,
      }))
      .sort((first, second) => {
        if (first.averagePrice === null && second.averagePrice === null) {
          return first.storeName.localeCompare(second.storeName);
        }
        if (first.averagePrice === null) {
          return 1;
        }
        if (second.averagePrice === null) {
          return -1;
        }
        return second.averagePrice - first.averagePrice || first.storeName.localeCompare(second.storeName);
      }),
  };
}

function filterOrderImportStoreByQuery(data, searchParams, currentUser) {
  const view = searchParams.get('view') || '';
  if (view === 'dashboard-orders') {
    return buildDashboardOrderStore(data, searchParams);
  }

  if (view === 'store-business-daily') {
    return buildStoreBusinessOrderDaily(data, searchParams);
  }

  if (view === 'store-average-price-summary') {
    return buildStoreAveragePriceSummary(data, searchParams);
  }

  if (view === 'records') {
    const allRecords = buildOrderImportRecords(data).filter(itemMatchesTemuImportStore);
    const filteredRecords = filterOrderImportRecords(allRecords, searchParams);
    const pageSize = Math.min(Math.max(1, Number(searchParams.get('pageSize') || 20)), 50);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const start = (page - 1) * pageSize;

    return {
      records: filteredRecords.slice(start, start + pageSize),
      total: filteredRecords.length,
      page,
      pageSize,
      summary: buildOrderImportSummary(data, allRecords, currentUser),
      filteredSummary: summarizeOrderImportRecords(filteredRecords),
    };
  }

  if (view === 'detail') {
    const batchId = String(searchParams.get('batchId') || '');
    const storeName = normalizeOrderImportStoreName(searchParams.get('storeName') || '');
    const orderDate = searchParams.get('orderDate') || searchParams.get('date') || '';
    const pageSize = Math.min(Math.max(1, Number(searchParams.get('pageSize') || 50)), 100);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const batch = (data?.batches ?? []).find((item) => String(item?.batchId ?? '') === batchId);
    const orders = (batch?.orders ?? []).filter((order) =>
      itemMatchesTemuImportStore(order) &&
      (!storeName || normalizeOrderImportStoreName(order?.storeName) === storeName) &&
      (!orderDate || getOrderDateKey(order) === orderDate)
    );
    const start = (page - 1) * pageSize;

    return {
      batchId,
      storeName,
      orderDate,
      orders: orders.slice(start, start + pageSize),
      total: orders.length,
      page,
      pageSize,
    };
  }

  const hasQuery = ['limit', 'dateStart', 'startDate', 'dateEnd', 'endDate', 'recentDays', 'days', 'summaryOnly']
    .some((key) => searchParams.has(key));

  if (!hasQuery || !data?.batches) {
    return data;
  }

  const { start, end } = resolveOrderDateRange(data, searchParams);
  const limit = Math.max(0, Number(searchParams.get('limit') || 0));
  let remaining = limit || Number.POSITIVE_INFINITY;

  const batches = [...data.batches]
    .sort((first, second) => String(second.importedAt ?? '').localeCompare(String(first.importedAt ?? '')))
    .map((batch) => {
      if (remaining <= 0) {
        return { ...batch, orders: [] };
      }

      const orders = (batch.orders ?? [])
        .filter((order) => {
          const date = getOrderDateKey(order);
          return itemMatchesTemuImportStore(order) && (!start || date >= start) && (!end || date <= end);
        })
        .slice(0, remaining);

      remaining -= orders.length;
      return { ...batch, orders, validRows: orders.length };
    })
    .filter((batch) => batch.orders.length > 0);

  if (searchParams.get('summaryOnly') === 'true') {
    return {
      summaryOnly: true,
      dateStart: start,
      dateEnd: end,
      totalBatches: batches.length,
      totalOrders: batches.reduce((total, batch) => total + batch.orders.length, 0),
      storeNames: unique(batches.flatMap((batch) => batch.orders.map((order) => order.storeName).filter(Boolean))),
      batches: batches.map((batch) => ({ ...batch, orders: [], orderCount: batch.orders.length })),
    };
  }

  return { ...data, batches };
}

function filterTrafficConversionStoreByQuery(data, searchParams, currentUser) {
  const view = searchParams.get('view') || '';
  if (view === 'store-business-traffic') {
    return buildStoreBusinessTraffic(data, searchParams);
  }

  if (view === 'records') {
    const storeName = String(searchParams.get('storeName') || '').trim();
    const importDate = String(searchParams.get('importDate') || '').trim();
    const dataDate = String(searchParams.get('dataDate') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const pageSize = Math.min(Math.max(1, Number(searchParams.get('pageSize') || 20)), 50);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const batches = (data?.batches ?? [])
      .filter((batch) =>
        itemMatchesTemuImportStore(batch) &&
        (!storeName || batch.storeName === storeName) &&
        (!importDate || String(batch.importedAt ?? '').slice(0, 10) === importDate) &&
        (!dataDate || (String(batch.dateStart ?? '') <= dataDate && String(batch.dateEnd ?? '') >= dataDate)) &&
        (!status || batch.status === status)
      )
      .sort((first, second) => String(second.importedAt ?? '').localeCompare(String(first.importedAt ?? '')));
    const temuRecords = (data?.records ?? []).filter(itemMatchesTemuImportStore);
    const importedKeys = new Set(temuRecords.map((record) => `${String(record?.storeName ?? '').trim()}|${String(record?.date ?? '').slice(0, 10)}`));
    batches.forEach((batch) => {
      const batchStoreName = String(batch?.storeName ?? '').trim();
      if (!batchStoreName) {
        return;
      }
      getDateRangeKeys(batch?.dateStart, batch?.dateEnd).forEach((date) => {
        importedKeys.add(`${batchStoreName}|${date}`);
      });
    });
    const visibleStoreNames = String(currentUser?.role ?? '').toLowerCase() === 'admin'
      ? getTemuStores().map((store) => store.storeName).filter(Boolean)
      : getTemuVisibleStores(currentUser).map((store) => store.storeName).filter(Boolean);
    const storeNames = unique([
      ...visibleStoreNames,
      ...batches.map((batch) => batch.storeName).filter(Boolean),
    ]);
    const checkEnd = temuRecords.map((record) => String(record?.date ?? '').slice(0, 10)).filter(Boolean).sort().at(-1) || formatOrderDateKey(new Date());
    const checkStart = new Date(`${checkEnd}T00:00:00`);
    checkStart.setDate(checkStart.getDate() - 6);
    const checkDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(checkStart);
      date.setDate(checkStart.getDate() + index);
      return formatOrderDateKey(date);
    });
    const start = (page - 1) * pageSize;

    return {
      batches: batches.slice(start, start + pageSize),
      total: batches.length,
      page,
      pageSize,
      stores: unique((data?.batches ?? []).filter(itemMatchesTemuImportStore).map((batch) => batch.storeName).filter(Boolean)).sort(),
      missingTrafficItems: storeNames.flatMap((name) =>
        checkDates.filter((date) => !importedKeys.has(`${name}|${date}`)).map((date) => ({ storeName: name, date })),
      ),
    };
  }

  if (view === 'detail') {
    const batchId = String(searchParams.get('batchId') || '').trim();
    const records = (data?.records ?? [])
      .filter((record) => itemMatchesTemuImportStore(record) && String(record?.batchId ?? '') === batchId)
      .sort((first, second) => String(first.date ?? '').localeCompare(String(second.date ?? '')));
    return { records, total: records.length };
  }

  return data;
}

const financialCategories = [
  '推广服务费',
  '消费者及履约保障-售后问题',
  '仓储综合服务费',
  '合规EPR物流包装环保费',
  '提现',
  '其他支出',
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeFinancialCategory(value) {
  const text = String(value ?? '').trim();
  if (financialCategories.includes(text)) return text;
  if (text.includes('推广服务费') || text.includes('鎺ㄥ箍')) return '推广服务费';
  if (text.includes('消费者及履约保障-售后问题') || text.includes('售后') || text.includes('鍞悗')) return '消费者及履约保障-售后问题';
  if (text.includes('仓储综合服务费') || text.includes('浠撳偍')) return '仓储综合服务费';
  if (text.includes('合规EPR') || text.includes('EPR')) return '合规EPR物流包装环保费';
  if (text.includes('提现') || text.includes('鎻愮幇')) return '提现';
  return '其他支出';
}

function isCnyFinancialDetail(detail) {
  return String(detail?.currency ?? '').trim().toUpperCase() === 'CNY';
}

function isSettlement(detail) {
  const type = String(detail?.transactionType ?? '').trim();
  return type === '结算' || type === '缁撶畻' || type.includes('算');
}

function isSettlementInflow(detail, amount) {
  const type = String(detail?.transactionType ?? '').trim();
  return amount > 0 && (isSettlement(detail) || type.includes('�'));
}

function isExpense(detail) {
  const type = String(detail?.transactionType ?? '').trim();
  return type === '支出' || type === '鏀嚭';
}

function isWithdraw(detail) {
  const type = String(detail?.transactionType ?? '').trim();
  const category = String(detail?.category ?? '').trim();
  const remark = String(detail?.remark ?? '').trim();
  return type === '提现' ||
    type === '鎻愮幇' ||
    normalizeFinancialCategory(category) === '提现' ||
    remark.includes('提现') ||
    remark.includes('鎻愮幇');
}

function emptyFinancialSummary(seed = {}) {
  return {
    platform: seed.platform ?? 'TEMU',
    storeId: seed.storeId ?? '',
    storeName: seed.storeName ?? '',
    period: seed.period ?? '',
    inflowAmount: 0,
    expenseAmount: 0,
    promotionServiceFee: 0,
    afterSalesProtectionFee: 0,
    storageServiceFee: 0,
    eprFee: 0,
    otherExpense: 0,
    withdrawAmount: 0,
    operationExpenseAmount: 0,
    netSalesAmount: 0,
    commissionRate: 0,
    commissionAmount: 0,
    categorySummaries: financialCategories.map((category) => ({ category, amount: 0 })),
    detailCount: 0,
    batchCount: 0,
    hasData: false,
    hasNonCny: false,
    hasOtherExpense: false,
  };
}

function finalizeFinancialSummary(summary, batchCount = 0) {
  const categoryMap = new Map(summary.categorySummaries.map((item) => [item.category, item.amount]));
  summary.promotionServiceFee = categoryMap.get('推广服务费') ?? 0;
  summary.afterSalesProtectionFee = categoryMap.get('消费者及履约保障-售后问题') ?? 0;
  summary.storageServiceFee = categoryMap.get('仓储综合服务费') ?? 0;
  summary.eprFee = categoryMap.get('合规EPR物流包装环保费') ?? 0;
  summary.otherExpense = categoryMap.get('其他支出') ?? 0;
  summary.withdrawAmount = categoryMap.get('提现') ?? 0;
  summary.operationExpenseAmount = Math.max(0, summary.expenseAmount - summary.withdrawAmount);
  summary.netSalesAmount = summary.inflowAmount - summary.operationExpenseAmount;
  summary.batchCount = batchCount || summary.batchCount;
  summary.hasData = summary.detailCount > 0;
  summary.commissionRate = summary.hasData ? commissionRate(summary.netSalesAmount) : 0;
  summary.commissionAmount = summary.netSalesAmount * summary.commissionRate;
  summary.hasOtherExpense = summary.otherExpense > 0;
  return summary;
}

function summarizeFinancialDetails(details, seed = {}) {
  const summary = emptyFinancialSummary(seed);
  const categoryMap = new Map(financialCategories.map((category) => [category, 0]));

  for (const detail of Array.isArray(details) ? details : []) {
    if (!isCnyFinancialDetail(detail)) {
      summary.hasNonCny = true;
      continue;
    }

    const amount = toFiniteNumber(detail?.amount);
    summary.detailCount += 1;

    if (isSettlementInflow(detail, amount)) {
      summary.inflowAmount += amount;
    }

    if (isWithdraw(detail)) {
      const withdrawAmount = Math.abs(amount);
      summary.expenseAmount += withdrawAmount;
      categoryMap.set('提现', (categoryMap.get('提现') ?? 0) + withdrawAmount);
      continue;
    }

    if (isSettlement(detail) && amount < 0) {
      const expenseAmount = Math.abs(amount);
      const otherExpenseCategory = financialCategories[financialCategories.length - 1];
      summary.expenseAmount += expenseAmount;
      categoryMap.set(otherExpenseCategory, (categoryMap.get(otherExpenseCategory) ?? 0) + expenseAmount);
      continue;
    }

    if (isExpense(detail)) {
      const expenseAmount = Math.abs(amount);
      const category = normalizeFinancialCategory(detail?.category);
      summary.expenseAmount += expenseAmount;
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + expenseAmount);
    }
  }

  summary.categorySummaries = financialCategories.map((category) => ({
    category,
    amount: categoryMap.get(category) ?? 0,
  }));
  return finalizeFinancialSummary(summary);
}

function normalizeFinancialDetail(detail, batch, batchId, time) {
  return {
    id: detail.id || createId('financial-detail'),
    platform: String(detail.platform ?? batch.platform ?? 'TEMU').trim() || 'TEMU',
    storeId: String(detail.storeId ?? batch.storeId ?? '').trim(),
    storeName: String(detail.storeName ?? batch.storeName ?? '').trim(),
    period: String(detail.period ?? batch.period ?? '').trim(),
    transactionTime: String(detail.transactionTime ?? '').trim(),
    transactionType: String(detail.transactionType ?? '').trim(),
    currency: String(detail.currency ?? '').trim().toUpperCase(),
    amount: toFiniteNumber(detail.amount),
    remark: String(detail.remark ?? '').trim(),
    category: normalizeFinancialCategory(detail.category),
    sourceFileName: String(detail.sourceFileName ?? batch.fileName ?? '').trim(),
    importBatchId: batchId,
    createdAt: detail.createdAt || time,
  };
}

function normalizeFinancialBatch(batch, details, batchId, time) {
  const summary = summarizeFinancialDetails(details, {
    platform: batch.platform,
    storeId: batch.storeId,
    storeName: batch.storeName,
    period: batch.period,
  });

  return {
    id: batchId,
    platform: String(batch.platform ?? 'TEMU').trim() || 'TEMU',
    storeId: String(batch.storeId ?? '').trim(),
    storeName: String(batch.storeName ?? '').trim(),
    period: String(batch.period ?? '').trim(),
    fileName: String(batch.fileName ?? '').trim(),
    totalRows: toFiniteNumber(batch.totalRows),
    successRows: toFiniteNumber(batch.successRows || details.length),
    failedRows: toFiniteNumber(batch.failedRows),
    inflowAmount: summary.inflowAmount,
    expenseAmount: summary.expenseAmount,
    withdrawAmount: summary.withdrawAmount,
    operationExpenseAmount: summary.operationExpenseAmount,
    hasNonCny: Boolean(summary.hasNonCny || batch.hasNonCny),
    hasOtherExpense: Boolean(summary.hasOtherExpense || batch.hasOtherExpense),
    importedAt: batch.importedAt || time,
  };
}

function financialScopeKey(item) {
  return [
    String(item?.platform ?? '').trim().toLowerCase(),
    String(item?.storeId ?? '').trim().toLowerCase(),
    String(item?.period ?? '').trim(),
  ].join('|');
}

function filterFinancialItems(items, searchParams) {
  const platform = String(searchParams.get('platform') ?? '').trim();
  const storeId = String(searchParams.get('storeId') ?? '').trim();
  const period = String(searchParams.get('period') ?? '').trim();

  return (Array.isArray(items) ? items : []).filter((item) => (
    (!platform || String(item?.platform ?? '') === platform) &&
    (!storeId || String(item?.storeId ?? '') === storeId) &&
    (!period || String(item?.period ?? '') === period)
  ));
}

function filterFinancialForUser(items, currentUser) {
  if (String(currentUser?.role ?? '').toLowerCase() === 'admin') {
    return sanitizeSensitiveFields(items, currentUser);
  }

  const visibleStoreKeys = getVisibleStoreKeys(currentUser);
  return sanitizeSensitiveFields(
    (Array.isArray(items) ? items : []).filter((item) => itemMatchesPlatform(item, currentUser) && itemMatchesVisibleStore(item, visibleStoreKeys)),
    currentUser,
  );
}

function paginate(items, searchParams) {
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || 20)));
  const start = (page - 1) * pageSize;
  return {
    records: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

function buildFinancialStoreSummaries(details, batches, searchParams, currentUser) {
  const scopedDetails = filterFinancialItems(filterFinancialForUser(details, currentUser), searchParams);
  const scopedBatches = filterFinancialItems(filterFinancialForUser(batches, currentUser), searchParams);
  const batchCountByScope = scopedBatches.reduce((map, batch) => {
    const key = financialScopeKey(batch);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());
  const grouped = scopedDetails.reduce((map, detail) => {
    const key = financialScopeKey(detail);
    map.set(key, [...(map.get(key) ?? []), detail]);
    return map;
  }, new Map());

  return Array.from(grouped.values())
    .map((group) => {
      const first = group[0] ?? {};
      return finalizeFinancialSummary(summarizeFinancialDetails(group, first), batchCountByScope.get(financialScopeKey(first)) ?? 0);
    })
    .sort((first, second) => `${second.period} ${first.storeName}`.localeCompare(`${first.period} ${second.storeName}`));
}

function commissionRate(netSalesAmount) {
  if (netSalesAmount <= 20000) return 0.02;
  if (netSalesAmount <= 40000) return 0.03;
  if (netSalesAmount <= 80000) return 0.04;
  if (netSalesAmount <= 120000) return 0.05;
  if (netSalesAmount <= 180000) return 0.06;
  return 0.07;
}

function normalizePersonName(value) {
  return String(value ?? '')
    .trim()
    .replace(/^运营[-－_\s]*/u, '')
    .replace(/^运营账号[-－_\s]*/u, '')
    .trim();
}

function createEmployeeOperatorIndex(operators = []) {
  return operators.reduce((map, operator) => {
    const operatorId = String(operator?.id ?? '').trim();
    const operatorName = normalizePersonName(operator?.operatorName ?? operator?.name);
    if (operatorId && operatorName) {
      if (!map.has(operatorName)) map.set(operatorName, new Set());
      map.get(operatorName).add(operatorId);
    }
    return map;
  }, new Map());
}

function employeeMatchesRelation(employee, relation, operatorById = new Map()) {
  const employeeOperatorId = String(employee?.operatorId ?? '').trim();
  const relationOperatorId = String(relation?.operatorId ?? '').trim();
  const employeeName = normalizePersonName(employee?.employeeName);
  const relationOperatorName = normalizePersonName(relation?.operatorName);
  const operatorNameById = normalizePersonName(operatorById.get(relationOperatorId)?.operatorName);
  return Boolean(employeeOperatorId && employeeOperatorId === relationOperatorId) ||
    Boolean(employeeName && employeeName === relationOperatorName) ||
    Boolean(employeeName && employeeName === operatorNameById);
}

function buildUserStoreFallbackRelations(employee, users, stores, requestedStoreId = '') {
  const employeeName = normalizePersonName(employee?.employeeName);
  if (!employeeName) return [];

  const matchingUsers = users.filter((user) => {
    const names = [
      user?.username,
      user?.displayName,
      user?.operatorName,
      user?.name,
    ].map(normalizePersonName).filter(Boolean);
    return names.includes(employeeName);
  });

  if (matchingUsers.length === 0) return [];

  const storeById = new Map(stores.map((store) => [String(store.id), store]));
  const storeIds = Array.from(new Set(matchingUsers.flatMap((user) => Array.isArray(user?.allowedStoreIds) ? user.allowedStoreIds : [])))
    .map((storeId) => String(storeId ?? '').trim())
    .filter((storeId) => storeId && (!requestedStoreId || storeId === requestedStoreId));

  return storeIds.map((storeId) => {
    const store = storeById.get(storeId);
    return {
      id: `salary-user-store-${employee?.id || employeeName}-${storeId}`,
      storeId,
      operatorId: String(employee?.operatorId ?? '').trim(),
      operatorName: employeeName,
      role: 'primary',
      status: 'active',
      storeName: store?.storeName || storeId,
      platform: store?.platform || 'TEMU',
      salaryFallbackSource: 'userAllowedStoreIds',
    };
  });
}

function mergeRelationsByStore(relations, fallbackRelations) {
  const map = new Map();
  [...relations, ...fallbackRelations].forEach((relation) => {
    const storeId = String(relation?.storeId ?? '').trim();
    if (storeId && !map.has(storeId)) {
      map.set(storeId, relation);
    }
  });
  return Array.from(map.values());
}

function buildStoreSalaryDetail(storeId, period, relation, storeById, summaryByStore) {
  const store = storeById.get(String(storeId));
  const seed = {
    platform: relation?.platform || store?.platform || 'TEMU',
    storeId,
    storeName: store?.storeName || relation?.storeName || storeId,
    period,
  };
  const summary = summaryByStore.get(String(storeId)) ?? finalizeFinancialSummary(emptyFinancialSummary(seed));
  const warnings = [
    !summary.hasData ? '当前周期暂无财务数据' : '',
    summary.hasData && summary.inflowAmount === 0 ? '当前周期无结算金额' : '',
    summary.hasOtherExpense ? '存在未识别支出，已计入其他支出' : '',
    summary.hasNonCny ? '当前核算仅统计 CNY' : '',
  ].filter(Boolean);

  return {
    ...summary,
    platform: summary.platform || seed.platform,
    storeId: summary.storeId || storeId,
    storeName: summary.storeName || seed.storeName,
    period: summary.period || period,
    dataStatus: warnings.length > 0 ? warnings.join('；') : '已计算',
    warnings,
  };
}

function emptyOperatorTotals() {
  return {
    inflowAmount: 0,
    expenseAmount: 0,
    promotionServiceFee: 0,
    afterSalesProtectionFee: 0,
    storageServiceFee: 0,
    eprFee: 0,
    otherExpense: 0,
    withdrawAmount: 0,
    operationExpenseAmount: 0,
    netSalesAmount: 0,
    commissionAmount: 0,
  };
}

function isTemuSalaryOperator(employee) {
  const departmentName = String(employee?.departmentName ?? '').trim().toUpperCase();
  const platformText = String(employee?.platform ?? employee?.sourceFields?.平台 ?? employee?.sourceFields?.店铺平台 ?? '').trim().toUpperCase();
  return departmentName.includes('TEMU') || platformText === 'TEMU';
}

function buildOperatorSalaryStatistics(searchParams, currentUser) {
  const requestedPeriod = String(searchParams.get('period') ?? '').trim();
  const requestedOperatorId = String(searchParams.get('operatorId') ?? '').trim();
  const requestedStoreId = String(searchParams.get('storeId') ?? '').trim();
  const employees = readCollection('salaryEmployees')
    .filter((employee) => employee?.employeeType === 'operator' && employee?.status !== 'inactive' && isTemuSalaryOperator(employee));
  const relations = readCollection('storeOperatorRelations')
    .filter((relation) => relation?.status !== 'inactive' && (!requestedStoreId || String(relation?.storeId ?? '') === requestedStoreId));
  const stores = getStores();
  const operators = readCollection('operators');
  const operatorById = new Map(operators.map((operator) => [String(operator.id), operator]));
  const employeeOperatorIndex = createEmployeeOperatorIndex(operators);
  const users = readCollection('users');
  const summaries = buildFinancialStoreSummaries(
    readCollection('salaryFinancialDetails'),
    readCollection('salaryFinancialImportBatches'),
    new URLSearchParams(requestedPeriod ? { period: requestedPeriod } : {}),
    currentUser,
  );
  const summaryByStore = new Map(summaries.map((summary) => [String(summary.storeId), summary]));
  const storeById = new Map(stores.map((store) => [String(store.id), store]));
  const currentRole = String(currentUser?.role ?? '').toLowerCase();
  const currentOperatorId = String(currentUser?.operatorId ?? '').trim();
  const currentOperatorName = normalizePersonName(currentUser?.operatorName ?? currentUser?.displayName ?? currentUser?.username);

  return employees
    .filter((employee) => {
      if (!requestedOperatorId) return true;
      const employeeName = normalizePersonName(employee?.employeeName);
      const linkedOperatorIds = employeeOperatorIndex.get(employeeName) ?? new Set();
      return String(employee.operatorId || employee.id) === requestedOperatorId ||
        employee.id === requestedOperatorId ||
        linkedOperatorIds.has(requestedOperatorId);
    })
    .filter((employee) => currentRole === 'admin' ||
      String(employee.operatorId ?? '').trim() === currentOperatorId ||
      normalizePersonName(employee.employeeName) === currentOperatorName)
    .filter((employee) => {
      if (!requestedStoreId) return true;
      const matchedRelations = relations.filter((relation) => employeeMatchesRelation(employee, relation, operatorById));
      const fallbackRelations = buildUserStoreFallbackRelations(employee, users, stores, requestedStoreId);
      return mergeRelationsByStore(matchedRelations, fallbackRelations).length > 0;
    })
    .map((employee) => {
      const matchedRelations = relations.filter((relation) => employeeMatchesRelation(employee, relation, operatorById));
      const fallbackRelations = buildUserStoreFallbackRelations(employee, users, stores, requestedStoreId);
      const employeeRelations = mergeRelationsByStore(matchedRelations, fallbackRelations);
      const storeIds = Array.from(new Set(employeeRelations.map((relation) => String(relation.storeId ?? '')).filter(Boolean)));
      const storeDetails = storeIds.map((storeId) => buildStoreSalaryDetail(
        storeId,
        requestedPeriod,
        employeeRelations.find((relation) => String(relation.storeId ?? '') === storeId),
        storeById,
        summaryByStore,
      ));
      const storeNames = storeDetails.map((detail) => detail.storeName || detail.storeId);
      const baseSalaryMissing = employee.baseSalary === undefined || employee.baseSalary === null || employee.baseSalary === '';
      const baseSalary = baseSalaryMissing ? 0 : toFiniteNumber(employee.baseSalary);
      const totals = storeDetails.reduce((sum, item) => ({
        inflowAmount: sum.inflowAmount + item.inflowAmount,
        expenseAmount: sum.expenseAmount + item.expenseAmount,
        promotionServiceFee: sum.promotionServiceFee + item.promotionServiceFee,
        afterSalesProtectionFee: sum.afterSalesProtectionFee + item.afterSalesProtectionFee,
        storageServiceFee: sum.storageServiceFee + item.storageServiceFee,
        eprFee: sum.eprFee + item.eprFee,
        otherExpense: sum.otherExpense + item.otherExpense,
        withdrawAmount: sum.withdrawAmount + item.withdrawAmount,
        operationExpenseAmount: sum.operationExpenseAmount + item.operationExpenseAmount,
        netSalesAmount: sum.netSalesAmount + item.netSalesAmount,
        commissionAmount: sum.commissionAmount + item.commissionAmount,
      }), emptyOperatorTotals());
      const dataStoreCount = storeDetails.filter((detail) => detail.hasData).length;
      const missingStoreCount = storeDetails.filter((detail) => !detail.hasData).length;
      const warnings = [
        baseSalaryMissing ? '员工档案缺少基本工资，请先维护员工档案。' : '',
        storeIds.length === 0 ? '该运营未绑定负责店铺，无法计算运营提成。' : '',
        storeIds.length > 0 && dataStoreCount === 0 ? '当前周期暂无财务数据，运营提成为 0。' : '',
        dataStoreCount > 0 && missingStoreCount > 0 ? '部分店铺暂无财务数据，请检查财务明细导入。' : '',
        totals.otherExpense > 0 ? '财务明细中存在未识别支出，已归类为其他支出。' : '',
        storeDetails.some((summary) => summary.hasNonCny) ? '当前核算仅统计 CNY。' : '',
      ].filter(Boolean);
      const effectiveCommission = dataStoreCount === 0 ? 0 : totals.commissionAmount;

      return {
        id: `operator-salary-${requestedPeriod || 'all'}-${employee.id}`,
        period: requestedPeriod,
        employeeId: employee.id,
        operatorId: employee.operatorId || employee.id,
        operatorName: employee.employeeName,
        storeIds,
        storeNames,
        baseSalary,
        ...totals,
        commissionAmount: effectiveCommission,
        payableSalary: baseSalary + effectiveCommission,
        dataStatus: warnings.length > 0 ? warnings.join('；') : '已计算',
        warnings,
        hasFinancialData: dataStoreCount > 0,
        storeDetails,
      };
    });
}

async function handleSalaryFinancialImportsApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const pathname = requestUrl.pathname.replace(/^\/+/, '');
    const currentUser = toCurrentUser(findCurrentUser(req));
    const parts = pathname.split('/').filter(Boolean);

    if (req.method === 'GET') {
      if (!requireMenu(req, res, menuKeys.financeDetailImport)) return;

      if (parts.length === 2 && parts[1] === 'details') {
        const batchId = decodeURIComponent(parts[0]);
        const details = filterFinancialForUser(readCollection('salaryFinancialDetails'), currentUser)
          .filter((detail) => detail.importBatchId === batchId)
          .sort((first, second) => String(first.transactionTime).localeCompare(String(second.transactionTime)));
        res.end(JSON.stringify(paginate(details, requestUrl.searchParams)));
        return;
      }

      const batches = filterFinancialItems(filterFinancialForUser(readCollection('salaryFinancialImportBatches'), currentUser), requestUrl.searchParams)
        .sort((first, second) => String(second.importedAt).localeCompare(String(first.importedAt)));
      const page = paginate(batches, requestUrl.searchParams);
      res.end(JSON.stringify({
        ...page,
        storeOptions: unique(batches.map((batch) => batch.storeName || batch.storeId).filter(Boolean)),
        periodOptions: unique(batches.map((batch) => batch.period).filter(Boolean)).sort().reverse(),
      }));
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res, '仅管理员可导入财务明细。')) return;

      const payload = JSON.parse((await readBody(req)) || '{}');
      const rawBatch = payload.batch ?? {};
      const rawDetails = Array.isArray(payload.details) ? payload.details : [];
      const time = nowIso();
      const batchId = rawBatch.id || createId('financial-import');
      const normalizedDetails = rawDetails.map((detail) => normalizeFinancialDetail(detail, rawBatch, batchId, time));
      const normalizedBatch = normalizeFinancialBatch(rawBatch, normalizedDetails, batchId, time);

      if (!normalizedBatch.platform || !normalizedBatch.storeId || !normalizedBatch.period || !normalizedBatch.fileName) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: '平台、店铺、财务月份和文件名不能为空。' }));
        return;
      }

      const scopeKey = financialScopeKey(normalizedBatch);
      const currentBatches = readCollection('salaryFinancialImportBatches');
      const currentDetails = readCollection('salaryFinancialDetails');
      writeJsonFile('salaryFinancialImportBatches', [
        ...currentBatches.filter((batch) => financialScopeKey(batch) !== scopeKey),
        normalizedBatch,
      ]);
      writeJsonFile('salaryFinancialDetails', [
        ...currentDetails.filter((detail) => financialScopeKey(detail) !== scopeKey),
        ...normalizedDetails,
      ]);
      clearOperationWorkbenchDashboardCache();
      res.end(JSON.stringify({ ok: true, batch: normalizedBatch }));
      return;
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;

      const batchId = decodeURIComponent(parts[0] || '');
      writeJsonFile('salaryFinancialImportBatches', readCollection('salaryFinancialImportBatches').filter((batch) => batch.id !== batchId));
      writeJsonFile('salaryFinancialDetails', readCollection('salaryFinancialDetails').filter((detail) => detail.importBatchId !== batchId));
      clearOperationWorkbenchDashboardCache();
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}

function handleSalaryFinancialSummariesApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  if (!requireMenu(req, res, menuKeys.operationSalaryStatistics)) return;

  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const currentUser = toCurrentUser(findCurrentUser(req));
  const records = buildFinancialStoreSummaries(
    readCollection('salaryFinancialDetails'),
    readCollection('salaryFinancialImportBatches'),
    requestUrl.searchParams,
    currentUser,
  );
  res.end(JSON.stringify({ records: sanitizeSensitiveFields(records, currentUser) }));
}

function handleOperatorSalaryStatisticsApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  if (!requireMenu(req, res, menuKeys.operationSalaryStatistics)) return;

  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const currentUser = toCurrentUser(findCurrentUser(req));
  res.end(JSON.stringify({ records: sanitizeSensitiveFields(buildOperatorSalaryStatistics(requestUrl.searchParams, currentUser), currentUser) }));
}

function buildOperatorAnalysisStoreFinancialRecords(searchParams, currentUser) {
  const requestedPeriod = String(searchParams.get('period') ?? '').trim();
  const requestedOperatorId = String(searchParams.get('operatorId') ?? '').trim();
  const requestedStoreId = String(searchParams.get('storeId') ?? '').trim();
  const stores = getTemuVisibleStores(currentUser)
    .filter((store) => !requestedStoreId || String(store?.id ?? '') === requestedStoreId || String(store?.storeName ?? '') === requestedStoreId);
  const relations = readCollection('storeOperatorRelations')
    .filter((relation) => relation?.status !== 'inactive');
  const operatorById = new Map(readCollection('operators').map((operator) => [String(operator?.id ?? '').trim(), operator]));
  const storeById = new Map(getStores().map((store) => [String(store.id), store]));
  const summaries = buildFinancialStoreSummaries(
    readCollectionCached('salaryFinancialDetails'),
    readCollectionCached('salaryFinancialImportBatches'),
    new URLSearchParams(requestedPeriod ? { period: requestedPeriod } : {}),
    currentUser,
  );
  const summaryByStore = new Map(summaries.map((summary) => [String(summary.storeId), summary]));

  return stores
    .filter((store) => !requestedOperatorId || relations.some((relation) =>
      String(relation?.operatorId ?? '').trim() === requestedOperatorId &&
      (String(relation?.storeId ?? '').trim() === String(store?.id ?? '').trim() ||
        normalizeOrderImportStoreName(relation?.storeName) === normalizeOrderImportStoreName(store?.storeName))
    ))
    .map((store) => {
      const storeId = String(store?.id ?? '').trim();
      const relation = relations.find((item) => String(item?.storeId ?? '').trim() === storeId);
      const detail = buildStoreSalaryDetail(storeId, requestedPeriod, relation, storeById, summaryByStore);
      const relationOperatorId = String(relation?.operatorId ?? '').trim();
      const operatorName = relation?.operatorName || operatorById.get(relationOperatorId)?.operatorName || '';
      const inflowAmount = toFiniteNumber(detail?.inflowAmount);
      const promotionServiceFee = toFiniteNumber(detail?.promotionServiceFee);
      const afterSaleIssueAmount = toFiniteNumber(detail?.afterSalesProtectionFee);
      const storageServiceFee = toFiniteNumber(detail?.storageServiceFee);
      const eprFee = toFiniteNumber(detail?.eprFee);
      const otherExpense = toFiniteNumber(detail?.otherExpense);
      const operationExpenseAmount = promotionServiceFee +
        afterSaleIssueAmount +
        storageServiceFee +
        eprFee +
        otherExpense;
      const rate = (amount) => inflowAmount > 0 ? amount / inflowAmount : null;
      const storeName = String(detail?.storeName || store?.storeName || storeId).trim();

      return {
        period: detail?.period || requestedPeriod,
        operatorName,
        storeName,
        storeNames: storeName ? [storeName] : [],
        inflowAmount,
        promotionServiceFee,
        afterSaleIssueAmount,
        storageServiceFee,
        eprFee,
        otherExpense,
        operationExpenseAmount,
        promotionServiceFeeRate: rate(promotionServiceFee),
        afterSaleIssueRate: rate(afterSaleIssueAmount),
        operationExpenseRate: rate(operationExpenseAmount),
        hasFinancialData: Boolean(detail?.hasData),
        platform: detail?.platform || store?.platform,
      };
    })
    .filter((record) => itemMatchesTemuImportStore(record))
    .filter((record) => record.hasFinancialData || record.inflowAmount > 0 || record.operationExpenseAmount > 0)
    .map(({ hasFinancialData, platform, storeName, ...record }) => record);
}

function handleOperatorAnalysisStoreFinancialsApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  if (!requireMenu(req, res, menuKeys.operatorAnalysisCenter)) return;

  const requestUrl = new URL(req.url ?? '/', 'http://local');
  const currentUser = toCurrentUser(findCurrentUser(req));
  const records = buildOperatorAnalysisStoreFinancialRecords(requestUrl.searchParams, currentUser);

  res.end(JSON.stringify({ records: sanitizeSensitiveFields(records, currentUser) }));
}

function normalizeWorkbenchSkc(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .trim()
    .toUpperCase();
}

function getWorkbenchOrderSkc(order) {
  return normalizeWorkbenchSkc(order?.skc || order?.skcCode || order?.productSku || order?.skuCode || order?.productName || order?.uniqueKey);
}

function getWorkbenchMonthRange(period) {
  const safePeriod = /^\d{4}-\d{2}$/.test(period) ? period : formatOrderDateKey(new Date()).slice(0, 7);
  const [year, month] = safePeriod.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const today = new Date();
  const todayMonth = formatOrderDateKey(today).slice(0, 7);
  const isCurrentMonth = todayMonth === safePeriod;
  const isFutureMonth = safePeriod > todayMonth;
  const progressDate = isFutureMonth ? startDate : isCurrentMonth && today < endDate ? today : endDate;
  const daysInMonth = endDate.getDate();
  const elapsedDays = isFutureMonth ? 0 : Math.min(Math.max(progressDate.getDate(), 1), daysInMonth);

  return {
    period: safePeriod,
    start: formatOrderDateKey(startDate),
    end: formatOrderDateKey(endDate),
    today: formatOrderDateKey(today),
    daysInMonth,
    elapsedDays,
    remainingDays: isFutureMonth ? daysInMonth : Math.max(daysInMonth - elapsedDays + 1, 1),
    timeProgress: elapsedDays / daysInMonth,
  };
}

function getPreviousWorkbenchPeriod(period) {
  const [year, month] = String(period || '').split('-').map((value) => Number(value));
  if (!year || !month) return '';
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeWorkbenchOperatorName(name) {
  const normalized = String(name ?? '').trim();
  if (normalized === '曾佳宏') return '曾佳弘';
  return normalized;
}

function isRelationInStoreScope(relation, stores) {
  const storeKeys = new Set(stores.flatMap((store) => [
    String(store?.id ?? '').trim(),
    String(store?.storeName ?? '').trim(),
    normalizeOrderImportStoreName(store?.storeName || store?.id),
  ].filter(Boolean)));
  return storeKeys.has(String(relation?.storeId ?? '').trim()) ||
    storeKeys.has(String(relation?.storeName ?? '').trim()) ||
    storeKeys.has(normalizeOrderImportStoreName(relation?.storeName));
}

function getWorkbenchOperatorsForScope(allOperators, relations, stores) {
  const scopedRelations = relations.filter((relation) => isRelationInStoreScope(relation, stores));
  const activeOperatorIds = new Set(scopedRelations.map((relation) => String(relation?.operatorId ?? '').trim()).filter(Boolean));
  const activeOperatorNames = new Set(scopedRelations.map((relation) => normalizeWorkbenchOperatorName(relation?.operatorName)).filter(Boolean));
  const seen = new Set();
  const result = [];

  for (const operator of allOperators) {
    const operatorId = String(operator?.id ?? '').trim();
    const operatorName = normalizeWorkbenchOperatorName(operator?.operatorName);
    if (!operatorId && !operatorName) continue;
    if (!activeOperatorIds.has(operatorId) && !activeOperatorNames.has(operatorName)) continue;

    const key = operatorId || operatorName;
    if (seen.has(key) || seen.has(operatorName)) continue;
    seen.add(key);
    if (operatorName) seen.add(operatorName);
    result.push({ ...operator, operatorName });
  }

  for (const relation of scopedRelations) {
    const operatorId = String(relation?.operatorId ?? '').trim();
    const operatorName = normalizeWorkbenchOperatorName(relation?.operatorName);
    const key = operatorId || operatorName;
    if (!key || seen.has(key) || seen.has(operatorName)) continue;
    seen.add(key);
    if (operatorName) seen.add(operatorName);
    result.push({
      id: operatorId || `operator-${operatorName}`,
      operatorName,
      groupName: '',
      level: '',
      status: 'active',
      remark: '',
    });
  }

  return result;
}

function getWorkbenchScope(currentUser, searchParams) {
  const visibleStores = getTemuVisibleStores(currentUser);
  const role = String(currentUser?.role ?? '').toLowerCase();
  const requestedOperatorId = String(searchParams.get('operatorId') ?? '').trim();
  const requestedStoreId = String(searchParams.get('storeId') ?? '').trim();
  const relations = readCollection('storeOperatorRelations')
    .filter((relation) => relation?.status !== 'inactive')
    .map((relation) => ({ ...relation, operatorName: normalizeWorkbenchOperatorName(relation?.operatorName) }));
  const allOperators = getOperators().map((operator) => ({ ...operator, operatorName: normalizeWorkbenchOperatorName(operator?.operatorName) }));
  const operators = getWorkbenchOperatorsForScope(allOperators, relations, visibleStores);
  const operatorById = new Map(operators.map((operator) => [String(operator?.id ?? '').trim(), operator]));
  let stores = visibleStores;
  let operatorId = role === 'operator' ? String(currentUser?.operatorId ?? '').trim() : requestedOperatorId;
  let operatorName = '';

  const storeMatchesOperator = (store) => !operatorId || relations.some((relation) =>
    String(relation?.operatorId ?? '') === operatorId &&
    (String(relation?.storeId ?? '') === String(store?.id ?? '') ||
      normalizeOrderImportStoreName(relation?.storeName) === normalizeOrderImportStoreName(store?.storeName))
  );
  if (operatorId && role !== 'operator') {
    stores = stores.filter(storeMatchesOperator);
  }

  const storeOptions = stores;

  if (requestedStoreId) {
    stores = stores.filter((store) => String(store?.id ?? '') === requestedStoreId || String(store?.storeName ?? '') === requestedStoreId);
  }

  if (operatorId) {
    operatorName = normalizeWorkbenchOperatorName(operatorById.get(operatorId)?.operatorName || relations.find((relation) => String(relation?.operatorId ?? '') === operatorId)?.operatorName || '');
  }

  return {
    role,
    canManage: role === 'admin' || role === 'leader',
    operatorId,
    operatorName,
    stores,
    storeOptions,
    selectedStoreId: requestedStoreId,
    storeKeys: new Set(stores.flatMap((store) => [String(store?.id ?? ''), String(store?.storeName ?? '')].filter(Boolean))),
    storeNames: new Set(stores.map((store) => normalizeOrderImportStoreName(store?.storeName || store?.id)).filter(Boolean)),
    relations,
    operators,
  };
}

function itemMatchesWorkbenchScope(item, scope) {
  const storeId = String(item?.storeId ?? '').trim();
  const storeName = normalizeOrderImportStoreName(item?.storeName);
  return scope.storeKeys.has(storeId) || scope.storeKeys.has(storeName) || scope.storeNames.has(storeName);
}

function normalizeWorkbenchTarget(payload, current = {}) {
  const time = nowIso();
  const period = String(payload?.period ?? current?.period ?? '').trim();
  const operatorId = String(payload?.operatorId ?? current?.operatorId ?? '').trim();
  const storeId = String(payload?.storeId ?? current?.storeId ?? '').trim();

  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('period 必须是 YYYY-MM');
  }

  return {
    id: current?.id || payload?.id || createId('operation-kpi-target'),
    period,
    operatorId,
    operatorName: String(payload?.operatorName ?? current?.operatorName ?? '').trim(),
    storeId,
    storeName: String(payload?.storeName ?? current?.storeName ?? '').trim(),
    salesTarget: toFiniteNumber(payload?.salesTarget ?? current?.salesTarget),
    effectiveListingTarget: toFiniteNumber(payload?.effectiveListingTarget ?? current?.effectiveListingTarget),
    firstOrderProductTarget: toFiniteNumber(payload?.firstOrderProductTarget ?? current?.firstOrderProductTarget),
    expenseRatioTarget: toFiniteNumber(payload?.expenseRatioTarget ?? current?.expenseRatioTarget),
    enabled: payload?.enabled ?? current?.enabled ?? true,
    remark: String(payload?.remark ?? current?.remark ?? '').trim(),
    createdAt: current?.createdAt || time,
    updatedAt: time,
  };
}

function scoreProgress(current, target, weight) {
  if (!target || target <= 0) return null;
  return Math.min(current / target, 1) * weight;
}

function scoreExpenseRatio(currentRatio, targetRatio, weight) {
  if (!targetRatio || targetRatio <= 0 || currentRatio === null) return null;
  if (currentRatio <= targetRatio) return weight;
  return Math.max(0, 1 - ((currentRatio - targetRatio) / targetRatio)) * weight;
}

function getKpiStatus(score, weight, completionRate, timeProgress, inverseOverTarget = false) {
  if (inverseOverTarget) {
    if (completionRate === null) return '数据缺失';
    if (score === null) return '目标未设置';
    if (score >= weight) return '正常';
    if (score > 0) return '超标';
    return '严重超标';
  }
  if (score === null) return '目标未设置';
  if (completionRate >= 1) return '正常';
  const gap = completionRate - timeProgress;
  if (gap >= -0.05) return '正常';
  if (gap >= -0.2) return '落后';
  return '严重落后';
}

function pickWorkbenchTarget(targets, scope, period) {
  const enabledTargets = targets
    .filter((target) => target?.enabled !== false && target?.period === period)
    .sort((first, second) => Date.parse(second?.updatedAt || '') - Date.parse(first?.updatedAt || ''));
  const storeIds = new Set(scope.stores.map((store) => String(store?.id ?? '').trim()).filter(Boolean));
  const storeNames = new Set(scope.stores.map((store) => normalizeOrderImportStoreName(store?.storeName || store?.id)).filter(Boolean));
  const matchesStoreSet = (target) => {
    const targetStoreId = String(target?.storeId ?? '').trim();
    const targetStoreName = normalizeOrderImportStoreName(target?.storeName || target?.storeId);
    return (targetStoreId && storeIds.has(targetStoreId)) || (targetStoreName && storeNames.has(targetStoreName));
  };
  const matchesSingleStore = (target, store) => {
    const targetStoreId = String(target?.storeId ?? '').trim();
    const targetStoreName = normalizeOrderImportStoreName(target?.storeName || target?.storeId);
    const storeId = String(store?.id ?? '').trim();
    const storeName = normalizeOrderImportStoreName(store?.storeName || store?.id);
    return (targetStoreId && targetStoreId === storeId) || (targetStoreName && targetStoreName === storeName);
  };
  const matchesOperator = (target) => target?.operatorId && target.operatorId === scope.operatorId;
  const findStoreTarget = (store) => enabledTargets.find((target) => (
    (scope.operatorId ? matchesOperator(target) : true) &&
    (target?.storeId || target?.storeName) &&
    matchesSingleStore(target, store)
  ));
  const getStoreLabel = (store) => String(store?.storeName || store?.id || '').trim() || '未命名店铺';
  const requiredFields = ['salesTarget', 'effectiveListingTarget', 'firstOrderProductTarget', 'expenseRatioTarget'];
  const aggregateTargets = (storeTargetEntries, id, remark) => {
    const storeTargets = storeTargetEntries.map((entry) => entry.target).filter(Boolean);
    const missingTargetStores = storeTargetEntries.filter((entry) => !entry.target).map((entry) => getStoreLabel(entry.store));
    const missingFieldsByField = {};
    for (const field of requiredFields) {
      const missingStores = storeTargetEntries
        .filter((entry) => !entry.target || toFiniteNumber(entry.target?.[field]) <= 0)
        .map((entry) => getStoreLabel(entry.store));
      if (missingStores.length > 0) missingFieldsByField[field] = unique(missingStores);
    }
    const expenseBudgetEntries = storeTargets
      .map((target) => ({
        salesTarget: toFiniteNumber(target?.salesTarget),
        expenseRatioTarget: toFiniteNumber(target?.expenseRatioTarget),
      }))
      .filter((entry) => entry.salesTarget > 0 && entry.expenseRatioTarget > 0);
    const expenseSalesTargetTotal = expenseBudgetEntries.reduce((total, entry) => total + entry.salesTarget, 0);
    const expenseBudgetTotal = expenseBudgetEntries.reduce((total, entry) => total + entry.salesTarget * entry.expenseRatioTarget, 0);

    return {
      id,
      period,
      operatorId: scope.operatorId || '',
      operatorName: scope.operatorName || '',
      storeId: '',
      storeName: '',
      salesTarget: Number(storeTargets.reduce((total, target) => total + toFiniteNumber(target?.salesTarget), 0).toFixed(2)),
      effectiveListingTarget: storeTargets.reduce((total, target) => total + toFiniteNumber(target?.effectiveListingTarget), 0),
      firstOrderProductTarget: storeTargets.reduce((total, target) => total + toFiniteNumber(target?.firstOrderProductTarget), 0),
      expenseRatioTarget: expenseSalesTargetTotal > 0
        ? Number((expenseBudgetTotal / expenseSalesTargetTotal).toFixed(4))
        : 0,
      targetScopeStoreCount: storeTargetEntries.length,
      configuredStoreCount: storeTargets.length,
      missingTargetStores,
      missingTargetFields: Object.keys(missingFieldsByField),
      missingFieldsByField,
      expenseRatioTargetWeighted: true,
      enabled: true,
      remark,
      createdAt: '',
      updatedAt: storeTargets.map((target) => target?.updatedAt || '').filter(Boolean).sort().at(-1) || '',
    };
  };

  if (scope.operatorId && !scope.selectedStoreId && scope.stores.length > 1) {
    return aggregateTargets(
      scope.stores.map((store) => ({ store, target: findStoreTarget(store) })),
      `aggregate-${scope.operatorId}-${period}`,
      '当前运营全部店铺自动汇总目标',
    );
  }

  if (!scope.operatorId && !scope.selectedStoreId && scope.stores.length > 1) {
    return aggregateTargets(
      scope.stores.map((store) => ({ store, target: findStoreTarget(store) })),
      `aggregate-all-${period}`,
      '全部运营全部店铺自动汇总目标',
    );
  }

  return enabledTargets.find((target) => target.operatorId && target.operatorId === scope.operatorId && matchesStoreSet(target)) ||
    enabledTargets.find((target) => target.operatorId && target.operatorId === scope.operatorId && !target.storeId && !target.storeName) ||
    enabledTargets.find((target) => matchesStoreSet(target)) ||
    enabledTargets.find((target) => !target.operatorId && !target.storeId && !target.storeName) ||
    null;
}

function buildWorkbenchOperatorStoreMap(scope) {
  const visibleStoreKeys = new Set((scope.storeOptions ?? scope.stores).flatMap((store) => [
    String(store?.id ?? ''),
    String(store?.storeName ?? ''),
    normalizeOrderImportStoreName(store?.storeName),
  ].filter(Boolean)));

  return scope.operators.reduce((map, operator) => {
    const operatorId = String(operator?.id ?? '').trim();
    if (!operatorId) return map;

    const storeIds = scope.relations
      .filter((relation) => (
        relation?.status !== 'inactive' &&
        String(relation?.operatorId ?? '').trim() === operatorId &&
        (
          visibleStoreKeys.has(String(relation?.storeId ?? '').trim()) ||
          visibleStoreKeys.has(String(relation?.storeName ?? '').trim()) ||
          visibleStoreKeys.has(normalizeOrderImportStoreName(relation?.storeName))
        )
      ))
      .flatMap((relation) => [String(relation?.storeId ?? '').trim(), String(relation?.storeName ?? '').trim()])
      .filter(Boolean);

    map[operatorId] = unique(storeIds);
    return map;
  }, {});
}

async function readWorkbenchOrderStore() {
  return readPersistentDataForApi('orderImportStore', ensureDataFile('orderImportStore'));
}

async function readWorkbenchKpiTargets() {
  const jsonTargets = readCollectionCached('operationWorkbenchKpiTargets').map((target) => normalizeWorkbenchTarget(target));
  try {
    const postgresTargets = await readWorkbenchKpiTargetsFromPostgres();
    return postgresTargets.length > 0 ? postgresTargets.map((target) => normalizeWorkbenchTarget(target)) : jsonTargets;
  } catch (error) {
    console.warn('[TEMU PostgreSQL] workbench KPI targets read fallback to JSON:', error instanceof Error ? error.message : error);
    return jsonTargets;
  }
}

function filterWorkbenchKpiTargetsForScope(targets, currentUser, searchParams = new URLSearchParams()) {
  const explicitOperatorId = String(searchParams.get('operatorId') ?? '').trim();
  const explicitStoreId = String(searchParams.get('storeId') ?? '').trim();
  const role = String(currentUser?.role ?? '').toLowerCase();

  if (role === 'admin' && !explicitOperatorId && !explicitStoreId) {
    return targets;
  }

  const scopeParams = new URLSearchParams();
  if (explicitOperatorId) scopeParams.set('operatorId', explicitOperatorId);
  if (explicitStoreId) scopeParams.set('storeId', explicitStoreId);
  const scope = getWorkbenchScope(currentUser, scopeParams);
  const visibleStoreKeys = new Set(scope.stores.flatMap((store) => [
    String(store?.id ?? '').trim(),
    String(store?.storeName ?? '').trim(),
    normalizeOrderImportStoreName(store?.storeName || store?.id),
  ].filter(Boolean)));

  return targets.filter((target) => {
    if (explicitOperatorId && String(target?.operatorId ?? '').trim() && String(target.operatorId).trim() !== explicitOperatorId) {
      return false;
    }
    const targetStoreKeys = [
      String(target?.storeId ?? '').trim(),
      String(target?.storeName ?? '').trim(),
      normalizeOrderImportStoreName(target?.storeName || target?.storeId),
    ].filter(Boolean);
    if (targetStoreKeys.length === 0) {
      return role === 'admin' && !explicitStoreId;
    }
    return targetStoreKeys.some((key) => visibleStoreKeys.has(key));
  });
}

const operationWorkbenchDashboardCache = new Map();
const OPERATION_WORKBENCH_DASHBOARD_CACHE_TTL_MS = 5 * 60_000;

function clearOperationWorkbenchDashboardCache() {
  operationWorkbenchDashboardCache.clear();
}

function logWorkbenchKpiTiming(label, startedAt, timings) {
  const elapsed = Date.now() - startedAt;
  timings[label] = elapsed;
  console.info(`[workbench-kpi] ${label} ${elapsed}ms`);
  return elapsed;
}

function withWorkbenchTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function getOperationWorkbenchDashboardCacheKey(searchParams, currentUser) {
  const params = Array.from(searchParams.entries())
    .filter(([key]) => key !== 't')
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  let resolvedStoreKey = '';
  try {
    const scope = getWorkbenchScope(currentUser, searchParams);
    resolvedStoreKey = scope.stores
      .map((store) => String(store?.id || store?.storeName || '').trim())
      .filter(Boolean)
      .sort((first, second) => first.localeCompare(second))
      .join(',');
  } catch (error) {
    resolvedStoreKey = '';
  }
  return [
    String(currentUser?.userId ?? currentUser?.id ?? currentUser?.username ?? ''),
    String(currentUser?.role ?? ''),
    String(currentUser?.operatorId ?? ''),
    resolvedStoreKey,
    params,
  ].join('|');
}

async function buildOperationWorkbenchDashboard(searchParams, currentUser) {
  const cacheKey = getOperationWorkbenchDashboardCacheKey(searchParams, currentUser);
  const cached = operationWorkbenchDashboardCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    if (cached.promise) return cached.promise;
    console.info('[workbench-kpi] cacheHit true 0ms');
    return {
      ...cached.value,
      cache: {
        ...(cached.value?.cache ?? {}),
        cacheHit: true,
        ttlMs: OPERATION_WORKBENCH_DASHBOARD_CACHE_TTL_MS,
      },
      debug: {
        ...(cached.value?.debug ?? {}),
        cacheHit: true,
      },
    };
  }

  console.info('[workbench-kpi] cacheHit false');
  const promise = buildOperationWorkbenchDashboardUncached(searchParams, currentUser)
    .then((value) => {
      const generatedAt = new Date().toISOString();
      const nextValue = {
        ...value,
        cache: {
          cacheHit: false,
          generatedAt,
          ttlMs: OPERATION_WORKBENCH_DASHBOARD_CACHE_TTL_MS,
        },
        debug: {
          ...(value?.debug ?? {}),
          cacheHit: false,
          generatedAt,
        },
      };
      operationWorkbenchDashboardCache.set(cacheKey, {
        value: nextValue,
        expiresAt: Date.now() + OPERATION_WORKBENCH_DASHBOARD_CACHE_TTL_MS,
      });
      return nextValue;
    })
    .catch((error) => {
      operationWorkbenchDashboardCache.delete(cacheKey);
      throw error;
    });
  operationWorkbenchDashboardCache.set(cacheKey, {
    promise,
    expiresAt: now + OPERATION_WORKBENCH_DASHBOARD_CACHE_TTL_MS,
  });
  return promise;
}

async function buildOperationWorkbenchDashboardUncached(searchParams, currentUser) {
  const totalStartedAt = Date.now();
  const timings = {};
  let sectionStartedAt = Date.now();
  const range = getWorkbenchMonthRange(String(searchParams.get('period') ?? ''));
  const scope = getWorkbenchScope(currentUser, searchParams);
  logWorkbenchKpiTiming('scope', sectionStartedAt, timings);
  const stores = scope.stores;
  const requestedOperatorId = String(searchParams.get('operatorId') ?? '').trim();
  const requestedStoreId = String(searchParams.get('storeId') ?? '').trim();
  const resolvedStoreIds = stores.map((store) => String(store?.id ?? '').trim()).filter(Boolean);
  const resolvedStoreLabels = stores.map((store) => String(store?.storeName || store?.id || '').trim()).filter(Boolean);
  const scopeMode = scope.selectedStoreId
    ? 'selectedStore'
    : scope.operatorId
      ? 'selectedOperatorAllStores'
      : 'allVisibleStores';
  const scopeHash = resolvedStoreIds.length > 0 ? resolvedStoreIds.join(',') : resolvedStoreLabels.join(',');
  console.info(`[workbench-kpi] params period=${range.period} operatorId=${requestedOperatorId || scope.operatorId || 'all'} storeId=${requestedStoreId || 'all'}`);
  console.info(`[workbench-kpi] resolvedStoreIds count=${stores.length} stores=${resolvedStoreLabels.join('、') || '-'}`);
  console.info(`[workbench-kpi] scope mode=${scopeMode} role=${scope.role || ''} hash=${scopeHash || '-'}`);
  const storeByName = new Map(stores.map((store) => [normalizeOrderImportStoreName(store.storeName || store.id), store]));
  sectionStartedAt = Date.now();
  const targetsPromise = readWorkbenchKpiTargets().then((value) => {
    const scopedTargets = filterWorkbenchKpiTargetsForScope(value, currentUser, searchParams);
    logWorkbenchKpiTiming('targets', sectionStartedAt, timings);
    return scopedTargets;
  });
  const orderReadStartedAt = Date.now();
  const orderStorePromise = readWorkbenchOrderStore().then((value) => {
    logWorkbenchKpiTiming('salesDataRead', orderReadStartedAt, timings);
    return value;
  });
  const storeNames = stores.map((store) => String(store?.storeName || store?.id || '').trim()).filter(Boolean);
  const listingStartedAt = Date.now();
  const newProductListingStatsPromise = calculateNewProductFirstOrderStats({
    periodStart: range.start,
    periodEnd: range.end,
    today: range.today,
    observeDays: 30,
    dateMode: 'listedAt',
    storeNames,
  }).then((value) => {
    logWorkbenchKpiTiming('listing', listingStartedAt, timings);
    return value;
  });
  const firstOrderStartedAt = Date.now();
  const newProductFirstOrderStatsPromise = calculateNewProductFirstOrderStats({
    periodStart: range.start,
    periodEnd: range.end,
    today: range.today,
    observeDays: 30,
    dateMode: 'observeEnd',
    storeNames,
  }).then((value) => {
    logWorkbenchKpiTiming('firstOrder', firstOrderStartedAt, timings);
    return value;
  });
  const dataReadResults = await Promise.allSettled([
    withWorkbenchTimeout(targetsPromise, 5000, 'targets'),
    withWorkbenchTimeout(orderStorePromise, 5000, 'salesDataRead'),
  ]);
  let targets = [];
  let orderStore = { batches: [] };
  let baseDataReadError = '';
  if (dataReadResults[0].status === 'fulfilled') {
    targets = dataReadResults[0].value;
  } else {
    baseDataReadError = `KPI目标读取失败：${dataReadResults[0].reason?.message || dataReadResults[0].reason}`;
    console.warn('[workbench-kpi] targets failed:', baseDataReadError);
    if (!timings.targets) timings.targets = Date.now() - sectionStartedAt;
  }
  if (dataReadResults[1].status === 'fulfilled') {
    orderStore = dataReadResults[1].value;
  } else {
    baseDataReadError = [baseDataReadError, `订单销售数据读取失败：${dataReadResults[1].reason?.message || dataReadResults[1].reason}`].filter(Boolean).join('；');
    console.warn('[workbench-kpi] salesDataRead failed:', baseDataReadError);
    if (!timings.salesDataRead) timings.salesDataRead = Date.now() - orderReadStartedAt;
  }
  const target = pickWorkbenchTarget(targets, scope, range.period);
  console.info(`[workbench-kpi] targets count=${targets.length} targetStatus=${target ? 'matched' : 'missing'} configuredStores=${target?.configuredStoreCount ?? '-'}`);
  sectionStartedAt = Date.now();
  let salesAmountRaw = 0;
  let orderCount = 0;
  let quantity = 0;
  const storeSalesMap = new Map();
  for (const batch of orderStore?.batches ?? []) {
    for (const order of batch?.orders ?? []) {
      const date = getOrderDateKey(order);
      if (!date || date < range.start || date > range.end || !itemMatchesWorkbenchScope(order, scope)) continue;
      const orderSalesAmount = getDashboardOrderSalesAmount(order);
      salesAmountRaw += orderSalesAmount;
      orderCount += 1;
      quantity += Number(order?.quantity) || 0;
      const storeName = normalizeOrderImportStoreName(order?.storeName);
      const current = storeSalesMap.get(storeName) ?? { storeName, salesAmount: 0, orderCount: 0 };
      current.salesAmount += orderSalesAmount;
      current.orderCount += 1;
      storeSalesMap.set(storeName, current);
    }
  }
  const salesAmount = Number(salesAmountRaw.toFixed(2));
  logWorkbenchKpiTiming('sales', sectionStartedAt, timings);

  const emptyNewProductStats = {
    newProductCount: 0,
    firstOrderWithin30DaysCount: 0,
    expiredNoFirstOrderCount: 0,
    delayedFirstOrderCount: 0,
    observingCount: 0,
    decidableCount: 0,
    firstOrderRate: null,
    products: [],
    dataUpdatedAt: '',
  };
  let newProductListingStats = emptyNewProductStats;
  let newProductFirstOrderStats = emptyNewProductStats;
  let newProductStatsError = '';
  try {
    [newProductListingStats, newProductFirstOrderStats] = await Promise.all([
      withWorkbenchTimeout(newProductListingStatsPromise, 8000, 'listing'),
      withWorkbenchTimeout(newProductFirstOrderStatsPromise, 8000, 'firstOrder'),
    ]);
  } catch (error) {
    newProductStatsError = error instanceof Error ? error.message : String(error);
    console.warn('[TEMU PostgreSQL] workbench first-order stats failed:', newProductStatsError);
    if (!timings.listing) timings.listing = Date.now() - listingStartedAt;
    if (!timings.firstOrder) timings.firstOrder = Date.now() - firstOrderStartedAt;
    newProductListingStats = emptyNewProductStats;
    newProductFirstOrderStats = emptyNewProductStats;
  }
  const listingProductCount = newProductListingStats.newProductCount;
  const todayListingCount = newProductListingStats.products.filter((item) => String(item?.listedAt ?? '').slice(0, 10) === range.today).length;
  const listingReferenceDate = range.today >= range.start && range.today <= range.end ? range.today : range.end;
  const listingLast7Start = formatOrderDateKey(new Date(Date.parse(`${listingReferenceDate}T00:00:00`) - 6 * 86400000));
  const last7DaysListingCount = newProductListingStats.products.filter((item) => {
    const listedAt = String(item?.listedAt ?? '').slice(0, 10);
    return listedAt && listedAt >= listingLast7Start && listedAt <= listingReferenceDate;
  }).length;
  const firstOrderProductCount = newProductFirstOrderStats.firstOrderWithin30DaysCount;
  const productFollowUpSource = Array.from(new Map([
    ...newProductFirstOrderStats.products,
    ...newProductListingStats.products.filter((item) => item.status === 'OBSERVING'),
  ].map((item) => [item.productKey || item.productId || `${item.storeName}-${item.skcId}-${item.skuId}`, item])).values());
  const dueIn7DaysCount = productFollowUpSource.filter((item) => (
    item.status === 'OBSERVING' &&
    Number(item.remainingObserveDays ?? 0) > 0 &&
    Number(item.remainingObserveDays ?? 0) <= 7
  )).length;
  const productFollowUps = productFollowUpSource.map((item) => {
    const siteJoinDate = String(item?.listedAt ?? '').slice(0, 10);
    const daysOnline = siteJoinDate ? Math.max(0, Math.floor((Date.parse(`${range.today}T00:00:00`) - Date.parse(`${siteJoinDate}T00:00:00`)) / 86400000) + 1) : 0;
    const action = item.status === 'FIRST_ORDER_SUCCESS'
      ? '30天内已首单，继续观察复购和加推空间'
      : item.status === 'DELAYED_FIRST_ORDER'
        ? '已延迟首单，不计入30天首单成功，需要复盘前30天转化阻力'
      : item.status === 'EXPIRED_NO_FIRST_ORDER'
        ? '已超过30天未首单，复盘标题、主图、价格、曝光和投放'
        : '仍在30天观察期内，暂不计入首单率分母';
    return {
      skc: item.skcId || item.productKey || '',
      spuId: item.spuId || '',
      skuId: item.skuId || '',
      productName: item.productName || '',
      storeId: item.storeId || '',
      storeName: item.storeName || storeByName.get(normalizeOrderImportStoreName(item?.storeName))?.storeName || item.storeId || '',
      operatorName: item.operatorName || '',
      siteJoinDate,
      observeEndAt: item.observeEndAt || '',
      daysOnline,
      firstOrderStatus: item.status === 'FIRST_ORDER_SUCCESS' ? '30天内已首单' : item.status === 'DELAYED_FIRST_ORDER' ? '延迟首单' : item.status === 'EXPIRED_NO_FIRST_ORDER' ? '已超过30天未首单' : `观察中，剩余 ${item.remainingObserveDays ?? 0} 天`,
      firstOrderStatusCode: item.status,
      firstOrderDate: item.firstOrderAt || '',
      salesQuantity: item.status === 'FIRST_ORDER_SUCCESS' ? 1 : 0,
      suggestedAction: action,
    };
  }).sort((first, second) => {
    const rank = (item) => item.firstOrderStatusCode === 'EXPIRED_NO_FIRST_ORDER' ? 0 : item.firstOrderStatusCode === 'DELAYED_FIRST_ORDER' ? 1 : item.firstOrderStatusCode === 'OBSERVING' ? 2 : 3;
    return rank(first) - rank(second) || second.daysOnline - first.daysOnline || first.skc.localeCompare(second.skc);
  }).slice(0, 20);

  const expenseEndDate = range.today >= range.start && range.today <= range.end ? range.today : range.end;
  const expenseElapsedDays = Math.max(range.elapsedDays || 0, 1);
  let adSpendSummary = { adSpend: 0, recordCount: 0, reportDayCount: 0, stores: [] };
  let adSpendError = '';
  sectionStartedAt = Date.now();
  try {
    adSpendSummary = await getAdSpendSummary({
      startDate: range.start,
      endDate: expenseEndDate,
      storeNames: stores.map((store) => String(store?.storeName || store?.id || '').trim()).filter(Boolean),
    });
  } catch (error) {
    adSpendError = error instanceof Error ? error.message : String(error);
    console.warn('[TEMU PostgreSQL] workbench ad spend summary failed:', adSpendError);
  }
  logWorkbenchKpiTiming('adExpense', sectionStartedAt, timings);
  const previousFinancePeriod = getPreviousWorkbenchPeriod(range.period);
  const previousFinanceParams = new URLSearchParams({ period: previousFinancePeriod });
  if (scope.operatorId) previousFinanceParams.set('operatorId', scope.operatorId);
  if (searchParams.get('storeId')) previousFinanceParams.set('storeId', searchParams.get('storeId'));
  sectionStartedAt = Date.now();
  const previousFinanceRecords = buildOperatorAnalysisStoreFinancialRecords(previousFinanceParams, currentUser)
    .filter((record) => !searchParams.get('storeId') || record.storeNames?.includes(searchParams.get('storeId')) || record.storeNames?.some((name) => scope.storeNames.has(normalizeOrderImportStoreName(name))));
  logWorkbenchKpiTiming('afterSaleExpense', sectionStartedAt, timings);
  timings.expense = (timings.adExpense ?? 0) + (timings.afterSaleExpense ?? 0);
  console.info(`[workbench-kpi] expense ${timings.expense}ms`);
  const lastMonthAfterSaleAmount = previousFinanceRecords.reduce((total, record) => total + toFiniteNumber(record.afterSaleIssueAmount), 0);
  const estimatedAfterSaleAmount = Number(((lastMonthAfterSaleAmount / 30) * expenseElapsedDays).toFixed(2));
  const adExpenseAmount = Number(toFiniteNumber(adSpendSummary.adSpend).toFixed(2));
  const totalExpenseAmount = Number((adExpenseAmount + estimatedAfterSaleAmount).toFixed(2));
  const expenseSalesBase = salesAmount;
  const expenseRatio = expenseSalesBase > 0 ? totalExpenseAmount / expenseSalesBase : null;
  const adRatio = expenseSalesBase > 0 ? adExpenseAmount / expenseSalesBase : null;
  const afterSaleRatio = expenseSalesBase > 0 ? estimatedAfterSaleAmount / expenseSalesBase : null;
  const hasExpenseData = adExpenseAmount > 0 || lastMonthAfterSaleAmount > 0;
  const expenseGapToTarget = expenseRatio !== null && target?.expenseRatioTarget ? target.expenseRatioTarget - expenseRatio : null;
  const mainExpenseSource = !hasExpenseData
    ? ''
    : Math.abs(adExpenseAmount - estimatedAfterSaleAmount) <= Math.max(totalExpenseAmount * 0.1, 1)
      ? '均衡'
      : adExpenseAmount > estimatedAfterSaleAmount
        ? '推广'
        : '售后';

  const adSpendByStore = new Map((adSpendSummary.stores ?? []).map((item) => [
    normalizeOrderImportStoreName(item?.storeName),
    toFiniteNumber(item?.adSpend),
  ]));
  const afterSaleByStore = new Map();
  for (const record of previousFinanceRecords) {
    const amount = toFiniteNumber(record?.afterSaleIssueAmount);
    for (const name of record?.storeNames ?? []) {
      const key = normalizeOrderImportStoreName(name);
      if (key) afterSaleByStore.set(key, (afterSaleByStore.get(key) ?? 0) + amount);
    }
  }

  const buildStoreTargetScope = (store) => {
    const storeId = String(store?.id ?? '').trim();
    const storeName = normalizeOrderImportStoreName(store?.storeName || store?.id);
    return {
      ...scope,
      stores: [store],
      selectedStoreId: storeId,
      storeKeys: new Set([storeId, String(store?.storeName ?? '').trim(), storeName].filter(Boolean)),
      storeNames: new Set([storeName].filter(Boolean)),
    };
  };

  const completionLabel = (value) => value === null || value === undefined || !Number.isFinite(value) ? '-' : `${(value * 100).toFixed(1)}%`;
  const buildStoreProblem = (row) => {
    if (row.targetStatus !== 'ok') return row.targetStatus === 'missing' ? '目标未配置' : '部分目标缺失';
    const salesBad = row.salesCompletionRate !== null && row.salesCompletionRate < Math.max(range.timeProgress - 0.2, 0);
    const listingBad = row.listingCompletionRate !== null && row.listingCompletionRate < 0.6;
    const firstOrderBad = row.firstOrderCompletionRate !== null && row.firstOrderCompletionRate < 0.6;
    const expenseBad = row.expenseRatio !== null && row.expenseTargetRatio !== null && row.expenseRatio > row.expenseTargetRatio;
    if (salesBad && expenseBad) return '销售与费用异常';
    if (listingBad && firstOrderBad) return '上新与新品转化异常';
    if ([salesBad, listingBad, firstOrderBad, expenseBad].filter(Boolean).length > 1) return '多项指标落后';
    if (listingBad) return '上新严重落后';
    if (firstOrderBad) return '新品转化偏低';
    if (salesBad) return '销售进度落后';
    if (expenseBad) return '费用超标';
    return '表现正常';
  };
  const buildStoreStatus = (score, targetStatus) => {
    if (targetStatus !== 'ok' || score === null) return '数据缺失';
    if (score >= 85) return '正常';
    if (score >= 70) return '轻微落后';
    if (score >= 60) return '落后';
    return '严重落后';
  };
  sectionStartedAt = Date.now();
  const countProductsByStore = (products, predicate = () => true) => {
    const result = new Map();
    for (const item of products ?? []) {
      if (!predicate(item)) continue;
      const key = normalizeOrderImportStoreName(item?.storeName || item?.storeId);
      if (!key) continue;
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  const listingByStore = countProductsByStore(newProductListingStats.products);
  const listingObservingByStore = countProductsByStore(newProductListingStats.products, (item) => item.status === 'OBSERVING');
  const firstOrderSuccessByStore = countProductsByStore(newProductFirstOrderStats.products, (item) => item.status === 'FIRST_ORDER_SUCCESS');
  const firstOrderExpiredByStore = countProductsByStore(newProductFirstOrderStats.products, (item) => item.status === 'EXPIRED_NO_FIRST_ORDER');
  const firstOrderObservingByStore = countProductsByStore(newProductFirstOrderStats.products, (item) => item.status === 'OBSERVING');
  logWorkbenchKpiTiming('storeBreakdownPreAggregate', sectionStartedAt, timings);
  sectionStartedAt = Date.now();
  const storeBreakdown = stores.map((store) => {
    const storeId = String(store?.id ?? '').trim();
    const storeName = String(store?.storeName || storeId).trim();
    const storeKey = normalizeOrderImportStoreName(storeName || storeId);
    const storeScope = buildStoreTargetScope(store);
    const storeTarget = pickWorkbenchTarget(targets, storeScope, range.period);
    const storeMissingFields = new Set(Array.isArray(storeTarget?.missingTargetFields) ? storeTarget.missingTargetFields : []);
    const storeFieldComplete = (field) => Boolean(storeTarget && toFiniteNumber(storeTarget?.[field]) > 0 && !storeMissingFields.has(field));
    const salesActual = toFiniteNumber(storeSalesMap.get(storeKey)?.salesAmount);
    const listingActual = listingByStore.get(storeKey) ?? 0;
    const firstOrderActual = firstOrderSuccessByStore.get(storeKey) ?? 0;
    const expiredNoFirstOrder = firstOrderExpiredByStore.get(storeKey) ?? 0;
    const observingCount = (listingObservingByStore.get(storeKey) ?? 0) + (firstOrderObservingByStore.get(storeKey) ?? 0);
    const storeAdExpense = toFiniteNumber(adSpendByStore.get(storeKey));
    const storeAfterSaleExpense = Number(((toFiniteNumber(afterSaleByStore.get(storeKey)) / 30) * expenseElapsedDays).toFixed(2));
    const storeTotalExpense = Number((storeAdExpense + storeAfterSaleExpense).toFixed(2));
    const storeExpenseRatio = salesActual > 0 ? storeTotalExpense / salesActual : null;
    const salesCompletionRate = storeFieldComplete('salesTarget') ? salesActual / storeTarget.salesTarget : null;
    const listingCompletionRate = storeFieldComplete('effectiveListingTarget') ? listingActual / storeTarget.effectiveListingTarget : null;
    const firstOrderCompletionRate = storeFieldComplete('firstOrderProductTarget') ? firstOrderActual / storeTarget.firstOrderProductTarget : null;
    const salesStoreScore = storeFieldComplete('salesTarget') ? scoreProgress(salesActual, storeTarget.salesTarget, 30) : null;
    const listingStoreScore = storeFieldComplete('effectiveListingTarget') ? scoreProgress(listingActual, storeTarget.effectiveListingTarget, 30) : null;
    const firstOrderStoreScore = storeFieldComplete('firstOrderProductTarget') ? scoreProgress(firstOrderActual, storeTarget.firstOrderProductTarget, 20) : null;
    const expenseStoreScore = storeFieldComplete('expenseRatioTarget') ? scoreExpenseRatio(storeExpenseRatio, storeTarget.expenseRatioTarget, 20) : null;
    const targetStatus = !storeTarget ? 'missing' : ['salesTarget', 'effectiveListingTarget', 'firstOrderProductTarget', 'expenseRatioTarget'].every(storeFieldComplete) ? 'ok' : 'partial';
    const total = targetStatus === 'ok'
      ? Number([salesStoreScore, listingStoreScore, firstOrderStoreScore, expenseStoreScore].reduce((sum, value) => sum + (value ?? 0), 0).toFixed(1))
      : null;
    const row = {
      storeId,
      storeName,
      operatorName: scope.operatorName || '',
      totalScore: total,
      scoreText: total === null ? (targetStatus === 'missing' ? '目标未配置' : '部分目标缺失') : `${total.toFixed(1)}分`,
      salesCompletionRate,
      listingCompletionRate,
      firstOrderCompletionRate,
      expenseRatio: storeExpenseRatio,
      expenseTargetRatio: storeTarget?.expenseRatioTarget ?? null,
      targetStatus,
      status: buildStoreStatus(total, targetStatus),
      kpis: {
        sales: { target: storeTarget?.salesTarget ?? null, actual: salesActual, completionRate: salesCompletionRate, score: salesStoreScore },
        listing: { target: storeTarget?.effectiveListingTarget ?? null, actual: listingActual, completionRate: listingCompletionRate, score: listingStoreScore },
        firstOrder: {
          target: storeTarget?.firstOrderProductTarget ?? null,
          actual: firstOrderActual,
          completionRate: firstOrderCompletionRate,
          score: firstOrderStoreScore,
          expiredNoFirstOrder,
          observingCount,
        },
        expense: { targetRatio: storeTarget?.expenseRatioTarget ?? null, actualRatio: storeExpenseRatio, totalExpense: storeTotalExpense, score: expenseStoreScore },
      },
    };
    return { ...row, mainProblem: buildStoreProblem(row) };
  }).sort((first, second) => {
    const firstScore = first.totalScore ?? -1;
    const secondScore = second.totalScore ?? -1;
    return firstScore - secondScore || first.storeName.localeCompare(second.storeName, 'zh-CN');
  });
  logWorkbenchKpiTiming('storeBreakdown', sectionStartedAt, timings);

  sectionStartedAt = Date.now();
  const missingTargetFields = new Set(Array.isArray(target?.missingTargetFields) ? target.missingTargetFields : []);
  const targetFieldComplete = (field) => Boolean(target && toFiniteNumber(target?.[field]) > 0 && !missingTargetFields.has(field));
  const targetIncompleteStatus = (field) => {
    if (!target || toFiniteNumber(target?.[field]) <= 0) return '目标未配置';
    return missingTargetFields.has(field) ? '部分目标缺失' : null;
  };
  const salesTargetComplete = targetFieldComplete('salesTarget');
  const listingTargetComplete = targetFieldComplete('effectiveListingTarget');
  const firstOrderTargetComplete = targetFieldComplete('firstOrderProductTarget');
  const expenseTargetComplete = targetFieldComplete('expenseRatioTarget');

  const salesScore = salesTargetComplete ? scoreProgress(salesAmount, target?.salesTarget, 30) : null;
  const listingScore = listingTargetComplete ? scoreProgress(listingProductCount, target?.effectiveListingTarget, 30) : null;
  const firstOrderScore = firstOrderTargetComplete ? scoreProgress(firstOrderProductCount, target?.firstOrderProductTarget, 20) : null;
  const expenseScore = expenseTargetComplete ? scoreExpenseRatio(expenseRatio, target?.expenseRatioTarget, 20) : null;
  const scoreParts = [salesScore, listingScore, firstOrderScore, expenseScore];
  const hasConfiguredTarget = salesTargetComplete && listingTargetComplete && firstOrderTargetComplete && expenseTargetComplete;
  const totalScore = hasConfiguredTarget
    ? Number(scoreParts.reduce((total, score) => total + (score ?? 0), 0).toFixed(1))
    : null;
  const completion = {
    sales: salesTargetComplete ? salesAmount / target.salesTarget : null,
    listing: listingTargetComplete ? listingProductCount / target.effectiveListingTarget : null,
    firstOrder: firstOrderTargetComplete ? firstOrderProductCount / target.firstOrderProductTarget : null,
    expense: expenseRatio,
  };
  const buildProgressMetric = (currentValue, targetValue) => {
    if (!targetValue || targetValue <= 0) {
      return {
        currentValue,
        targetValue: targetValue ?? null,
        expectedByTime: null,
        progressGapValue: null,
        remainingToTarget: null,
        exceededTarget: null,
      };
    }
    const expectedByTime = Number((targetValue * range.timeProgress).toFixed(2));
    return {
      currentValue,
      targetValue,
      expectedByTime,
      progressGapValue: Number((currentValue - expectedByTime).toFixed(2)),
      remainingToTarget: Number(Math.max(targetValue - currentValue, 0).toFixed(2)),
      exceededTarget: Number(Math.max(currentValue - targetValue, 0).toFixed(2)),
    };
  };
  const salesProgressMetric = buildProgressMetric(salesAmount, target?.salesTarget ?? null);
  const listingProgressMetric = buildProgressMetric(listingProductCount, target?.effectiveListingTarget ?? null);
  const over7NoFirstOrder = newProductFirstOrderStats.expiredNoFirstOrderCount;
  const remainingListing = Math.max((target?.effectiveListingTarget || 0) - listingProductCount, 0);
  const todaySuggestedListing = target?.effectiveListingTarget > 0 && range.timeProgress > 0 ? Math.ceil(remainingListing / range.remainingDays) : null;
  const dataUpdatedAt = [
    ...(orderStore?.batches ?? []).map((batch) => batch.importedAt),
    newProductListingStats.dataUpdatedAt,
    newProductFirstOrderStats.dataUpdatedAt,
  ].filter(Boolean).sort().at(-1) || '';
  const warnings = [];
  const pushWarning = (message, type = 'DATA_INTEGRITY', level = 'warning') => warnings.push({ type, level, message });
  const targetFieldLabels = {
    salesTarget: '销售额目标',
    effectiveListingTarget: '有效上新目标',
    firstOrderProductTarget: '30天首单目标',
    expenseRatioTarget: '费用占比目标',
  };
  if (Array.isArray(target?.missingTargetStores) && target.missingTargetStores.length > 0) {
    pushWarning(
      `当前范围有 ${target.missingTargetStores.length} 个负责店铺未配置本月KPI目标：${target.missingTargetStores.join('、')}`,
      'MISSING_KPI_TARGET',
    );
  }
  for (const [field, label] of Object.entries(targetFieldLabels)) {
    const missingStores = target?.missingFieldsByField?.[field] ?? [];
    if (missingStores.length > 0) {
      pushWarning(`当前范围有 ${missingStores.length} 个店铺缺少${label}：${missingStores.join('、')}`, 'MISSING_KPI_TARGET_FIELD');
    } else if (!targetFieldComplete(field)) {
      pushWarning(`本月未配置${label}`, 'MISSING_KPI_TARGET_FIELD');
    }
  }
  if (newProductStatsError) warnings.push(`新品30天首单统计读取失败：${newProductStatsError}`);
  if (adSpendError) warnings.push(`广告花费统计读取失败：${adSpendError}`);
  if (baseDataReadError) warnings.push(baseDataReadError);
  if (!hasExpenseData) warnings.push('未找到广告花费或上月售后问题金额，费用占比无法计算');
  if (salesAmount <= 0) warnings.push('本月暂无订单销售额，费用占比无法用订单销售额校验');
  const totalObservingCount = newProductListingStats.observingCount + newProductFirstOrderStats.observingCount;
  if (totalObservingCount > 0) warnings.push(`还有 ${totalObservingCount} 个新品处于30天观察期内，暂不计入首单率分母`);
  if (stores.length === 0) warnings.push('当前账号未绑定 TEMU 可见店铺');
  logWorkbenchKpiTiming('dataIntegrity', sectionStartedAt, timings);

  sectionStartedAt = Date.now();
  let todayActions = [];
  const shouldShowProgressActions = range.timeProgress > 0;
  const scopedStore = stores.length === 1 ? stores[0] : null;
  const scopedStoreId = scopedStore ? String(scopedStore.id || scopedStore.storeName || '').trim() : '';
  const scopedStoreName = scopedStore ? String(scopedStore.storeName || scopedStore.id || '').trim() : '';
  if (shouldShowProgressActions && completion.sales !== null && completion.sales < range.timeProgress) {
    todayActions.push({
      priority: completion.sales < range.timeProgress - 0.2 ? '高' : '中',
      title: `${scopedStoreName ? `${scopedStoreName}` : ''}销售进度落后${Math.abs((completion.sales - range.timeProgress) * 100).toFixed(1)}%，请优先查看销售明细`,
      kpi: '本月销售额',
      impact: '影响销售额目标完成率和综合 KPI 得分',
      actionLabel: scopedStoreId ? '查看店铺' : '查看销售进度',
      actionHref: '/admin/store-business',
      storeId: scopedStoreId || undefined,
      secondaryActionLabel: '查看销售明细',
      secondaryActionHref: '/admin/store-business',
    });
  }
  if (shouldShowProgressActions && completion.listing !== null && completion.listing < range.timeProgress) {
    const listingLag = listingProgressMetric.progressGapValue !== null ? Math.abs(Math.floor(listingProgressMetric.progressGapValue)) : remainingListing;
    todayActions.push({
      priority: '高',
      title: scopedStoreName
        ? `${scopedStoreName}上新进度严重落后，当前按时间进度落后${listingLag}款，请优先补齐可快速上线商品信息`
        : `上新进度严重落后，当前按时间进度落后${listingLag}款，请优先补充重点店铺新品`,
      kpi: '上新商品数',
      impact: '影响可控动作产出和后续新品转化',
      actionLabel: scopedStoreId ? '查看店铺' : '去导入商品信息',
      actionHref: '/admin/temu-product-info-import',
      storeId: scopedStoreId || undefined,
      secondaryActionLabel: '去导入商品信息',
      secondaryActionHref: '/admin/temu-product-info-import',
    });
  }
  if (shouldShowProgressActions && over7NoFirstOrder > 0) {
    todayActions.push({
      priority: '高',
      title: `${scopedStoreName ? `${scopedStoreName}有` : ''}${over7NoFirstOrder}款新品已超过30天仍未首单，优先优化主图、标题和价格`,
      kpi: '新品30天首单率',
      impact: '影响已判定新品的30天首单率',
      actionLabel: scopedStoreId ? '查看店铺' : '查看未首单商品',
      actionHref: '#product-follow-ups',
      storeId: scopedStoreId || undefined,
      secondaryActionLabel: '查看未首单商品',
      secondaryActionHref: '#product-follow-ups',
    });
  }
  if (shouldShowProgressActions && expenseRatio !== null && target?.expenseRatioTarget > 0 && expenseRatio > target.expenseRatioTarget) {
    todayActions.push({
      priority: '中',
      title: `${scopedStoreName ? `${scopedStoreName}` : ''}费用占比高于目标${((expenseRatio - target.expenseRatioTarget) * 100).toFixed(1)}个百分点，请查看费用来源`,
      kpi: '费用占比',
      impact: '推广费和售后费超标会拉低费用控制得分',
      actionLabel: scopedStoreId ? '查看店铺' : '查看费用明细',
      actionHref: '/admin/operator-analysis',
      storeId: scopedStoreId || undefined,
      secondaryActionLabel: '查看费用明细',
      secondaryActionHref: '/admin/operator-analysis',
    });
  }
  if (!scope.selectedStoreId && storeBreakdown.length > 1) {
    const storeActions = [];
    for (const store of storeBreakdown) {
      const listingRemaining = Math.max((store.kpis.listing.target ?? 0) - store.kpis.listing.actual, 0);
      if (store.targetStatus === 'missing' || store.targetStatus === 'partial') {
        storeActions.push({
          priority: '高',
          title: `${store.storeName} KPI目标未配置完整，请先补齐目标`,
          kpi: '目标配置',
          impact: '目标缺失会影响综合KPI判定和工资核算公平性',
          actionLabel: '查看店铺',
          actionHref: '#store-breakdown',
          secondaryActionLabel: '配置KPI目标',
          secondaryActionHref: '#kpi-target-ledger',
          storeId: store.storeId,
        });
        continue;
      }
      if (store.listingCompletionRate !== null && store.listingCompletionRate < Math.max(range.timeProgress - 0.2, 0) && listingRemaining > 0) {
        storeActions.push({
          priority: '高',
          title: `${store.storeName}上新进度落后${listingRemaining}款，优先补齐可快速上线商品信息`,
          kpi: '上新效率',
          impact: '拖累上新效率KPI',
          actionLabel: '查看店铺',
          actionHref: '#store-breakdown',
          secondaryActionLabel: '去导入商品信息',
          secondaryActionHref: '/admin/temu-product-info-import',
          storeId: store.storeId,
        });
        continue;
      }
      if (store.kpis.firstOrder.expiredNoFirstOrder > 0) {
        storeActions.push({
          priority: '中',
          title: `${store.storeName}有${store.kpis.firstOrder.expiredNoFirstOrder}款观察期到期商品仍未首单，优先优化主图、标题和价格`,
          kpi: '新品转化',
          impact: '拖累新品转化KPI',
          actionLabel: '查看店铺',
          actionHref: '#store-breakdown',
          secondaryActionLabel: '查看未首单商品',
          secondaryActionHref: '#product-follow-ups',
          storeId: store.storeId,
        });
        continue;
      }
      if (store.expenseRatio !== null && store.expenseTargetRatio !== null && store.expenseRatio > store.expenseTargetRatio) {
        const expenseGap = ((store.expenseRatio - store.expenseTargetRatio) * 100).toFixed(1);
        storeActions.push({
          priority: '中',
          title: `${store.storeName}费用占比高于目标${expenseGap}个百分点，请查看费用来源`,
          kpi: '费用控制',
          impact: '拖累费用控制KPI',
          actionLabel: '查看店铺',
          actionHref: '#store-breakdown',
          secondaryActionLabel: '查看费用明细',
          secondaryActionHref: '/admin/operator-analysis',
          storeId: store.storeId,
        });
      }
    }
    if (storeActions.length > 0) {
      todayActions = storeActions.slice(0, 5);
    }
  }
  logWorkbenchKpiTiming('todayActions', sectionStartedAt, timings);
  timings.total = Date.now() - totalStartedAt;
  console.info(`[workbench-kpi] total ${timings.total}ms`);

  return {
    filters: {
      period: range.period,
      canManage: scope.canManage,
      operators: scope.canManage ? scope.operators : [],
      stores,
      storeOptions: scope.storeOptions ?? stores,
      operatorStoreMap: buildWorkbenchOperatorStoreMap(scope),
      selectedOperatorId: scope.operatorId,
      selectedStoreId: String(searchParams.get('storeId') ?? ''),
    },
    dataUpdatedAt,
    dataIntegrityStatus: warnings.length === 0 ? '数据完整' : '存在提醒',
    dataSourceMapping: [
      { kpi: '销售额目标完成率', source: '订单销售导入 + KPI目标配置', endpoint: '/api/persistent-data/orderImportStore, /api/operation-workbench/kpi-targets', confirmed: '已确认' },
      { kpi: '上新商品数', source: '商品信息导入表按创建时间统计', endpoint: '/api/data-import/temu-product-info', confirmed: newProductStatsError ? '读取失败' : '已确认' },
      { kpi: '新品30天首单率', source: '商品信息导入表 + 订单明细按商品/SKU最早订单日期统计', endpoint: '/api/data-import/temu-product-info, temu_order_items', confirmed: newProductStatsError ? '读取失败' : '已确认' },
      { kpi: '费用占比', source: '订单导入销售额 + 广告日报推广费 + 上月售后问题金额日均预估', endpoint: '/api/persistent-data/orderImportStore, /api/data-import/temu-ad-report, /api/salary/operator-analysis-store-financials', confirmed: hasExpenseData && !adSpendError ? '已确认' : '未找到可靠数据源' },
    ],
    kpiSummary: {
      totalScore,
      scoreText: totalScore === null ? '待配置' : `${totalScore.toFixed(1)} 分`,
      cards: [
        { key: 'sales', name: '本月销售额', weight: 30, targetValue: target?.salesTarget ?? null, currentValue: salesAmount, completionRate: completion.sales, score: salesScore, status: targetIncompleteStatus('salesTarget') || getKpiStatus(salesScore, 30, completion.sales ?? 0, range.timeProgress), unit: '¥' },
        { key: 'listing', name: '上新商品数', weight: 30, targetValue: target?.effectiveListingTarget ?? null, currentValue: listingProductCount, completionRate: completion.listing, score: listingScore, status: targetIncompleteStatus('effectiveListingTarget') || getKpiStatus(listingScore, 30, completion.listing ?? 0, range.timeProgress), unit: '款' },
        { key: 'firstOrder', name: '30天内首单成功数', weight: 20, targetValue: target?.firstOrderProductTarget ?? null, currentValue: firstOrderProductCount, completionRate: completion.firstOrder, score: firstOrderScore, status: targetIncompleteStatus('firstOrderProductTarget') || getKpiStatus(firstOrderScore, 20, completion.firstOrder ?? 0, range.timeProgress), unit: '款' },
        { key: 'expense', name: '费用占比', weight: 20, targetValue: target?.expenseRatioTarget ?? null, currentValue: expenseRatio, completionRate: expenseRatio, score: expenseScore, status: targetIncompleteStatus('expenseRatioTarget') || getKpiStatus(expenseScore, 20, expenseRatio, range.timeProgress, true), unit: '%' },
      ],
    },
    storeBreakdown: scope.selectedStoreId || storeBreakdown.length <= 1 ? [] : storeBreakdown,
    todayActions,
    salesKpi: {
      currentValue: salesProgressMetric.currentValue,
      targetValue: salesProgressMetric.targetValue,
      score: salesScore,
      expectedByTime: salesProgressMetric.expectedByTime,
      progressGapValue: salesProgressMetric.progressGapValue,
      remainingToTarget: salesProgressMetric.remainingToTarget,
      exceededTarget: salesProgressMetric.exceededTarget,
      salesTarget: target?.salesTarget ?? null,
      salesAmount,
      completionRate: completion.sales,
      timeProgress: range.timeProgress,
      progressGap: completion.sales === null ? null : completion.sales - range.timeProgress,
      remainingSales: target?.salesTarget ? Math.max(target.salesTarget - salesAmount, 0) : null,
      requiredDailySales: target?.salesTarget ? Math.max(target.salesTarget - salesAmount, 0) / range.remainingDays : null,
      orderCount,
      quantity,
      storeBreakdown: Array.from(storeSalesMap.values()).map((item) => ({ ...item, salesAmount: Number(item.salesAmount.toFixed(2)) })).sort((first, second) => second.salesAmount - first.salesAmount),
    },
    listingKpi: {
      currentValue: listingProgressMetric.currentValue,
      targetValue: listingProgressMetric.targetValue,
      score: listingScore,
      timeProgress: range.timeProgress,
      expectedByTime: listingProgressMetric.expectedByTime,
      progressGapValue: listingProgressMetric.progressGapValue,
      remainingToTarget: listingProgressMetric.remainingToTarget,
      exceededTarget: listingProgressMetric.exceededTarget,
      last7DaysCompleted: last7DaysListingCount,
      target: target?.effectiveListingTarget ?? null,
      completed: listingProductCount,
      todayCompleted: todayListingCount,
      remaining: target?.effectiveListingTarget ? Math.max(target.effectiveListingTarget - listingProductCount, 0) : null,
      todaySuggested: todaySuggestedListing,
      completionRate: completion.listing,
    },
    firstOrderKpi: {
      currentValue: firstOrderProductCount,
      targetValue: target?.firstOrderProductTarget ?? null,
      targetCompletionRate: completion.firstOrder,
      score: firstOrderScore,
      observationDueCount: newProductFirstOrderStats.decidableCount,
      dueProductFirstOrderRate: newProductFirstOrderStats.firstOrderRate,
      remainingToTarget: target?.firstOrderProductTarget ? Math.max(target.firstOrderProductTarget - firstOrderProductCount, 0) : null,
      dueIn7DaysCount,
      target: target?.firstOrderProductTarget ?? null,
      completed: firstOrderProductCount,
      completionRate: completion.firstOrder,
      effectiveListingCount: listingProductCount,
      firstOrderWithin30DaysCount: firstOrderProductCount,
      expiredNoFirstOrderCount: newProductFirstOrderStats.expiredNoFirstOrderCount,
      delayedFirstOrderCount: newProductFirstOrderStats.delayedFirstOrderCount ?? 0,
      observingCount: totalObservingCount,
      decidableCount: newProductFirstOrderStats.decidableCount,
      firstOrderRate: newProductFirstOrderStats.firstOrderRate,
      over7NoFirstOrder,
    },
    expenseKpi: {
      currentExpenseRatio: expenseRatio,
      targetExpenseRatio: target?.expenseRatioTarget ?? null,
      score: expenseScore,
      promotionExpense: adExpenseAmount,
      promotionExpenseRatio: adRatio,
      afterSalesAccrual: estimatedAfterSaleAmount,
      afterSalesAccrualRatio: afterSaleRatio,
      accrualBasisLabel: previousFinancePeriod ? `按${previousFinancePeriod}售后费用` : '按上月售后费用',
      gapToTarget: expenseGapToTarget,
      mainExpenseSource,
      salesAmount: expenseSalesBase,
      adExpense: adExpenseAmount,
      afterSaleExpense: estimatedAfterSaleAmount,
      afterSaleExpensePeriod: previousFinancePeriod,
      totalExpense: totalExpenseAmount,
      expenseRatio,
      adRatio,
      afterSaleRatio,
      targetRatio: target?.expenseRatioTarget ?? null,
      overTargetRatio: expenseRatio !== null && target?.expenseRatioTarget ? expenseRatio - target.expenseRatioTarget : null,
      storeBreakdown: previousFinanceRecords,
      hasExpenseData,
    },
    productFollowUps,
    dataIntegrityWarnings: warnings,
    debug: {
      timings,
      totalMs: timings.total,
      durationMs: timings.total,
      cacheHit: false,
      generatedAt: new Date().toISOString(),
      resolvedStoreCount: stores.length,
      resolvedStoreIds,
      resolvedStores: resolvedStoreLabels,
      scopeMode,
    },
  };
}

async function handleOperationWorkbenchKpiTargetsApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!requireMenu(req, res, menuKeys.dashboard)) return;

  const currentUser = toCurrentUser(findCurrentUser(req));

  if (req.method === 'GET') {
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const targets = await readWorkbenchKpiTargets();
    const scopedTargets = filterWorkbenchKpiTargetsForScope(targets, currentUser, requestUrl.searchParams);
    res.end(JSON.stringify({ records: sanitizeSensitiveFields(scopedTargets, currentUser) }));
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (String(currentUser?.role ?? '').toLowerCase() === 'operator') {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, message: '普通运营只能查看 KPI 目标，不能编辑' }));
      return;
    }

    if (!requireOperation(res, currentUser, 'edit', '当前账号无权配置 KPI 目标')) {
      return;
    }

    try {
      const payload = JSON.parse((await readBody(req)) || '{}');
      const existingTargets = await readWorkbenchKpiTargets();
      const current = existingTargets.find((item) => String(item?.id ?? '') === String(payload?.id ?? ''));
      const next = normalizeWorkbenchTarget(payload, current);
      const record = await upsertWorkbenchKpiTargetToPostgres(next);
      clearOperationWorkbenchDashboardCache();
      res.end(JSON.stringify({ ok: true, record }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  res.statusCode = 405;
  res.end('Method not allowed');
}

async function handleOperationWorkbenchKpiDashboardApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  if (!requireMenu(req, res, menuKeys.dashboard)) return;

  try {
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const currentUser = toCurrentUser(findCurrentUser(req));
    res.end(JSON.stringify(await buildOperationWorkbenchDashboard(requestUrl.searchParams, currentUser)));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}

function getCollectionMenuKey(name) {
  if (name === 'stores') {
    return menuKeys.storeManagement;
  }

  if (name === 'operators' || name === 'storeOperatorRelations') {
    return menuKeys.operatorManagement;
  }

  if (name === 'tasks') {
    return menuKeys.operationTasks;
  }

  if (String(name).startsWith('salary') || name === 'employeeSalaryPlans') {
    return menuKeys.salaryPerformance;
  }

  return '';
}

function getPersistentMenuKey(name) {
  if (String(name).startsWith('salary') || name === 'employeeSalaryPlans') {
    return menuKeys.salaryPerformance;
  }

  return '';
}

async function handleVisibleStoresApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  try {
    const currentUser = readCurrentUser(req);
    const stores = await attachTemuStoreDatabaseIds(getVisibleStores(currentUser));
    const storeIds = unique(stores.flatMap((store) => [store.id, store.storeName].filter(Boolean)));
    const role = String(currentUser?.role ?? '').toLowerCase();
    const message = role !== 'admin' && storeIds.length === 0 ? '当前用户暂未绑定可见店铺' : undefined;

    res.end(JSON.stringify({ success: true, storeIds, stores, message }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      success: false,
      storeIds: [],
      stores: [],
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

function getAiRuntimeStatus() {
  const provider = process.env.AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY ? 'openai' : 'mock';

  return {
    provider,
    configuredProvider: process.env.AI_PROVIDER || 'mock',
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

function logAiProxyEvent(event, details = {}) {
  console.log('[ai-proxy]', JSON.stringify({
    event,
    provider: getAiRuntimeStatus().provider,
    ...details,
  }));
}

function buildMockAiAdviceResponse(request, reason = 'mock fallback') {
  const context = request.context ?? {};
  const summary = context.anomalySummary ?? {};
  const formalCount = (summary.criticalCount ?? 0) + (summary.warningCount ?? 0);
  const storeNames = unique((context.storeSnapshots ?? []).map((snapshot) => snapshot.storeName));
  const metricNames = unique((context.anomalies ?? []).map((anomaly) => anomaly.metricName));
  const dataQualityNotes = context.dataQualityNotes ?? [];
  const keyReasons = (context.possibleReasons ?? []).slice(0, 5);
  const recommendedActions = (context.recommendedActions ?? []).slice(0, 5);
  const riskNotes = [...dataQualityNotes, `服务端使用 mock：${reason}`];

  return {
    requestId: `server-mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'mock-gpt',
    model: 'mock-operation-advice-v1',
    generatedAt: new Date().toISOString(),
    summary: dataQualityNotes.length > 0
      ? 'Mock GPT 判断：当前先以数据质量校验和口径补齐为第一优先级，再推进异常归因。'
      : 'Mock GPT 判断：当前建议按核心指标和高影响店铺优先处理。',
    problemOverview: [
      `当前识别到 ${summary.total ?? 0} 个异常/观察项，其中正式异常 ${formalCount} 个，观察项 ${summary.watchCount ?? 0} 个。`,
      `涉及店铺：${storeNames.slice(0, 5).join('、') || context.storeName || '未识别店铺'}。`,
      `主要指标：${metricNames.slice(0, 6).join('、') || '暂无明确指标'}。`,
    ],
    keyReasons,
    recommendedActions,
    bossAttentionAdvice: formalCount > 0 ? '建议同步老板当前正式异常数量、影响店铺和处理责任人。' : '暂不需要老板介入，运营侧先完成自查。',
    taskCreationAdvice: formalCount > 0 ? '建议为正式异常生成任务并跟进闭环。' : '暂不建议批量生成任务。',
    riskNotes: riskNotes.length > 0 ? riskNotes : ['暂无额外风险提示。'],
    rawText: [
      '1. 问题概况',
      `- 当前共发现 ${summary.total ?? 0} 个异常/观察项`,
      `- 其中观察项 ${summary.watchCount ?? 0} 个，正式异常 ${formalCount} 个`,
      '',
      '2. 建议动作',
      ...(recommendedActions.length > 0 ? recommendedActions.map((action) => `- ${action.actionName}`) : ['- 暂无推荐动作']),
    ].join('\n'),
  };
}

function buildAiSuggestionPrompt(request) {
  return [
    '你是 TEMU 运营数据诊断助手。请基于用户提供的 AiAdviceRequest JSON 输出运营建议。',
    '必须只返回 JSON，不要返回 Markdown。',
    'JSON 字段必须包含：summary, problemOverview, keyReasons, recommendedActions, bossAttentionAdvice, taskCreationAdvice, riskNotes, rawText。',
    'keyReasons 使用输入 context.possibleReasons 中的对象结构，recommendedActions 使用输入 context.recommendedActions 中的对象结构。',
    'problemOverview 和 riskNotes 必须是字符串数组。',
    'rawText 是可复制给老板/运营的中文建议文本。',
    '',
    JSON.stringify(request),
  ].join('\n');
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function normalizeAiAdviceResponse(value, request, model) {
  const parsed = typeof value === 'string' ? parseJsonObject(value) : value;

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.problemOverview) ||
    !Array.isArray(parsed.keyReasons) ||
    !Array.isArray(parsed.recommendedActions) ||
    typeof parsed.bossAttentionAdvice !== 'string' ||
    typeof parsed.taskCreationAdvice !== 'string' ||
    !Array.isArray(parsed.riskNotes) ||
    typeof parsed.rawText !== 'string'
  ) {
    return null;
  }

  return {
    requestId: `openai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'openai-gpt',
    model,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
    problemOverview: parsed.problemOverview.filter((item) => typeof item === 'string'),
    keyReasons: parsed.keyReasons,
    recommendedActions: parsed.recommendedActions,
    bossAttentionAdvice: parsed.bossAttentionAdvice,
    taskCreationAdvice: parsed.taskCreationAdvice,
    riskNotes: parsed.riskNotes.filter((item) => typeof item === 'string'),
    rawText: parsed.rawText,
  };
}

async function requestOpenAiAdvice(request, prompt) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你只返回 JSON。' },
        { role: 'user', content: prompt || buildAiSuggestionPrompt(request) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const normalized = normalizeAiAdviceResponse(content, request, model);

  if (!normalized) {
    throw new Error('OpenAI response parse failed');
  }

  return normalized;
}

function localDataPlugin() {
  const uploadRoot = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'public/uploads'));
  const alibaba1688UploadRoot = path.resolve(process.env.UPLOADS_1688_DIR || path.join(uploadRoot, 'alibaba-1688'));
  const uploadContentTypes = {
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  function isPathInside(root, filePath) {
    return filePath === root || filePath.startsWith(`${root}${path.sep}`);
  }

  function resolveUploadedFilePath(relativePath) {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts[0] === 'alibaba-1688') {
      const filePath = path.resolve(alibaba1688UploadRoot, ...parts.slice(1));
      return isPathInside(alibaba1688UploadRoot, filePath) ? filePath : '';
    }

    const filePath = path.resolve(uploadRoot, ...parts);
    return isPathInside(uploadRoot, filePath) ? filePath : '';
  }

  function serveUploadedFile(req, res, next) {
    const requestUrl = new URL(req.url ?? '/', 'http://local');
    const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''));
    const filePath = resolveUploadedFilePath(relativePath);

    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next();
      return;
    }

    res.setHeader('Content-Type', uploadContentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(filePath).pipe(res);
  }

  const plugin = {
    name: 'local-data-storage',
    configureServer(server) {
      server.middlewares.use('/uploads', serveUploadedFile);

      server.middlewares.use('/api/data-path', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const user = findCurrentUser(_req);
        if (!user) {
          res.statusCode = 403;
          res.end(JSON.stringify({ success: false, message: '鏃犳潈璁块棶' }));
          return;
        }

        if (!userCanAccessMenu(user, menuKeys.dataSource)) {
          res.end(JSON.stringify({ path: '' }));
          return;
        }

        res.end(JSON.stringify({ path: dataDir }));
      });

      server.middlewares.use('/api/data-source/status', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        const user = findCurrentUser(req);
        if (!user) {
          res.statusCode = 403;
          res.end(JSON.stringify({ success: false, message: '无权访问' }));
          return;
        }

        res.end(JSON.stringify(getDataSourceRuntimeStatus()));
      });

      server.middlewares.use('/api/auth', (req, res, next) => {
        handleAuthApi(req, res, next);
      });

      server.middlewares.use('/api/data-backup', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        try {
          if (!requireMenu(_req, res, menuKeys.dataCenter)) {
            return;
          }

          if (_req.method === 'GET') {
            res.end(JSON.stringify({ ok: true, backups: listBackups() }));
            return;
          }

          if (_req.method === 'POST') {
            res.end(JSON.stringify({ ok: true, ...backupDataFiles() }));
            return;
          }

          if (_req.method === 'DELETE') {
            if (!requireAdmin(_req, res)) {
              return;
            }
            const name = decodeURIComponent((_req.url ?? '').replace(/^\/+/, ''));
            res.end(JSON.stringify({ ok: true, ...deleteBackup(name) }));
            return;
          }

          res.statusCode = 405;
          res.end('Method not allowed');
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });

      server.middlewares.use('/api/ai/status', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        res.end(JSON.stringify(getAiRuntimeStatus()));
      });

      server.middlewares.use('/api/ai/operation-advice', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const payload = JSON.parse(await readBody(req) || '{}');
          const request = payload.request ?? payload;
          const prompt = payload.prompt;
          const canUseOpenAi = process.env.AI_PROVIDER === 'openai' && Boolean(process.env.OPENAI_API_KEY);

          if (!canUseOpenAi) {
            const fallback = buildMockAiAdviceResponse(request, 'AI_PROVIDER 不是 openai 或缺少 OPENAI_API_KEY');
            logAiProxyEvent('fallback', { requestId: fallback.requestId, reason: 'not_configured' });
            res.end(JSON.stringify(fallback));
            return;
          }

          try {
            const response = await requestOpenAiAdvice(request, prompt);
            logAiProxyEvent('openai_success', { requestId: response.requestId, model: response.model });
            res.end(JSON.stringify(response));
          } catch (error) {
            const fallback = buildMockAiAdviceResponse(
              request,
              error instanceof Error ? error.message : String(error),
            );
            logAiProxyEvent('fallback', {
              requestId: fallback.requestId,
              reason: error instanceof Error ? error.message : String(error),
            });
            res.end(JSON.stringify(fallback));
          }
        } catch (error) {
          res.statusCode = 500;
          logAiProxyEvent('bad_request', {
            reason: error instanceof Error ? error.message : String(error),
          });
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });

      server.middlewares.use('/api/auth/visible-stores', handleVisibleStoresApi);
      server.middlewares.use('/api/dashboard/bigscreen-summary', handleCompanyDashboardApi);
      server.middlewares.use('/api/dashboard/company', handleCompanyDashboardApi);
      server.middlewares.use('/api/operation-workbench/kpi-dashboard', handleOperationWorkbenchKpiDashboardApi);
      server.middlewares.use('/api/operation-workbench/kpi-targets', handleOperationWorkbenchKpiTargetsApi);
      server.middlewares.use('/api/alibaba-1688', (req, res) => handleAlibaba1688Api(req, res, {
        getCurrentUser: () => toCurrentUser(findCurrentUser(req)),
        readBody,
        requireOperation,
        syncStore: syncCommonStoreFromAlibabaStore,
      }));
      server.middlewares.use('/api/1688', (req, res) => handleAlibaba1688Api(req, res, {
        getCurrentUser: () => toCurrentUser(findCurrentUser(req)),
        readBody,
        requireOperation,
        syncStore: syncCommonStoreFromAlibabaStore,
      }));
      server.middlewares.use('/api/stores', (req, res) => handleCollectionApi(req, res, 'stores', 'store'));
      server.middlewares.use('/api/operators', (req, res) => handleCollectionApi(req, res, 'operators', 'operator'));
      server.middlewares.use('/api/tasks', (req, res) => handleCollectionApi(req, res, 'tasks', 'task'));
      server.middlewares.use('/api/task-suggestion-templates', (req, res) => (
        handleCollectionApi(req, res, 'taskSuggestionTemplates', 'suggestion')
      ));
      server.middlewares.use('/api/store-operator-relations', (req, res) => (
        handleCollectionApi(req, res, 'storeOperatorRelations', 'relation')
      ));
      server.middlewares.use('/api/effective-new-listings', handleEffectiveNewListingsApi);
      server.middlewares.use('/api/data-import/temu-storage-status', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(await getTemuStorageStatus()));
      });
      server.middlewares.use('/api/data-import/temu-product-info', handleTemuProductInfoImportApi);
      server.middlewares.use('/api/data-import/temu-ad-report', handleTemuAdReportImportApi);
      server.middlewares.use('/api/new-product-center', handleNewProductCenterApi);
      server.middlewares.use('/api/salary/financial-imports', handleSalaryFinancialImportsApi);
      server.middlewares.use('/api/salary/financial-summaries', handleSalaryFinancialSummariesApi);
      server.middlewares.use('/api/salary/operator-analysis-store-financials', handleOperatorAnalysisStoreFinancialsApi);
      server.middlewares.use('/api/salary/operator-salary-statistics', handleOperatorSalaryStatisticsApi);
      server.middlewares.use('/api/salary/employees', (req, res) => (
        handleCollectionApi(req, res, 'salaryEmployees', 'employee')
      ));
      server.middlewares.use('/api/salary/periods', (req, res) => (
        handleCollectionApi(req, res, 'salaryPeriods', 'period')
      ));
      server.middlewares.use('/api/salary/attendance-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryAttendanceRecords', 'attendance')
      ));
      server.middlewares.use('/api/salary/attendance-rules', (req, res) => (
        handleCollectionApi(req, res, 'salaryAttendanceRules', 'attendance-rule')
      ));
      server.middlewares.use('/api/salary/employee-type-rules', (req, res) => (
        handleCollectionApi(req, res, 'salaryEmployeeTypeRules', 'employee-type-rule')
      ));
      server.middlewares.use('/api/salary/piecework-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryPieceworkRecords', 'piecework')
      ));
      server.middlewares.use('/api/salary-plans', (req, res) => (
        handleCollectionApi(req, res, 'salaryPlans', 'salary-plan')
      ));
      server.middlewares.use('/api/salary-items', (req, res) => (
        handleCollectionApi(req, res, 'salaryItems', 'salary-item')
      ));
      server.middlewares.use('/api/employee-salary-plans', (req, res) => (
        handleCollectionApi(req, res, 'employeeSalaryPlans', 'employee-salary-plan')
      ));
      server.middlewares.use('/api/salary-records', (req, res) => (
        handleCollectionApi(req, res, 'salaryRecords', 'salary-record')
      ));

      server.middlewares.use('/api/persistent-data/', async (req, res) => {
        const requestUrl = new URL(req.url ?? '/', 'http://local');
        const name = requestUrl.pathname.replace(/^\/+/, '');

        if (!name || !(name in dataFiles)) {
          res.statusCode = 404;
          res.setHeader('Cache-Control', 'no-store');
          res.end('Not found');
          return;
        }

        const filePath = ensureDataFile(name);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');

        const menuKey = getPersistentMenuKey(name);
        const companyDashboardRead = isCompanyDashboardRead(req);
        if (!companyDashboardRead && menuKey && !requireMenu(req, res, menuKey)) {
          return;
        }

        if (req.method === 'GET') {
          try {
            const currentUser = toCurrentUser(findCurrentUser(req));
            const cacheKey = getPersistentResponseCacheKey(name, requestUrl.searchParams, currentUser, companyDashboardRead);
            const cachedResponse = readPersistentResponseCache(cacheKey);
            if (cachedResponse !== undefined) {
              res.end(JSON.stringify(cachedResponse));
              return;
            }
            const data = await readPersistentDataForApi(name, filePath);
            const scopedData = companyDashboardRead ? data : filterPersistentDataForUser(name, data, currentUser);
            const responsePayload = name === 'orderImportStore'
              ? filterOrderImportStoreByQuery(scopedData, requestUrl.searchParams, currentUser)
              : name === 'trafficConversionStore'
                ? filterTrafficConversionStoreByQuery(scopedData, requestUrl.searchParams, currentUser)
                : scopedData;
            writePersistentResponseCache(cacheKey, responsePayload);
            res.end(JSON.stringify(responsePayload));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({
              success: false,
              message: `读取失败：${error instanceof Error ? error.message : String(error)}`,
            }));
          }
          return;
        }

        if (req.method === 'PUT') {
          try {
            const currentUser = toCurrentUser(findCurrentUser(req));
            if (!requireOperation(res, currentUser, 'edit', '当前账号无权修改数据')) {
              return;
            }
            const bodyText = await readBody(req);
            const rawParsed = JSON.parse(bodyText || 'null');
            const hasGuardPayload = rawParsed && typeof rawParsed === 'object' && Object.prototype.hasOwnProperty.call(rawParsed, '__payload');
            const parsed = hasGuardPayload ? rawParsed.__payload : rawParsed;
            if (hasGuardPayload && rawParsed.__deleteImportData && ['orderImportStore', 'trafficConversionStore'].includes(name) && !requireAdmin(req, res)) {
              return;
            }
            const searchableText = hasGuardPayload
              ? rawParsed.__trafficImportSearchableText ?? rawParsed.__trafficImportSearchText ?? ''
              : '';
            const isOrderImportDelete = hasGuardPayload && rawParsed.__deleteImportData && name === 'orderImportStore';
            const isTrafficImportDelete = hasGuardPayload && rawParsed.__deleteImportData && name === 'trafficConversionStore';
            const isTrafficImportAppend = hasGuardPayload && rawParsed.__appendImportBatch && name === 'trafficConversionStore';
            const isAttendanceMerge = name === 'salaryAttendanceRecords' && requestUrl.searchParams.get('mode') === 'merge';
            if (!isOrderImportDelete && !isTrafficImportDelete) {
              assertCanWriteImportData(name, parsed, currentUser, searchableText);
            }
            if (name === 'orderImportStore') {
              const currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              const deleteBefore = isOrderImportDelete ? summarizeOrderImportStore(currentData) : null;
              const nextData = isOrderImportDelete ? parsed : mergeOrderImportAppendWithExisting(currentData, parsed);
              const deleteAfter = isOrderImportDelete ? summarizeOrderImportStore(nextData) : null;
              fs.writeFileSync(filePath, JSON.stringify(nextData, null, 2), 'utf-8');
              jsonReadCache.delete(name);
              persistentResponseCache.clear();
              clearDashboardSummaryCache();
              clearOperationWorkbenchDashboardCache();
              const deleteSummary = isOrderImportDelete && deleteBefore && deleteAfter
                ? {
                  user: currentUser?.username ?? currentUser?.userId ?? '',
                  isAdmin: String(currentUser?.role ?? '').toLowerCase() === 'admin',
                  payload: deleteAfter.batches,
                  beforeRecordCount: deleteBefore.recordCount,
                  beforeOrderCount: deleteBefore.orderCount,
                  removedRecordCount: Math.max(deleteBefore.recordCount - deleteAfter.recordCount, 0),
                  removedOrderCount: Math.max(deleteBefore.orderCount - deleteAfter.orderCount, 0),
                  afterRecordCount: deleteAfter.recordCount,
                  afterOrderCount: deleteAfter.orderCount,
                  storage: 'json',
                }
                : null;
              if (deleteSummary) {
                console.log('[order-import-delete:json]', deleteSummary);
              }
              let mirrorWarning = null;
              try {
                await mirrorPersistentTemuDataToPostgres(name, nextData);
              } catch (mirrorError) {
                mirrorWarning = `已保存到 JSON，PostgreSQL 同步失败：${mirrorError instanceof Error ? mirrorError.message : String(mirrorError)}`;
                console.warn('[TEMU PostgreSQL] orderImportStore mirror skipped after JSON save:', mirrorError instanceof Error ? mirrorError.message : mirrorError);
              }
              res.end(JSON.stringify({
                ok: true,
                success: true,
                storage: 'json',
                warning: mirrorWarning,
                deleteSummary,
                savedCount: Array.isArray(parsed) ? parsed.length : undefined,
                totalCount: Array.isArray(nextData) ? nextData.length : undefined,
              }));
              return;
            }

            if (name === 'trafficConversionStore') {
              const currentData = readJsonFile('trafficConversionStore');
              let trafficAppendBatch = null;
              let trafficDeleteSummary = null;
              const trafficAppendResult = isTrafficImportAppend ? mergeTrafficConversionAppendWithExisting(currentData, parsed, filePath) : null;
              const trafficDeleteResult = isTrafficImportDelete ? deleteTrafficConversionBatchFromStore(currentData, parsed, filePath) : null;
              const nextData = isTrafficImportDelete
                ? (trafficDeleteSummary = trafficDeleteResult?.summary ?? null, trafficDeleteResult?.data)
                : isTrafficImportAppend
                  ? (trafficAppendBatch = trafficAppendResult?.batch ?? null, trafficAppendResult?.data)
                  : mergeTrafficConversionImportWithExisting(currentData, parsed);
              fs.writeFileSync(filePath, JSON.stringify(nextData, null, 2), 'utf-8');
              jsonReadCache.delete(name);
              persistentResponseCache.clear();
              clearDashboardSummaryCache();
              let mirrorWarning = null;
              try {
                await replaceTrafficStoreInPostgres(nextData);
              } catch (mirrorError) {
                const mirrorMessage = mirrorError instanceof Error ? mirrorError.message : String(mirrorError);
                mirrorWarning = `已保存到 JSON，PostgreSQL 同步失败：${mirrorMessage}`;
                console.warn('[TEMU PostgreSQL] trafficConversionStore mirror skipped after JSON save:', mirrorMessage);
              }
              res.end(JSON.stringify({
                ok: true,
                success: true,
                storage: mirrorWarning ? 'json' : 'postgres',
                warning: mirrorWarning,
                trafficDeleteSummary,
                batch: trafficAppendBatch,
                savedCount: Array.isArray(parsed) ? parsed.length : undefined,
                totalCount: Array.isArray(nextData) ? nextData.length : undefined,
              }));
              return;
            }
            const deleteBefore = isOrderImportDelete ? summarizeOrderImportStore(JSON.parse(fs.readFileSync(filePath, 'utf-8'))) : null;
            let trafficAppendBatch = null;
            let trafficDeleteSummary = null;
            const trafficAppendResult = isTrafficImportAppend ? mergeTrafficConversionAppend(parsed, filePath) : null;
            const trafficDeleteResult = isTrafficImportDelete ? deleteTrafficConversionBatch(parsed, filePath) : null;
            const nextData = isOrderImportDelete
              ? parsed
              : isTrafficImportDelete
                ? (trafficDeleteSummary = trafficDeleteResult?.summary ?? null, trafficDeleteResult?.data)
                : isTrafficImportAppend
                  ? (trafficAppendBatch = trafficAppendResult?.batch ?? null, trafficAppendResult?.data)
                  : isAttendanceMerge
                    ? mergeAttendanceRecords(JSON.parse(fs.readFileSync(filePath, 'utf-8')), parsed)
                    : name === 'orderImportStore'
                      ? mergeOrderImportAppend(parsed)
                      : mergeVisibleImportData(name, parsed, currentUser);
            const deleteAfter = isOrderImportDelete ? summarizeOrderImportStore(nextData) : null;
            const previousFileText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
            fs.writeFileSync(filePath, JSON.stringify(nextData, null, 2), 'utf-8');
            jsonReadCache.delete(name);
            persistentResponseCache.clear();
            clearDashboardSummaryCache();
            if (name === 'orderImportStore') {
              clearOperationWorkbenchDashboardCache();
            }
            const deleteSummary = isOrderImportDelete && deleteBefore && deleteAfter
              ? {
                user: currentUser?.username ?? currentUser?.userId ?? '',
                isAdmin: String(currentUser?.role ?? '').toLowerCase() === 'admin',
                payload: deleteAfter.batches,
                beforeRecordCount: deleteBefore.recordCount,
                beforeOrderCount: deleteBefore.orderCount,
                removedRecordCount: Math.max(deleteBefore.recordCount - deleteAfter.recordCount, 0),
                removedOrderCount: Math.max(deleteBefore.orderCount - deleteAfter.orderCount, 0),
                afterRecordCount: deleteAfter.recordCount,
                afterOrderCount: deleteAfter.orderCount,
                filePath,
              }
              : null;
            if (deleteSummary) {
              console.log('[order-import-delete]', deleteSummary);
            }
            let mirrorWarning = null;
            try {
              await mirrorPersistentTemuDataToPostgres(name, nextData);
            } catch (mirrorError) {
              const mirrorMessage = mirrorError instanceof Error ? mirrorError.message : String(mirrorError);
              if (['orderImportStore', 'trafficConversionStore'].includes(name)) {
                mirrorWarning = `已保存到 JSON，PostgreSQL 同步失败：${mirrorMessage}`;
                console.warn(`[TEMU PostgreSQL] ${name} mirror skipped after JSON save:`, mirrorMessage);
              } else {
                if (previousFileText !== null) {
                  fs.writeFileSync(filePath, previousFileText, 'utf-8');
                }
                throw mirrorError;
              }
            }
            res.end(JSON.stringify({ ok: true, success: true, path: filePath, warning: mirrorWarning, deleteSummary, trafficDeleteSummary, batch: trafficAppendBatch, savedCount: Array.isArray(parsed) ? parsed.length : undefined, totalCount: Array.isArray(nextData) ? nextData.length : undefined }));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (name === 'trafficConversionStore') {
              console.error('[Traffic Import Save Error]', error);
            }
            res.statusCode = message === '当前账号无权导入该店铺数据' || message.startsWith('导入失败：') || message.startsWith('当前账号未配置可导入店铺') ? 403 : 500;
            res.end(JSON.stringify({ ok: false, success: false, message }));
          }
          return;
        }

        res.statusCode = 405;
        res.setHeader('Cache-Control', 'no-store');
        res.end('Method not allowed');
      });
    },
    configurePreviewServer(server) {
      plugin.configureServer(server);
    },
  };

  return plugin;
}

export default defineConfig({
  plugins: [react(), localDataPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts')) {
            return 'echarts-dashboard';
          }
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
