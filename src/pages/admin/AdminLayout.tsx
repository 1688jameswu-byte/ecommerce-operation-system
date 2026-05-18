import { adminRoutes } from './routes';
import ExcelImportPage from './data-import/ExcelImportPage';
import StoreManagementPage from './store-management/StoreManagementPage';
import TrafficImportPage from './traffic-import/TrafficImportPage';
import WarningResultsPage from './warning-results/WarningResultsPage';
import WarningRulesPage from './warning-rules/WarningRulesPage';
import './admin.css';

function getActiveRoute() {
  const pathname = window.location.pathname;

  return adminRoutes.find((route) => route.path === pathname) ?? adminRoutes[0];
}

function AdminLayout() {
  const activeRoute = getActiveRoute();
  const groups = Array.from(new Set(adminRoutes.map((route) => route.group)));
  const isExcelImportPage = activeRoute.path === '/admin/import';
  const isStoreManagementPage = activeRoute.path === '/admin/stores';
  const isTrafficImportPage = activeRoute.path === '/admin/traffic-import';
  const isWarningRulesPage = activeRoute.path === '/admin/config/warnings';
  const isWarningResultsPage = activeRoute.path === '/admin/warning-results';

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>TEMU</span>
          <strong>运营后台</strong>
        </div>
        <nav className="admin-nav" aria-label="后台导航">
          {groups.map((group) => (
            <section key={group} className="admin-nav-group">
              <h2>{group}</h2>
              {adminRoutes
                .filter((route) => route.group === group)
                .map((route) => (
                  <a
                    key={route.path}
                    className={route.path === activeRoute.path ? 'active' : ''}
                    href={route.path}
                  >
                    {route.label}
                  </a>
                ))}
            </section>
          ))}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p>Admin Console</p>
            <h1>{activeRoute.label}</h1>
          </div>
          <a className="admin-dashboard-link" href="/">
            返回大屏
          </a>
        </header>

        <section className="admin-content">
          {isExcelImportPage ? (
            <ExcelImportPage />
          ) : isTrafficImportPage ? (
            <TrafficImportPage />
          ) : isWarningRulesPage ? (
            <WarningRulesPage />
          ) : isWarningResultsPage ? (
            <WarningResultsPage />
          ) : isStoreManagementPage ? (
            <StoreManagementPage />
          ) : (
            <>
              <article className="admin-placeholder-card">
                <span className="admin-status">阶段 1 预留</span>
                <h2>{activeRoute.label}</h2>
                <p>{activeRoute.description}</p>
              </article>

              <section className="admin-roadmap-grid">
                <article>
                  <strong>当前状态</strong>
                  <span>仅预留路由、布局和菜单</span>
                </article>
                <article>
                  <strong>数据边界</strong>
                  <span>后台数据后续统一进入 data-source 层</span>
                </article>
                <article>
                  <strong>下一阶段</strong>
                  <span>Excel 导入和数据标准化</span>
                </article>
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default AdminLayout;
