export interface AdminRoute {
  path: string;
  label: string;
  group: string;
  description: string;
}

export const adminRoutes: AdminRoute[] = [
  {
    path: '/admin',
    label: '后台首页',
    group: '总览',
    description: '后台管理入口，汇总导入、数据、规则和数据源状态。',
  },
  {
    path: '/admin/import',
    label: '订单销售导入',
    group: '数据',
    description: '上传订单销售 Excel，生成大屏销售数据。',
  },
  {
    path: '/admin/traffic-import',
    label: '流量转化导入',
    group: '数据',
    description: '上传店铺每日流量转化 Excel。',
  },
  {
    path: '/admin/data',
    label: '数据管理',
    group: '数据',
    description: '查看和修正大屏展示数据。',
  },
  {
    path: '/admin/stores',
    label: '店铺管理',
    group: '基础资料',
    description: '维护店铺名称、状态、归属和平台信息。',
  },
  {
    path: '/admin/operators',
    label: '运营管理',
    group: '基础资料',
    description: '维护运营人员、归属店铺和团队信息。',
  },
  {
    path: '/admin/config/kpi',
    label: 'KPI配置',
    group: '规则配置',
    description: '维护核心指标口径。',
  },
  {
    path: '/admin/config/ranking',
    label: '排名规则',
    group: '规则配置',
    description: '维护排名口径。',
  },
  {
    path: '/admin/config/warnings',
    label: '经营规则配置',
    group: '规则配置',
    description: '维护风险预警和增长机会规则。',
  },
  {
    path: '/admin/warning-results',
    label: '经营分析中心',
    group: '规则配置',
    description: '查看风险预警、增长机会和详细分析列表。',
  },
  {
    path: '/admin/data-sources',
    label: '数据源配置',
    group: '数据源',
    description: '配置 Excel、店小秘、TEMU后台、飞书和 ERP 数据源。',
  },
];
