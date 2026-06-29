import { allMenuKeys, menuKeys } from '../pages/admin/menuKeys';
import type {
  FieldPermissionKey,
  OperationPermissionKey,
  UserRole,
  UserRoleCode,
} from '../types/auth';
import type { StorePlatform } from '../types/store';

export const platformOptions: StorePlatform[] = ['TEMU', '1688', 'Amazon', 'TikTok', 'SHEIN', 'Shopify', 'Other'];

export const roleCodeOptions: { value: UserRoleCode; label: string; baseRole: UserRole; platform?: StorePlatform }[] = [
  { value: 'admin', label: '管理员', baseRole: 'admin' },
  { value: 'leader', label: '组长', baseRole: 'leader', platform: 'TEMU' },
  { value: 'operator', label: '运营', baseRole: 'operator', platform: 'TEMU' },
  { value: 'temu_lead', label: 'TEMU运营主管', baseRole: 'leader', platform: 'TEMU' },
  { value: 'temu_operator', label: 'TEMU运营', baseRole: 'operator', platform: 'TEMU' },
  { value: '1688_lead', label: '1688业务主管', baseRole: 'leader', platform: '1688' },
  { value: '1688_sales', label: '1688业务员', baseRole: 'operator', platform: '1688' },
  { value: 'amazon_lead', label: 'Amazon运营主管', baseRole: 'leader', platform: 'Amazon' },
  { value: 'amazon_operator', label: 'Amazon运营', baseRole: 'operator', platform: 'Amazon' },
  { value: 'tiktok_lead', label: 'TikTok运营主管', baseRole: 'leader', platform: 'TikTok' },
  { value: 'tiktok_operator', label: 'TikTok运营', baseRole: 'operator', platform: 'TikTok' },
];

export const fieldPermissionOptions: { value: FieldPermissionKey; label: string }[] = [
  { value: 'supplier.read', label: '供应商信息' },
  { value: 'cost.read', label: '成本/拿货价' },
  { value: 'margin.read', label: '毛利率' },
  { value: 'settlement.read', label: '结算方式' },
  { value: 'bossRemark.read', label: '老板备注' },
];

export const operationPermissionOptions: { value: OperationPermissionKey; label: string }[] = [
  { value: 'create', label: '新增' },
  { value: 'edit', label: '编辑' },
  { value: 'delete', label: '删除' },
  { value: 'audit', label: '审核' },
  { value: 'export', label: '导出' },
];

export const allFieldPermissionKeys = fieldPermissionOptions.map((item) => item.value);
export const allOperationPermissionKeys = operationPermissionOptions.map((item) => item.value);

const operatorMenus = [
  menuKeys.dashboard,
  menuKeys.orderSalesImport,
  menuKeys.trafficConversionImport,
  menuKeys.newProductCenter,
  menuKeys.newProductWorkbench,
  menuKeys.newProductOperatorDashboard,
  menuKeys.newProductProducts,
  menuKeys.newProductAdRecommendations,
  menuKeys.storeBusinessCenter,
  menuKeys.operatorAnalysisCenter,
  menuKeys.businessAnalysisCenter,
  menuKeys.operationDiagnosis,
  menuKeys.growthOpportunities,
  menuKeys.operationTasks,
];

const leadMenus = [
  ...operatorMenus,
  menuKeys.temuProductInfoImport,
  menuKeys.temuAdReportImport,
  menuKeys.newProductBossDashboard,
  menuKeys.operatorManagement,
  menuKeys.taskSuggestions,
];

export function getRoleOption(roleCode?: string) {
  return roleCodeOptions.find((item) => item.value === roleCode);
}

export function getRoleLabel(roleCode?: string, fallbackRole?: UserRole) {
  return getRoleOption(roleCode)?.label ?? getRoleOption(fallbackRole)?.label ?? fallbackRole ?? '-';
}

export function getBaseRoleForRoleCode(roleCode: UserRoleCode): UserRole {
  return getRoleOption(roleCode)?.baseRole ?? 'operator';
}

export function getDefaultPermissionsForRoleCode(roleCode: UserRoleCode) {
  const option = getRoleOption(roleCode);
  const baseRole = option?.baseRole ?? 'operator';

  if (baseRole === 'admin') {
    return {
      role: 'admin' as UserRole,
      platform: undefined,
      platformKeys: platformOptions,
      allowedMenuKeys: allMenuKeys,
      fieldPermissionKeys: allFieldPermissionKeys,
      operationPermissionKeys: allOperationPermissionKeys,
    };
  }

  if (roleCode === '1688_sales') {
    return {
      role: 'operator' as UserRole,
      platform: '1688' as StorePlatform,
      platformKeys: ['1688'] as StorePlatform[],
      allowedMenuKeys: [
        menuKeys.business1688Products,
        menuKeys.business1688ListingTasks,
        menuKeys.business1688Images,
        menuKeys.aiImagePromptCenter,
      ],
      fieldPermissionKeys: [] as FieldPermissionKey[],
      operationPermissionKeys: ['create', 'edit'] as OperationPermissionKey[],
    };
  }

  if (roleCode === '1688_lead') {
    return {
      role: 'leader' as UserRole,
      platform: '1688' as StorePlatform,
      platformKeys: ['1688'] as StorePlatform[],
      allowedMenuKeys: [
        menuKeys.business1688Products,
        menuKeys.business1688ListingTasks,
        menuKeys.business1688Images,
        menuKeys.business1688Suppliers,
        menuKeys.business1688Settings,
        menuKeys.aiImagePromptCenter,
      ],
      fieldPermissionKeys: allFieldPermissionKeys,
      operationPermissionKeys: ['create', 'edit', 'audit', 'export'] as OperationPermissionKey[],
    };
  }

  const platform = option?.platform ?? 'TEMU';
  const isLead = baseRole === 'leader';

  return {
    role: baseRole,
    platform,
    platformKeys: [platform],
    allowedMenuKeys: isLead ? leadMenus : operatorMenus,
    fieldPermissionKeys: allFieldPermissionKeys,
    operationPermissionKeys: isLead ? ['create', 'edit', 'audit', 'export'] as OperationPermissionKey[] : ['create', 'edit'] as OperationPermissionKey[],
  };
}
