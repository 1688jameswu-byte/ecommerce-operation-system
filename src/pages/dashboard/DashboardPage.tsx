import { useEffect, useState } from 'react';
import { useDashboardScale } from './useDashboardScale';
import { dashboardConfig } from '../../config/dashboardConfig';
import { rankingRules } from '../../config/rankingRules';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import MetricCard from '../../components/dashboard/MetricCard';
import Panel from '../../components/dashboard/Panel';
import RankingPanel from '../../components/dashboard/RankingPanel';
import FirstOrderTrendChart from '../../components/dashboard/FirstOrderTrendChart';
import GrowthOpportunityList from '../../components/dashboard/GrowthOpportunityList';
import SalesTrendChart from '../../components/dashboard/SalesTrendChart';
import WarningList from '../../components/dashboard/WarningList';
import { subscribeOrderImportStorageChange } from '../../data-source/orderImportStorageDataSource';
import { subscribeTrafficConversionChange } from '../../data-source/trafficConversionDataSource';
import { getDashboardData } from '../../services/dashboardDataService';
import type { DashboardData } from '../../types/dashboard';
import './dashboard.css';

const rankingPanelConfigs = [
  { ruleId: 'newProductRanking', dataKey: 'newProductRanking' },
  { ruleId: 'operatorSalesRanking', dataKey: 'operatorSalesRanking' },
  { ruleId: 'storeSalesRanking', dataKey: 'storeSalesRanking' },
] as const;

function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const { scale, offsetX, offsetY } = useDashboardScale({
    width: dashboardConfig.designWidth,
    height: dashboardConfig.designHeight,
  });

  useEffect(() => {
    const refreshDashboardData = (force = false) => {
      void getDashboardData(force).then(setDashboardData);
    };

    refreshDashboardData();
    const unsubscribeOrder = subscribeOrderImportStorageChange(() => refreshDashboardData(true));
    const unsubscribeTraffic = subscribeTrafficConversionChange(() => refreshDashboardData(true));
    return () => {
      unsubscribeOrder();
      unsubscribeTraffic();
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
              <RankingPanel
                title={rule.title}
                period={rule.period}
                items={dashboardData?.newProductRanking ?? []}
                showTopThreeBadge={rule.showTopThreeBadge}
                showGrowth={rule.showGrowth}
              />
            ) : null;
          })()}
          <Panel title="首单趋势分析" extra={<span>近30天</span>} className="first-order-trend-panel">
            <FirstOrderTrendChart
              dailyData={dashboardData?.firstOrderTrend30Days ?? []}
              stores={dashboardData?.firstOrderTrendStores ?? []}
            />
          </Panel>
          {rankingPanelConfigs.slice(1).map(({ ruleId, dataKey }) => {
            const rule = rankingRules.find((item) => item.id === ruleId);

            if (!rule) {
              return null;
            }

            return (
              <RankingPanel
                key={ruleId}
                title={rule.title}
                period={rule.period}
                items={dashboardData?.[dataKey] ?? []}
                showTopThreeBadge={rule.showTopThreeBadge}
                showGrowth={rule.showGrowth}
              />
            );
          })}
          <Panel title="销售趋势" extra={<span>近30天</span>} className="sales-trend-panel">
            <SalesTrendChart data={dashboardData?.salesTrend30Days ?? []} />
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
