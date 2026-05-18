import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { FirstOrderDailyTrendItem, FirstOrderTrendItem, FirstOrderTrendStatus } from '../../types/dashboard';

interface FirstOrderTrendChartProps {
  dailyData: FirstOrderDailyTrendItem[];
  stores: FirstOrderTrendItem[];
}

const statusLabels: Record<FirstOrderTrendStatus, string> = {
  normal: '正常',
  warning: '警告',
  danger: '危险',
};

function FirstOrderTrendChart({ dailyData, stores }: FirstOrderTrendChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    color: ['#37d67a'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 18, 42, 0.94)',
      borderColor: 'rgba(63, 151, 255, 0.5)',
      borderWidth: 1,
      textStyle: {
        color: '#dceeff',
        fontSize: 13,
      },
      valueFormatter: (value) => `${Number(value)} 个`,
    },
    grid: {
      left: 42,
      right: 12,
      top: 18,
      bottom: 28,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dailyData.map((item) => item.date),
      axisTick: { show: false },
      axisLabel: {
        color: '#a9bfd8',
        fontSize: 12,
        interval: 5,
      },
      axisLine: {
        lineStyle: { color: 'rgba(120, 170, 220, 0.48)' },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 3,
      axisLabel: {
        color: '#a9bfd8',
        fontSize: 12,
      },
      splitLine: {
        lineStyle: { color: 'rgba(85, 142, 210, 0.18)' },
      },
    },
    series: [
      {
        name: '每日首单',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2,
          color: '#37d67a',
          shadowColor: 'rgba(55, 214, 122, 0.55)',
          shadowBlur: 8,
        },
        itemStyle: {
          color: '#8cffc1',
          borderColor: '#37d67a',
          borderWidth: 2,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(55, 214, 122, 0.32)' },
              { offset: 1, color: 'rgba(55, 214, 122, 0)' },
            ],
          },
        },
        data: dailyData.map((item) => item.firstOrderCount),
      },
    ],
  };

  return (
    <div className="first-order-trend">
      <ReactECharts option={option} notMerge lazyUpdate style={{ width: '100%', height: 128 }} />
      <div className="first-order-trend-table">
        {stores.length > 0 && (
          <div className="first-order-row first-order-head">
            <span>店铺</span>
            <span>30日</span>
            <span>7日</span>
            <span>变化率</span>
            <span>状态</span>
          </div>
        )}
        {stores.slice(0, 5).map((item) => (
          <div key={item.storeName} className={`first-order-row first-order-${item.status}`}>
            <span className="first-order-store">{item.storeName}</span>
            <span>{item.previous30Avg.toFixed(2)}</span>
            <span>{item.recent7Avg.toFixed(2)}</span>
            <span className={item.changeRate >= 0 ? 'first-order-up' : 'first-order-down'}>
              {item.changeRate.toFixed(2)}%
            </span>
            <strong>{statusLabels[item.status]}</strong>
          </div>
        ))}
        {stores.length === 0 && <div className="first-order-empty">暂无真实首单数据</div>}
      </div>
    </div>
  );
}

export default FirstOrderTrendChart;
