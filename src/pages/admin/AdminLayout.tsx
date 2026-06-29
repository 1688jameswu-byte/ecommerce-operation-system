import { lazy, Suspense, useEffect, useState } from 'react';
import { adminRoutes, type AdminRoute } from './routes';
import { menuKeys } from './menuKeys';
import PlaceholderPage from './PlaceholderPage';
import { useVisibleStores } from '../../auth/useVisibleStores';
import { logoutCurrentUser } from '../../auth/currentUser';
import { getRoleLabel } from '../../auth/rolePermissions';
import type { CurrentUser, UserRole } from '../../types/auth';
import type { DashboardData } from '../../types/dashboard';
import type { SalesOrderRecord } from '../../types/fact';
import type { TemuOrderDetail, TemuOrderImportStore } from '../../types/order';
import type { OperationTaskPriority, OperationTaskRecord, OperationTaskStatus } from '../../types/task';
import type { TrafficWarningLevel, TrafficWarningResult, TrafficWarningType } from '../../types/traffic';
import './admin.css';

const ExcelImportPage = lazy(() => import('./data-import/ExcelImportPage'));
const DataBackupPage = lazy(() => import('./data-backup/DataBackupPage'));
const StoreManagementPage = lazy(() => import('./store-management/StoreManagementPage'));
const OperatorManagementPage = lazy(() => import('./operator-management/OperatorManagementPage'));
const TrafficImportPage = lazy(() => import('./traffic-import/TrafficImportPage'));
const TemuProductInfoImportPage = lazy(() => import('./new-product-center/TemuProductInfoImportPage'));
const TemuAdReportImportPage = lazy(() => import('./new-product-center/TemuAdReportImportPage'));
const NewProductCenterPage = lazy(() => import('./new-product-center/NewProductCenterPage'));
const WarningResultsPage = lazy(() => import('./warning-results/WarningResultsPage'));
const StoreBusinessCenterPage = lazy(() => import('./business-analysis/StoreBusinessCenterPage'));
const OperatorAnalysisCenterPage = lazy(() => import('./business-analysis/OperatorAnalysisCenterPage'));
const WarningRulesPage = lazy(() => import('./warning-rules/WarningRulesPage'));
const OperationDiagnosisPage = lazy(() => import('./operation-diagnosis/OperationDiagnosisPage'));
const TaskCenterPage = lazy(() => import('./task-center/TaskCenterPage'));
const TaskSuggestionsPage = lazy(() => import('./task-suggestions/TaskSuggestionsPage'));
const AIImagePromptCenterPage = lazy(() => import('./ai-image-prompts/AIImagePromptCenterPage'));
const Alibaba1688ProductsPage = lazy(() => import('./alibaba1688/Alibaba1688ProductsPage'));
const Alibaba1688ProductCreatePage = lazy(() => import('./alibaba1688/Alibaba1688ProductCreatePage'));
const Alibaba1688ListingTasksPage = lazy(() => import('./alibaba1688/Alibaba1688ListingTasksPage'));
const Alibaba1688ImagesPage = lazy(() => import('./alibaba1688/Alibaba1688ImagesPage'));
const Alibaba1688SuppliersPage = lazy(() => import('./alibaba1688/Alibaba1688SuppliersPage'));
const Alibaba1688SettingsPage = lazy(() => import('./alibaba1688/Alibaba1688SettingsPage'));
const SalaryEmployeesPage = lazy(() => import('./salary/SalaryEmployeesPage'));
const SalaryPeriodsPage = lazy(() => import('./salary/SalaryPeriodsPage'));
const SalaryImportTemplatesPage = lazy(() => import('./salary/SalaryImportTemplatesPage'));
const AttendanceImportPage = lazy(() => import('./salary/AttendanceImportPage'));
const PieceworkImportPage = lazy(() => import('./salary/PieceworkImportPage'));
const FinancialDetailImportPage = lazy(() => import('./salary/FinancialDetailImportPage'));
const OperatorSalaryStatisticsPage = lazy(() => import('./salary/OperatorSalaryStatisticsPage'));
const SalaryDetailsPage = lazy(() => import('./salary/SalaryDetailsPage'));
const SalaryPlanPage = lazy(() => import('./salary/SalaryPlanPage'));
const AccountManagementPage = lazy(() => import('./account-management/AccountManagementPage'));
const WorkbenchPage = lazy(() => import('./workbench/WorkbenchPage'));

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  leader: '组长',
  operator: '运营',
};

