import type { CurrentUser, UserRole } from '../types/auth';

export const actionPermissionKeys = [
  'rerun-analysis',
  'manage-stores',
  'manage-operators',
  'manage-rules',
  'manage-ai',
  'manage-users',
  'ai-debug-tools',
  'rerun-ai-analysis',
  'generate-ai-advice',
  'view-data-quality',
  'manage-store-data',
] as const;

export type ActionPermissionKey = typeof actionPermissionKeys[number];

const defaultRolePermissions: Record<UserRole, ActionPermissionKey[]> = {
  admin: [...actionPermissionKeys],
  leader: ['manage-operators', 'generate-ai-advice'],
  operator: [],
};

export function getDefaultPermissionKeys(role: UserRole) {
  return defaultRolePermissions[role] ?? [];
}

export function hasPermission(currentUser: CurrentUser | null | undefined, permissionKey: ActionPermissionKey) {
  if (!currentUser) {
    return false;
  }

  if (currentUser.role === 'admin') {
    return true;
  }

  return (currentUser.permissionKeys ?? getDefaultPermissionKeys(currentUser.role)).includes(permissionKey);
}
