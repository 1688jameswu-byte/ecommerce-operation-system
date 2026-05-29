import { lazy, Suspense, useEffect, useState } from 'react';
import { useDashboardScale } from './useDashboardScale';
import { dashboardConfig } from '../../config/dashboardConfig';
import { rankingRules } from '../../config/rankingRules';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import MetricCard from '../../components/dashboard/MetricCard';
import Panel from '../../components/dashboard/Panel';
import GrowthOpportunityList from '../../components/dashboard/GrowthOpportunityList';
import WarningList from '../../components/dashboard/WarningList';
import type { DashboardData } from '../../types/dashboard';
import './dashboard.css';

const TEMU_ORDER_IMPORT_STORAGE_KEY = 'temuOrderImportResult';
const TEMU_ORDER_IMPORT_STORAGE_EVENT = 'temu-order-import-storage-change';
const TEMU_ORDER_IMPORT_BROADCAST_CHANNEL = 'temu-order-import-storage';
const TRAFFIC_CONVERSION_CHANGE_EVENT = 'traffic-conversion-data-change';
const EFFECTIVE_LISTING_CHANGE_EVENT = 'effective-new-listings-change';

const RankingPanel = lazy(() => import('../../components/dashboard/RankingPanel'));
const SalesTrendChart = lazy(() => import('../../components/dashboard/SalesTrendChart'));

const rankingPanelConfigs = [
  { ruleId: 'newProductRanking', dataKey: 'newProductRanking' },
  { ruleId: 'operatorSalesRanking', dataKey: 'operatorSalesRanking' },
  { ruleId: 'storeSalesRanking', dataKey: 'storeSalesRanking' },
] as const;

function subscribeOrderImportStorageChange(callback: () => void) {
  const handleCustomEvent = () => callback();
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === TEMU_ORDER_IMPORT_STORAGE_KEY) {
      callback();
    }
  };
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(TEMU_ORDER_IMPORT_BROADCAST_CHANNEL) : null;

  channel?.addEventListener('message', handleCustomEvent);
  window.addEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);
  window.addEventListener('focus', handleCustomEvent);
  document.addEventListener('visibilitychange', handleCustomEvent);

  return () => {
    channel?.removeEventListener('message', handleCustomEvent);
    channel?.close();
    window.removeEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
    window.removeEventListener('focus', handleCustomEvent);
    document.removeEventListener('visibilitychange', handleCustomEvent);
  };
}

function subscribeTrafficConversionChange(callback: () => void) {
  window.addEventListener(TRAFFIC_CONVERSION_CHANGE_EVENT, callback);
  return () => window.removeEventListener(TRAFFIC_CONVERSION_CHANGE_EVENT, callback);
}

function subscribeEffectiveListingChange(callback: () => void) {
  window.addEventListener(EFFECTIVE_LISTING_CHANGE_EVENT, callback);
  window.addEventListener('focus', callback);
  return () => {
    window.removeEventListener(EFFECTIVE_LISTING_CHANGE_EVENT, callback);
    window.removeEventListener('focus', callback);
  };
}

function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const { scale, offsetX, offsetY } = useDashboardScale({
    width: dashboardConfig.designWidth,
    height: dashboardConfig.designHeight,
  });

  useEffect(() => {
    const refreshDashboardData = (force = false) => {
      void import('../../services/dashboardDataService')
        .then((module) => module.getDashboardData(force))
        .then(setDashboardData);
    };

    refreshDashboardData();
    const unsubscribeOrder = subscribeOrderImportStorageChange(() => refreshDashboardData(true));
    const unsubscribeTraffic = subscribeTrafficConversionChange(() => refreshDashboardData(true));
    const unsubscribeEffectiveListing = subscribeEffectiveListingChange(() => refreshDashboardData(true));
    return () => {
      unsubscribeOrder();
      unsubscribeTraffic();
      unsubscribeEffectiveListing();
    };
  }, []);

  return (
    <main className="dashboard-viewport">
      <section
        className="dashboard-canvas"
        style={{
          width: dashboardConfig.designWidth,
          height: dashboardConfig.designHeight,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
        }}
      >
        <div className="dashboard-grid-bg" />
        <DashboardHeader
          title={dashboardConfig.title}
          subtitle={dashboardConfig.subtitle}
          dashboardData={dashboardData}
        />
        <section className="metric-card-grid">
          {(dashboardData?.metrics ?? []).map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </section>
        <section className="dashboard-content-grid">
          {(() => {
            const rule = rankingRules.find((item) => item.id === rankingPanelConfigs[0].ruleId);
            return rule ? (
              <Suspense fallback={null}>
                <RankingPanel
                  title={rule.title}
                  period={rule.period}
                  items={dashboardData?.newProductRanking ?? []}
                  emptyText="暂无本月有效上新数据"
                  showTopThreeBadge={rule.showTopThreeBadge}
                  showGrowth={rule.showGrowth}
                />
              </Suspense>
            ) : null;
          })()}
          <Suspense fallback={null}>
            <RankingPanel
              title="首单商品数排名"
              period="近30天"
              items={dashboardData?.firstOrderRanking ?? []}
              emptyText="暂无近30天首单商品数据"
              showTopThreeBadge
              showGrowth={false}
            />
          </Suspense>
          {rankingPanelConfigs.slice(1).map(({ ruleId, dataKey }) => {
            const rule = rankingRules.find((item) => item.id === ruleId);

            if (!rule) {
              return null;
            }

            return (
              <Suspense key={ruleId} fallback={null}>
                <RankingPanel
                  title={rule.title}
                  period={rule.period}
                  items={dashboardData?.[dataKey] ?? []}
                  showTopThreeBadge={rule.showTopThreeBadge}
                  showGrowth={rule.showGrowth}
                />
              </Suspense>
            );
          })}
          <Panel title="销售趋势" extra={<span>近30天</span>} className="sales-trend-panel">
            <Suspense fallback={null}>
              <SalesTrendChart data={dashboardData?.salesTrend30Days ?? []} />
            </Suspense>
          </Panel>
          <Panel title="今日预警提醒" extra={<span>{dashboardData?.warnings.length ?? 0} 条</span>} className="warning-list-panel">
            <WarningList warnings={dashboardData?.warnings ?? []} />
          </Panel>
          <Panel title="今日增长店铺" extra={<span>Top5</span>} className="growth-opportunity-panel">
            <GrowthOpportunityList items={dashboardData?.growthOpportunities ?? []} />
          </Panel>
        </section>
      </section>
    </main>
  );
}

export default DashboardPage;