type DataSourceStatusItem = {
  name: string;
  readSource: string;
  writeSource: string;
  fallback: string;
  mode: string;
};

type DataSourceStatusGroup = {
  name: string;
  items: DataSourceStatusItem[];
};

type DataSourceRuntimeStatus = {
  generatedAt: string;
  environment: {
    temuReadSource: string;
    temuUsePostgresReads: string;
    postgresConfigured: boolean;
  };
  groups: DataSourceStatusGroup[];
};

function getActiveRoute() {
  const pathname = window.location.pathname;

  if (pathname === '/admin/1688-business') {
    return adminRoutes.find((route) => route.path === '/admin/1688-business/settings') ?? adminRoutes[0];
  }

  if (pathname.startsWith('/new-product-center/products/')) {
    return adminRoutes.find((route) => route.path === '/new-product-center/products/detail') ?? adminRoutes[0];
  }

  return adminRoutes.find((route) => route.path === pathname) ?? adminRoutes[0];
}

const dataCenterMenuSections = ['数据导入', '数据源'];

function DataCenterMenuLinks({
  routes,
  activeRoute,
  onNavigate,
}: {
  routes: AdminRoute[];
  activeRoute: AdminRoute;
  onNavigate: (route: AdminRoute) => void;
}) {
  const sectionRoutes = routes.filter((route) => route.menuSection);
  const standaloneRoutes = routes.filter((route) => !route.menuSection);

  return (
    <>
      {dataCenterMenuSections.map((section) => {
        const children = sectionRoutes.filter((route) => route.menuSection === section);
        if (children.length === 0) {
          return null;
        }

        return (
          <section key={section} className="admin-nav-subgroup">
            <span className="admin-nav-subgroup-title">{section}</span>
            {children.map((route) => (
              <a
                key={route.path}
                className={`admin-nav-sub-link ${route.path === activeRoute.path ? 'active' : ''}`}
                href={route.path}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(route);
                }}
              >
                {route.label}
              </a>
            ))}
          </section>
        );
      })}
      {standaloneRoutes.map((route) => (
        <a
          key={route.path}
          className={route.path === activeRoute.path ? 'active' : ''}
          href={route.path}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(route);
          }}
        >
          {route.label}
        </a>
      ))}
    </>
  );
}

const priorityLabels: Record<OperationTaskPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const statusLabels: Record<OperationTaskStatus, string> = {
  todo: '待处理',
  doing: '处理中',
  done: '已完成',
  closed: '已关闭',
};

const warningLevelLabels: Record<TrafficWarningLevel, string> = {
  warning: '预警',
  critical: '严重',
  insufficient: '数据不足',
};

const warningTypeLabels: Record<TrafficWarningType, string> = {
  traffic: '流量',
  conversion: '转化',
  deal: '成交',
};

async function fetchAdminJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function isOpenTask(task: OperationTaskRecord) {
  return task.status === 'todo' || task.status === 'doing';
}

function isOverdueTask(task: OperationTaskRecord, today: string) {
  return Boolean(task.dueDate && task.dueDate < today && task.status !== 'done' && task.status !== 'closed');
}

function sortTasks(first: OperationTaskRecord, second: OperationTaskRecord) {
  const priorityRank: Record<OperationTaskPriority, number> = { high: 0, medium: 1, low: 2 };
  return priorityRank[first.priority] - priorityRank[second.priority] || second.updatedAt.localeCompare(first.updatedAt);
}

function sortWarnings(first: TrafficWarningResult, second: TrafficWarningResult) {
  const levelRank: Record<TrafficWarningLevel, number> = { critical: 0, warning: 1, insufficient: 2 };
  return levelRank[first.level] - levelRank[second.level] || second.triggeredAt.localeCompare(first.triggeredAt);
}

function toRecentSalesOrder(order: TemuOrderDetail & { batchId?: string }): SalesOrderRecord {
  const date = String(order.orderDate || order.orderTime || '').slice(0, 10);
  return {
    date,
    month: order.month || date.slice(0, 7),
    year: Number(date.slice(0, 4)) || new Date().getFullYear(),
    week: '',
    platform: 'TEMU',
    storeId: order.storeName,
    storeName: order.storeName,
    operatorId: order.operatorName,
    operatorName: order.operatorName,
    orderId: order.orderId,
    sku: order.productSku || order.skuCode || order.skc,
    productName: order.productName,
    salesAmount: Number(order.salesAmount) || 0,
    orderAmount: Number(order.salesAmount) || 0,
    quantity: Number(order.quantity) || 0,
    isFirstOrder: Boolean(order.isFirstOrder),
    rawSource: order,
    sourceBatchId: order.batchId,
    sourceKey: order.uniqueKey,
  };
}

