import { useEffect, useMemo, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { SalesTrendItem } from '../../types/dashboard';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: 'transparent',
    color: ['#1f8fff'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 18, 42, 0.94)',
      borderColor: 'rgba(63, 151, 255, 0.5)',
      borderWidth: 1,
      confine: true,
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
      formatter: (params: unknown) => {
        const point = Array.isArray(params) ? params[0] : params;
        const chartPoint = point as {
          axisValue?: string;
          axisValueLabel?: string;
          dataIndex?: number;
          value?: number;
        };
        const dataIndex = Number(chartPoint?.dataIndex ?? -1);
        const date = String(chartPoint?.axisValue ?? chartPoint?.axisValueLabel ?? '');
        const row = data[dataIndex] ?? data.find((item) => item.date === date);
        const displayDate = row?.date ?? (date || '-');
        const salesAmount = Number(row?.salesAmount ?? chartPoint?.value ?? 0);
        const orderText = typeof row?.orderCount === 'number'
          ? `<div style="margin-top:4px;color:#9fc4e8;">订单数：${row.orderCount}</div>`
          : '';
        return [
          `<div style="font-weight:800;color:#ffffff;margin-bottom:6px;">${displayDate}</div>`,
          `<div style="color:#dceeff;">销售额：<strong style="color:#38c9ff;">￥ ${formatCurrency(salesAmount)}</strong></div>`,
          orderText,
        ].join('');
      },
      extraCssText: 'box-shadow:0 12px 28px rgba(0,0,0,.36);border-radius:8px;min-width:140px;',
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
  }), [data]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = chartRef.current ?? init(containerRef.current);
    chartRef.current = chart;
    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option]);

  useEffect(() => () => {
    chartRef.current?.dispose();
    chartRef.current = null;
  }, []);

  return <div ref={containerRef} className="sales-trend-chart" />;
}

export default SalesTrendChart;
