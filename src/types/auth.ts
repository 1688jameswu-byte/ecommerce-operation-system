import type { StorePlatform } from './store';

export type UserRole = 'admin' | 'leader' | 'operator';
export type UserRoleCode =
  | UserRole
  | 'temu_lead'
  | 'temu_operator'
  | '1688_lead'
  | '1688_sales'
  | 'amazon_lead'
  | 'amazon_operator'
  | 'tiktok_lead'
  | 'tiktok_operator';
export type MenuKey = string;
export type FieldPermissionKey =
  | 'supplier.read'
  | 'cost.read'
  | 'margin.read'
  | 'settlement.read'
  | 'bossRemark.read';
export type OperationPermissionKey = 'create' | 'edit' | 'delete' | 'audit' | 'export';

export interface CurrentUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleCode?: UserRoleCode;
  platform?: StorePlatform;
  operatorId: string;
  teamId: string;
  platformKeys?: StorePlatform[];
  allowedStoreIds?: string[];
  allowedMenuKeys?: MenuKey[];
  permissionKeys?: string[];
  fieldPermissionKeys?: FieldPermissionKey[];
  operationPermissionKeys?: OperationPermissionKey[];
  passwordUpdatedAt?: string;
  forceChangePassword?: boolean;
}
