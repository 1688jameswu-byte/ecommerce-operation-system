import type { MetricIconType, MetricItem } from '../../types/dashboard';

interface MetricCardProps {
  metric: MetricItem;
}

const metricIconText: Record<MetricIconType, string> = {
  sales: '¥',
  order: '#',
  store: '店',
  warning: '!',
};

function formatMetricValue(metric: MetricItem) {
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: metric.unit === '¥' ? 2 : 0,
    maximumFractionDigits: metric.unit === '¥' ? 2 : 0,
  });

  return formatter.format(metric.value);
}

function getTrendMark(metric: MetricItem) {
  if (metric.trend === 'down') {
    return '↓';
  }

  if (metric.trend === 'up') {
    return '↑';
  }

  return '';
}

function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${metric.colorTheme}`}>
      <div className="metric-icon" aria-hidden="true">
        {metricIconText[metric.iconType]}
      </div>
      <div className="metric-content">
        <div className="metric-title">{metric.title}</div>
        <div className="metric-value-row">
          {metric.unit && <span className="metric-unit">{metric.unit}</span>}
          <strong>{formatMetricValue(metric)}</strong>
        </div>
        <div className="metric-compare">
          <span>{metric.compareText}</span>
          {typeof metric.growthPercent === 'number' && (
            <em className={`metric-trend metric-trend-${metric.trend ?? 'flat'}`}>
              {metric.growthPercent > 0 ? '+' : ''}
              {metric.growthPercent.toFixed(2)}% {getTrendMark(metric)}
            </em>
          )}
        </div>
      </div>
    </article>
  );
}

export default MetricCard;
