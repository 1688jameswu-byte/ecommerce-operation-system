import type { CurrentUser } from '../../../types/auth';

export interface Alibaba1688AssigneeOption extends CurrentUser {
  status?: 'active' | 'disabled';
}

interface AssigneeResponse {
  success?: boolean;
  users?: Alibaba1688AssigneeOption[];
}

function matchesAssignee(option: Alibaba1688AssigneeOption, value: string) {
  const target = value.trim();

  return [
    option.userId,
    option.username,
    option.operatorId,
    option.displayName,
  ].some((item) => String(item ?? '').trim() === target);
}

export async function loadAlibaba1688Assignees() {
  try {
    const response = await fetch('/api/auth/1688-assignees', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as AssigneeResponse;
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

export function getAssigneeValue(option: Alibaba1688AssigneeOption) {
  return option.userId || option.username || option.operatorId || option.displayName || '';
}

export function getAssigneeLabel(option: Alibaba1688AssigneeOption) {
  const name = option.displayName || option.username || option.userId;
  const account = option.username || option.userId;

  return account && account !== name ? `${name}（${account}）` : name;
}

export function hasAssigneeOption(options: Alibaba1688AssigneeOption[], value: string) {
  return options.some((option) => matchesAssignee(option, value));
}

export function formatAssigneeName(options: Alibaba1688AssigneeOption[], value?: string) {
  const target = String(value ?? '').trim();
  if (!target) {
    return '-';
  }

  const option = options.find((item) => matchesAssignee(item, target));
  return option ? getAssigneeLabel(option) : target;
}
