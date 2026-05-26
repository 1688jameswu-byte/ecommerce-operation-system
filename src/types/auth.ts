export type UserRole = 'admin' | 'leader' | 'operator';
export type MenuKey = string;

export interface CurrentUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  operatorId: string;
  teamId: string;
  allowedStoreIds?: string[];
  allowedMenuKeys?: MenuKey[];
  permissionKeys?: string[];
  passwordUpdatedAt?: string;
  forceChangePassword?: boolean;
}