function getSourceTone(source: string) {
  const value = source.toLowerCase();
  if (value.includes('postgres') || value.includes('pg')) return 'pg';
  if (value.includes('json')) return 'json';
  return 'mixed';
}

function AdminHome({
  currentUser,
  visibleStoreIds,
  visibleStoreNames,
}: {
  currentUser: CurrentUser;
  visibleStoreIds: string[];
  visibleStoreNames: string[];
}) {
  const today = formatDateKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDateKey(yesterdayDate);
  const [salesOrders, setSalesOrders] = useState<SalesOrderRecord[]>([]);
  const [tasks, setTasks] = useState<OperationTaskRecord[]>([]);
  const [riskWarnings, setRiskWarnings] = useState<TrafficWarningResult[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const isAdmin = currentUser.role === 'admin';
  const visibleStoreSet = new Set(visibleStoreIds.filter(Boolean));
  const visibleStoreNameSet = new Set(visibleStoreNames.filter(Boolean));
  const isVisibleStore = (storeId?: string, storeName?: string) => (
    isAdmin ||
    visibleStoreSet.has(storeId || '') ||
    visibleStoreSet.has(storeName || '') ||
    visibleStoreNameSet.has(storeName || '')
  );
  const isCurrentUserTask = (task: OperationTaskRecord) => (
    currentUser.role !== 'operator' ||
    (!task.operatorId && !task.operatorName) ||
    task.operatorId === currentUser.operatorId ||
    task.operatorName === currentUser.displayName ||
    task.operatorName === currentUser.username
  );
  const scopedSalesOrders = salesOrders.filter((order) => isVisibleStore(order.storeId, order.storeName));
  const scopedTasks = tasks.filter((task) => isVisibleStore(task.storeId, task.storeName) && isCurrentUserTask(task));
  const scopedWarnings = riskWarnings.filter((warning) => isVisibleStore('', warning.storeName));
  const yesterdayOrders = scopedSalesOrders.filter((order) => order.date === yesterday);
  const openTasks = scopedTasks.filter(isOpenTask).sort(sortTasks);
  const overdueTasks = scopedTasks.filter((task) => isOverdueTask(task, today)).sort(sortTasks);
  const todayWarnings = scopedWarnings.filter((warning) => warning.date === today);
  const abnormalStoreCount = new Set(riskWarnings.map((warning) => warning.storeName).filter(Boolean)).size;
  const scopedAbnormalStoreCount = new Set(scopedWarnings.map((warning) => warning.storeName).filter(Boolean)).size;
  const yesterdaySales = yesterdayOrders.reduce((total, order) => total + (Number(order.salesAmount) || 0), 0);
  const dashboardSalesMetric = dashboardData?.metrics.find((metric) => metric.id === 'yesterdaySalesAmount');
  const dashboardOrderMetric = dashboardData?.metrics.find((metric) => metric.id === 'yesterdayOrderCount');
  const highPriorityTaskCount = openTasks.filter((task) => task.priority === 'high').length;
  const aiReminderItems = [
    ...scopedWarnings
      .filter((warning) => warning.level === 'critical' || warning.level === 'warning')
      .slice(0, 4)
      .map((warning) => `${warning.storeName}${warning.type === 'traffic' ? '访客下降' : warning.type === 'conversion' ? '转化率下降' : '成交下降'}，${warning.content || '请优先检查相关指标。'}`),
    ...(highPriorityTaskCount > 0 ? ['存在高优先级异常任务待处理。'] : []),
  ].filter((item, index, list) => item && list.indexOf(item) === index);
  const metrics = currentUser.role === 'operator'
    ? [
        { label: '我的待处理任务', value: openTasks.length.toLocaleString('zh-CN') },
        { label: '我的超期任务', value: overdueTasks.length.toLocaleString('zh-CN'), tone: 'danger' },
        { label: '我负责店铺数量', value: visibleStoreNames.length.toLocaleString('zh-CN') },
        { label: '我负责店铺昨日销售额', value: `¥${formatAmount(yesterdaySales)}` },
        { label: '我的异常店铺数', value: scopedAbnormalStoreCount.toLocaleString('zh-CN'), tone: 'warning' },
        { label: '我的AI建议数量', value: aiReminderItems.length.toLocaleString('zh-CN'), tone: 'warning' },
      ]
    : currentUser.role === 'leader'
      ? [
          { label: '组内待处理任务', value: openTasks.length.toLocaleString('zh-CN') },
          { label: '组内异常店铺', value: scopedAbnormalStoreCount.toLocaleString('zh-CN'), tone: 'warning' },
          { label: '组内超期任务', value: overdueTasks.length.toLocaleString('zh-CN'), tone: 'danger' },
          { label: '组内运营动态', value: (scopedWarnings.length + openTasks.length).toLocaleString('zh-CN') },
        ]
      : [
          { label: '昨日销售额', value: `¥${formatAmount(yesterdaySales)}` },
          { label: '昨日订单数', value: yesterdayOrders.length.toLocaleString('zh-CN') },
          { label: '待处理任务数', value: openTasks.length.toLocaleString('zh-CN') },
          { label: '已超期任务数', value: overdueTasks.length.toLocaleString('zh-CN'), tone: 'danger' },
          { label: '今日预警数', value: todayWarnings.length.toLocaleString('zh-CN'), tone: 'warning' },
          { label: '异常店铺数', value: abnormalStoreCount.toLocaleString('zh-CN'), tone: 'warning' },
        ];
  const taskTitle = currentUser.role === 'operator' ? '我的待处理任务' : currentUser.role === 'leader' ? '组内待处理任务' : '待处理任务';
  const overdueTitle = currentUser.role === 'operator' ? '我的超期任务' : currentUser.role === 'leader' ? '组内超期任务' : '已超期任务';
  const warningTitle = currentUser.role === 'operator' ? '我的最新预警' : currentUser.role === 'leader' ? '组内最新预警' : '最新预警';

  const displayMetrics = currentUser.role === 'admin'
    ? metrics.map((metric, index) => {
        if (index === 0) {
          return {
            ...metric,
            label: dashboardSalesMetric?.title || metric.label,
            value: `¥${formatAmount(dashboardSalesMetric?.value ?? yesterdaySales)}`,
          };
        }

        if (index === 1) {
          return {
            ...metric,
            label: dashboardOrderMetric?.title || metric.label,
            value: (dashboardOrderMetric?.value ?? yesterdayOrders.length).toLocaleString('zh-CN'),
          };
        }

        return metric;
      })
    : metrics;

  useEffect(() => {
    let cancelled = false;
    void import('../../services/dashboardDataService')
      .then((module) => module.getDashboardData(true))
      .then((data) => {
        if (!cancelled) {
          setDashboardData(data);
        }
      })
      .catch(() => undefined);

    Promise.all([
      fetchAdminJson<TemuOrderImportStore>('/api/persistent-data/orderImportStore?recentDays=7&limit=500', { batches: [] }),
      fetchAdminJson<OperationTaskRecord[]>('/api/tasks', []),
      fetchAdminJson<{ items?: TrafficWarningResult[] }>('/api/persistent-data/riskResults', { items: [] }),
    ]).then(([store, nextTasks, nextWarnings]) => {
        if (cancelled) {
          return;
        }
        setSalesOrders(store.batches.flatMap((batch) =>
          (batch.orders ?? []).map((order) => toRecentSalesOrder({ ...order, batchId: batch.batchId })),
        ));
        setTasks(nextTasks);
        setRiskWarnings((nextWarnings.items ?? [])
          .filter((warning) => warning.level !== 'insufficient')
          .sort(sortWarnings));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="admin-home">
      <section className="admin-home-metrics">
        {displayMetrics.map((metric) => (
          <article key={metric.label} className={`admin-home-metric ${metric.tone ? `admin-home-metric-${metric.tone}` : ''}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-home-focus-grid">
        <article className="excel-record-panel admin-home-panel">
          <header>
            <div>
              <h2>{taskTitle}</h2>
              <p>优先查看未完成的运营跟进事项。</p>
            </div>
            <span>{openTasks.length} 条</span>
          </header>
          <div className="admin-home-list">
            {openTasks.slice(0, 5).map((task) => (
              <section key={task.id} className="admin-home-task-row">
                <strong>{task.title || '-'}</strong>
                <span>{task.storeName || '未绑定店铺'}</span>
                <span>{task.operatorName || '未指派'}</span>
                <em className={`task-priority task-priority-${task.priority}`}>{priorityLabels[task.priority]}</em>
                <em className={`import-status task-status-${task.status}`}>{statusLabels[task.status]}</em>
              </section>
            ))}
            {openTasks.length === 0 && <div className="admin-home-empty">暂无待处理任务</div>}
          </div>
        </article>

        <article className="excel-record-panel admin-home-panel">
          <header>
            <div>
              <h2>{overdueTitle}</h2>
              <p>截止日期早于今天且尚未完成的任务。</p>
            </div>
            <span>{overdueTasks.length} 条</span>
          </header>
          <div className="admin-home-list">
            {overdueTasks.slice(0, 5).map((task) => (
              <section key={task.id} className="admin-home-task-row">
                <strong>{task.title || '-'}</strong>
                <span>{task.storeName || '未绑定店铺'}</span>
                <span>{task.operatorName || '未指派'}</span>
                <em className={`task-priority task-priority-${task.priority}`}>{priorityLabels[task.priority]}</em>
                <em className={`import-status task-status-${task.status}`}>{statusLabels[task.status]}</em>
              </section>
            ))}
            {overdueTasks.length === 0 && <div className="admin-home-empty">暂无超期任务</div>}
          </div>
        </article>

        <article className="excel-record-panel admin-home-panel">
          <header>
            <div>
              <h2>{warningTitle}</h2>
              <p>来自风险诊断中心的风险预警。</p>
            </div>
            <span>{scopedWarnings.length} 条</span>
          </header>
          <div className="admin-home-list">
            {scopedWarnings.slice(0, 5).map((warning) => (
              <section key={warning.id} className="admin-home-warning-row">
                <strong>{warning.storeName || '-'}</strong>
                <p>{warning.content || '-'}</p>
                <span>{warningLevelLabels[warning.level]} / {warningTypeLabels[warning.type]}</span>
                <time>{warning.triggeredAt ? warning.triggeredAt.replace('T', ' ').slice(0, 16) : warning.date || '-'}</time>
              </section>
            ))}
            {scopedWarnings.length === 0 && <div className="admin-home-empty">暂无预警</div>}
          </div>
        </article>
      </section>

      <article className="excel-record-panel admin-home-panel">
        <header>
          <div>
            <h2>AI运营提醒</h2>
            <p>来自当前可见店铺的预警和高优先级任务。</p>
          </div>
          <span>{aiReminderItems.length} 条</span>
        </header>
        <div className="admin-home-notices">
          {aiReminderItems.slice(0, 5).map((item) => (
            <span key={item}>{item}</span>
          ))}
          {aiReminderItems.length === 0 && <div className="admin-home-empty">暂无高优先级运营提醒。</div>}
        </div>
      </article>
    </section>
  );
}

function AdminLayout({ currentUser }: { currentUser: CurrentUser }) {
  const [requestedRoute, setRequestedRoute] = useState(getActiveRoute);
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceRuntimeStatus | null>(null);
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const visibleStores = useVisibleStores(currentUser);
  const allowedMenuKeys = new Set(currentUser.allowedMenuKeys ?? []);
  const hasNewProductCenterAccess = [
    menuKeys.newProductCenter,
    menuKeys.newProductOperatorDashboard,
    menuKeys.newProductProducts,
    menuKeys.newProductAdRecommendations,
  ].some((key) => allowedMenuKeys.has(key));
  const canAccessRoute = (route: AdminRoute) => {
    if (currentUser.role === 'admin' || allowedMenuKeys.has(route.menuKey)) {
      return true;
    }

    if (route.parentMenuKey === menuKeys.newProductCenter) {
      if (route.menuKey === menuKeys.newProductBossDashboard) {
        return false;
      }
      return hasNewProductCenterAccess;
    }

    return (
      Boolean(route.parentMenuKey && allowedMenuKeys.has(route.parentMenuKey)) ||
      (route.menuKey === menuKeys.aiImagePromptCenter && allowedMenuKeys.has(menuKeys.operationLoop))
    );
  };
  const visibleAdminRoutes = adminRoutes.filter(canAccessRoute);
  const menuAdminRoutes = visibleAdminRoutes.filter((route) => route.path !== '/admin/operator-performance' && !route.hideInMenu);
  const hasAnyMenuPermission = currentUser.role === 'admin' || visibleAdminRoutes.length > 0;
  const activeRoute = canAccessRoute(requestedRoute) ? requestedRoute : visibleAdminRoutes[0] ?? requestedRoute;
  const canAccessActiveRoute = canAccessRoute(activeRoute);
  const visibleStoreNames = visibleStores.stores.map((store) => store.storeName || store.id).filter(Boolean);
  const visibleStoreLabel = visibleStoreNames.length === 0
    ? '暂无可见店铺'
    : visibleStoreNames.length <= 3
      ? `可见店铺：${visibleStoreNames.join('、')}`
      : `可见店铺 ${visibleStoreNames.length} 个`;
  const dashboardRoute = menuAdminRoutes.find((route) => route.menuKey === 'dashboard');
  const groupOrder = ['数据', '新品中心', '基础资料', '经营分析', '运营闭环', '1688业务', '运营工具', '规则中心', '数据源', '薪资绩效'];
  const groupLabels: Record<string, string> = { 数据: '数据中心' };
  const groups = groupOrder.filter((group) => menuAdminRoutes.some((route) => route.group === group));
  const activeRouteGroup = groups.includes(activeRoute.group) ? activeRoute.group : null;
  const [activeOpenGroup, setActiveOpenGroup] = useState<string | null>(activeRouteGroup);
  const navigateToRoute = (route: AdminRoute) => {
    if (window.location.pathname !== route.path) {
      window.history.pushState(null, '', route.path);
    }
    setRequestedRoute(route);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const isExcelImportPage = activeRoute.path === '/admin/import';
  const isStoreManagementPage = activeRoute.path === '/admin/stores';
  const isOperatorManagementPage = activeRoute.path === '/admin/operators';
  const isAccountManagementPage = activeRoute.path === '/admin/accounts';
  const isTrafficImportPage = activeRoute.path === '/admin/traffic-import';
  const isTemuProductInfoImportPage = activeRoute.path === '/admin/temu-product-info-import';
  const isTemuAdReportImportPage = activeRoute.path === '/admin/temu-ad-report-import';
  const isNewProductCenterPage = activeRoute.path.startsWith('/new-product-center/');
  const isDataBackupPage = activeRoute.path === '/admin/data-backup';
  const isWarningRulesPage = activeRoute.path === '/admin/config/warnings';
  const isWarningResultsPage = activeRoute.path === '/admin/warning-results';
  const isStoreBusinessCenterPage = activeRoute.path === '/admin/store-business';
  const isOperatorAnalysisCenterPage = activeRoute.path === '/admin/operator-analysis' || activeRoute.path === '/admin/operator-performance';
  const isOperationDiagnosisPage = activeRoute.path === '/admin/operation-diagnosis';
  const isTaskCenterPage = activeRoute.path === '/admin/tasks';
  const isTaskSuggestionsPage = activeRoute.path === '/admin/task-suggestions';
  const isAIImagePromptCenterPage = activeRoute.path === '/admin/ai-image-prompts';
  const isAlibaba1688ProductsPage = activeRoute.path === '/admin/1688-business/products';
  const isAlibaba1688ProductCreatePage = activeRoute.path === '/admin/1688-business/products/new';
  const isAlibaba1688ListingTasksPage = activeRoute.path === '/admin/1688-business/listing-tasks';
  const isAlibaba1688ImagesPage = activeRoute.path === '/admin/1688-business/images';
  const isAlibaba1688SuppliersPage = activeRoute.path === '/admin/1688-business/suppliers';
  const isAlibaba1688SettingsPage = activeRoute.path === '/admin/1688-business/settings' || window.location.pathname === '/admin/1688-business';
  const isSalaryEmployeesPage = activeRoute.path === '/admin/salary/employees';
  const isSalaryPeriodsPage = activeRoute.path === '/admin/salary/periods';
  const isSalaryImportTemplatesPage = activeRoute.path === '/admin/salary/import-templates';
  const isAttendanceImportPage = activeRoute.path === '/admin/salary/attendance-import';
  const isPieceworkImportPage = activeRoute.path === '/admin/salary/piecework-import';
  const isFinancialDetailImportPage = activeRoute.path === '/admin/salary/finance-detail-import';
  const isOperatorSalaryStatisticsPage = activeRoute.path === '/admin/salary/operator-salary-statistics';
  const isSalaryDetailsPage = activeRoute.path === '/admin/salary/details';
  const isSalaryPlanPage = activeRoute.path === '/admin/salary/plan';
  const isPlaceholderPage = activeRoute.isPlaceholder;

  async function handleLogout() {
    await logoutCurrentUser();
    window.localStorage.removeItem('currentUser');
    window.location.replace('/login');
  }

  useEffect(() => {
    setActiveOpenGroup(activeRouteGroup);
  }, [activeRouteGroup]);

  useEffect(() => {
    const handlePopState = () => {
      setRequestedRoute(getActiveRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (requestedRoute.path !== activeRoute.path && canAccessActiveRoute) {
      window.history.replaceState(null, '', activeRoute.path);
    }
  }, [activeRoute.path, canAccessActiveRoute, requestedRoute.path]);

  useEffect(() => {
    let cancelled = false;
    fetchAdminJson<DataSourceRuntimeStatus | null>('/api/data-source/status', null).then((status) => {
      if (!cancelled) {
        setDataSourceStatus(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>电商</span>
          <strong>运营中心</strong>
        </div>
        <nav className="admin-nav" aria-label="后台导航">
          {!hasAnyMenuPermission && (
            <span className="admin-no-menu">当前账号暂无可访问菜单，请联系管理员配置权限。</span>
          )}
          {dashboardRoute && (
            <a
              className={dashboardRoute.path === activeRoute.path ? 'active' : ''}
              href={dashboardRoute.path}
              onClick={(event) => {
                event.preventDefault();
                setActiveOpenGroup(null);
                navigateToRoute(dashboardRoute);
              }}
            >
              {dashboardRoute.label}
            </a>
          )}
          {groups.map((group) => {
            const groupRoutes = menuAdminRoutes.filter((route) => route.group === group);

            return (
              <section key={group} className="admin-nav-group">
                <button
                  className="admin-nav-group-title"
                  type="button"
                  onClick={() => setActiveOpenGroup((current) => (
                    current === group && activeRoute.group !== group ? null : group
                  ))}
                >
                  <span>{groupLabels[group] ?? group}</span>
                  <b>{activeOpenGroup === group ? '⌄' : '›'}</b>
                </button>
                {activeOpenGroup === group && (
                  <div className="admin-nav-group-links">
                    {group === '数据' ? (
                      <DataCenterMenuLinks
                        routes={groupRoutes}
                        activeRoute={activeRoute}
                        onNavigate={navigateToRoute}
                      />
                    ) : (
                      groupRoutes.map((route) => (
                          <a
                            key={route.path}
                            className={route.path === activeRoute.path ? 'active' : ''}
                            href={route.path}
                            onClick={(event) => {
                              event.preventDefault();
                              navigateToRoute(route);
                            }}
                          >
                            {route.label}
                          </a>
                        ))
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{activeRoute.label}</h1>
          </div>
          <div className="admin-user-bar">
            <span>{currentUser.displayName}</span>
            <strong>{getRoleLabel(currentUser.roleCode, currentUser.role)}</strong>
            <span className={`admin-visible-stores ${visibleStoreNames.length === 0 ? 'empty' : ''}`}>
              {visibleStoreLabel}
              {visibleStoreNames.length > 3 && (
                <span className="admin-visible-store-popover">
                  {visibleStoreNames.map((storeName) => (
                    <b key={storeName}>{storeName}</b>
                  ))}
                </span>
              )}
            </span>
            <span className="admin-data-source-status">
              <button type="button" onClick={() => setDataSourceOpen((current) => !current)}>
                数据源
              </button>
              {dataSourceOpen && (
                <span className="admin-data-source-popover">
                  <span className="admin-data-source-head">
                    <b>数据源状态</b>
                    <small>{dataSourceStatus?.environment.temuReadSource === 'postgres' ? 'TEMU读取PG' : 'TEMU读取JSON'}</small>
                  </span>
                  <span className="admin-data-source-env">
                    <span>PG连接：{dataSourceStatus?.environment.postgresConfigured ? '已配置' : '未配置'}</span>
                    <span>JSON兜底：已开启</span>
                  </span>
                  {(dataSourceStatus?.groups ?? []).map((group) => (
                    <span className="admin-data-source-group" key={group.name}>
                      <strong>{group.name}</strong>
                      {group.items.map((item) => (
                        <span className="admin-data-source-row" key={`${group.name}-${item.name}`}>
                          <span>{item.name}</span>
                          <em className={`source-${getSourceTone(item.readSource)}`}>读：{item.readSource}</em>
                          <em className={`source-${getSourceTone(item.writeSource)}`}>写：{item.writeSource}</em>
                          <small>{item.mode}</small>
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <a className="admin-dashboard-link" href="/">
              返回大屏
            </a>
            <button type="button" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </header>

        <section className="admin-content">
          {currentUser.role !== 'admin' && visibleStores.storeIds.length === 0 && (
            <section className="excel-record-panel admin-permission-empty">
              当前账号暂未绑定可见店铺，请联系管理员配置权限。
            </section>
          )}
          <Suspense fallback={<div className="admin-route-loading">加载中...</div>}>
          {!canAccessActiveRoute ? (
            <section className="excel-record-panel admin-permission-empty">
              当前账号无权访问此页面，请联系管理员。
            </section>
          ) : isExcelImportPage ? (
            <ExcelImportPage currentUser={currentUser} />
          ) : isDataBackupPage ? (
            <DataBackupPage currentUser={currentUser} />
          ) : isTrafficImportPage ? (
            <TrafficImportPage currentUser={currentUser} visibleStoreNames={visibleStoreNames} />
          ) : isTemuProductInfoImportPage ? (
            <TemuProductInfoImportPage />
          ) : isTemuAdReportImportPage ? (
            <TemuAdReportImportPage />
          ) : isNewProductCenterPage ? (
            <NewProductCenterPage currentUser={currentUser} />
          ) : isWarningRulesPage ? (
            <WarningRulesPage />
          ) : isWarningResultsPage ? (
            <WarningResultsPage currentUser={currentUser} />
          ) : isStoreBusinessCenterPage ? (
            <StoreBusinessCenterPage currentUser={currentUser} />
          ) : isOperatorAnalysisCenterPage ? (
            <OperatorAnalysisCenterPage currentUser={currentUser} />
          ) : isOperationDiagnosisPage ? (
            <OperationDiagnosisPage currentUser={currentUser} />
          ) : isTaskCenterPage ? (
            <TaskCenterPage currentUser={currentUser} />
          ) : isTaskSuggestionsPage ? (
            <TaskSuggestionsPage />
          ) : isAIImagePromptCenterPage ? (
            <AIImagePromptCenterPage currentUser={currentUser} />
          ) : isAlibaba1688ProductCreatePage ? (
            <Alibaba1688ProductCreatePage currentUser={currentUser} />
          ) : isAlibaba1688ProductsPage ? (
            <Alibaba1688ProductsPage currentUser={currentUser} />
          ) : isAlibaba1688ListingTasksPage ? (
            <Alibaba1688ListingTasksPage currentUser={currentUser} />
          ) : isAlibaba1688ImagesPage ? (
            <Alibaba1688ImagesPage currentUser={currentUser} />
          ) : isAlibaba1688SuppliersPage ? (
            <Alibaba1688SuppliersPage currentUser={currentUser} />
          ) : isAlibaba1688SettingsPage ? (
            <Alibaba1688SettingsPage currentUser={currentUser} />
          ) : isSalaryEmployeesPage ? (
            <SalaryEmployeesPage />
          ) : isSalaryPeriodsPage ? (
            <SalaryPeriodsPage />
          ) : isSalaryImportTemplatesPage ? (
            <SalaryImportTemplatesPage />
          ) : isAttendanceImportPage ? (
            <AttendanceImportPage />
          ) : isPieceworkImportPage ? (
            <PieceworkImportPage />
          ) : isFinancialDetailImportPage ? (
            <FinancialDetailImportPage currentUser={currentUser} />
          ) : isOperatorSalaryStatisticsPage ? (
            <OperatorSalaryStatisticsPage currentUser={currentUser} />
          ) : isSalaryDetailsPage ? (
            <SalaryDetailsPage />
          ) : isSalaryPlanPage ? (
            <SalaryPlanPage />
          ) : isStoreManagementPage ? (
            <StoreManagementPage />
          ) : isOperatorManagementPage ? (
            <OperatorManagementPage />
          ) : isAccountManagementPage ? (
            <AccountManagementPage currentUser={currentUser} />
          ) : isPlaceholderPage ? (
            <PlaceholderPage title={activeRoute.label} description={activeRoute.description} />
          ) : (
          <WorkbenchPage currentUser={currentUser} visibleStoreIds={visibleStores.storeIds} visibleStoreNames={visibleStoreNames} />
        )}
          </Suspense>
        </section>
      </section>
    </main>
  );
}

export default AdminLayout;
