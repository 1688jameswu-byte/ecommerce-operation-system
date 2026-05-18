import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { storeStatusRules } from '../../config/storeStatusRules';
import type { StoreStatusData } from '../../types/dashboard';

interface StoreStatusChartProps {
  data?: StoreStatusData;
}

const fallbackStoreStatus: StoreStatusData = {
  total: 0,
  normal: 0,
  abnormal: 0,
  closed: 0,
};

function getStatusLabel(status: 'normal' | 'abnormal' | 'closed') {
  return storeStatusRules.find((item) => item.status === status)?.label ?? status;
}

function getStatusColor(status: 'normal' | 'abnormal' | 'closed') {
  return storeStatusRules.find((item) => item.status === status)?.color ?? '#1f8fff';
}

function formatStoreStatusTooltip(params: TopLevelFormatterParams) {
  const item = Array.isArray(params) ? params[0] : params;

  if (!item || typeof item !== 'object') {
    return '';
  }

  const record = item as { name?: string; value?: string | number; percent?: string | number };

  return `${record.name ?? ''}<br/>数量：${record.value ?? 0}<br/>占比：${record.percent ?? 0}%`;
}

function StoreStatusChart({ data = fallbackStoreStatus }: StoreStatusChartProps) {
  const chartData = [
    { status: 'normal' as const, value: data.normal },
    { status: 'abnormal' as const, value: data.abnormal },
    { status: 'closed' as const, value: data.closed },
  ];

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    color: chartData.map((item) => getStatusColor(item.status)),
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(5, 18, 42, 0.94)',
      borderColor: 'rgba(63, 151, 255, 0.5)',
      borderWidth: 1,
      textStyle: {
        color: '#dceeff',
        fontSize: 14,
      },
      formatter: formatStoreStatusTooltip,
    },
    legend: {
      orient: 'vertical',
      right: 8,
      top: 'middle',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        color: '#b8cce4',
        fontSize: 14,
      },
    },
    series: [
      {
        name: '店铺状态',
        type: 'pie',
        radius: ['56%', '76%'],
        center: ['35%', '52%'],
        avoidLabelOverlap: true,
        padAngle: 3,
        itemStyle: {
          borderColor: '#07162e',
          borderWidth: 3,
          shadowBlur: 12,
          shadowColor: 'rgba(31, 143, 255, 0.18)',
        },
        label: {
          show: false,
        },
        emphasis: {
          scaleSize: 8,
          label: {
            show: false,
          },
        },
        data: chartData.map((item) => ({
          name: getStatusLabel(item.status),
          value: item.value,
        })),
      },
    ],
    graphic: [
      {
        type: 'text',
        left: '27%',
        top: '41%',
        style: {
          text: String(data.total),
          fill: '#f6fbff',
          fontSize: 34,
          fontWeight: 800,
        },
      },
      {
        type: 'text',
        left: '25%',
        top: '58%',
        style: {
          text: '店铺总数',
          fill: '#9dbbda',
          fontSize: 15,
        },
      },
    ],
  };

  return (
    <div className="store-status-chart">
      <ReactECharts option={option} notMerge lazyUpdate style={{ width: '100%', height: '100%' }} />
      <div className="store-status-summary" aria-label="店铺状态数据">
        <div>
          <strong>{data.normal}</strong>
          <span>正常</span>
        </div>
        <div>
          <strong>{data.abnormal}</strong>
          <span>异常</span>
        </div>
        <div>
          <strong>{data.closed}</strong>
          <span>停业</span>
        </div>
      </div>
    </div>
  );
}

export default StoreStatusChart;
