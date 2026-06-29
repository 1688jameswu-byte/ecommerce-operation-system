import { useEffect, useState } from 'react';
import type { DashboardData } from '../../types/dashboard';

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  dashboardData: DashboardData | null;
}

function formatDateTime(date: Date) {
  return {
    date: new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(date)
      .replaceAll('/', '-'),
    time: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date),
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date),
  };
}

function DashboardHeader({ title, subtitle, dashboardData }: DashboardHeaderProps) {
  const [now, setNow] = useState(() => new Date());
  const current = formatDateTime(now);
  const dataUpdatedAt = dashboardData?.dataUpdatedAt || dashboardData?.updatedAt || '-';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="dashboard-header">
      <div className="dashboard-brand">
        <div className="dashboard-logo">电商</div>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="dashboard-slogan">数据驱动增长 · 团队赢得未来</div>

      <div className="dashboard-clock">
        <div className="dashboard-clock-main">
          <span>{current.date}</span>
          <strong>{current.time}</strong>
        </div>
        <div className="dashboard-clock-meta">
          <span>{current.weekday}</span>
          <span>数据更新时间：{dataUpdatedAt}</span>
          <span>数据来源：{dashboardData?.dataSource ?? '-'}</span>
          <span>统计周期：{dashboardData?.statisticsPeriod ?? '-'}</span>
        </div>
      </div>
    </header>
  );
}

export default DashboardHeader;
