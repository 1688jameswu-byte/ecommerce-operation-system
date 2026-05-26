import { useEffect, useState } from 'react';
import type { CurrentUser } from '../types/auth';

interface AuthResponse {
  success: boolean;
  message?: string;
  user?: CurrentUser | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  const data = await response.json() as AuthResponse;
  return data.success && data.user ? data.user : null;
}

export async function loginCurrentUser(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json() as AuthResponse;

  if (!data.success || !data.user) {
    throw new Error(data.message || '账号或密码错误');
  }

  return data.user;
}

export async function logoutCurrentUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function changeCurrentUserPassword(password: string): Promise<CurrentUser> {
  const response = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  const data = await response.json() as AuthResponse;

  if (!data.success || !data.user) {
    throw new Error(data.message || '密码修改失败');
  }

  return data.user;
}

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then((user) => {
        if (mounted) {
          if (user) {
            window.localStorage.setItem('currentUser', JSON.stringify(user));
          } else {
            window.localStorage.removeItem('currentUser');
          }
          setCurrentUser(user);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { currentUser, loading, setCurrentUser };
}
