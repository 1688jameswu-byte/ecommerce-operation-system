import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { SalesTrendItem } from '../../types/dashboard';

interface SalesTrendChartProps {
  data: SalesTrendItem[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function SalesTrendChart({ data }: SalesTrendChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    color: ['#1f8fff'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 18, 42, 0.94)',
      borderColor: 'rgba(63, 151, 255, 0.5)',
      borderWidth: 1,
      padding: [12, 14],
      textStyle: {
        color: '#dceeff',
        fontSize: 14,
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(92, 184, 255, 0.5)',
          width: 1,
        },
      },
      valueFormatter: (value) => `¥ ${formatCurrency(Number(value))}`,
    },
    grid: {
      left: 54,
      right: 22,
      top: 26,
      bottom: 38,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((item) => item.date),
      axisLine: {
        lineStyle: {
          color: 'rgba(120, 170, 220, 0.48)',
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#a9bfd8',
        fontSize: 13,
        interval: 4,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 5,
      axisLabel: {
        color: '#a9bfd8',
        fontSize: 13,
        formatter: (value: number) => `${Math.round(value / 10000)}万`,
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(85, 142, 210, 0.18)',
        },
      },
    },
    series: [
      {
        name: '销售额',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: true,
        lineStyle: {
          width: 3,
          color: '#1f8fff',
          shadowColor: 'rgba(31, 143, 255, 0.75)',
          shadowBlur: 10,
        },
        itemStyle: {
          color: '#38c9ff',
          borderColor: '#1f8fff',
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
              { offset: 0, color: 'rgba(31, 143, 255, 0.46)' },
              { offset: 0.62, color: 'rgba(31, 143, 255, 0.14)' },
              { offset: 1, color: 'rgba(31, 143, 255, 0)' },
            ],
          },
        },
        data: data.map((item) => item.salesAmount),
      },
    ],
  };

  return (
    <div className="sales-trend-chart">
      <ReactECharts option={option} notMerge lazyUpdate style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default SalesTrendChart;
