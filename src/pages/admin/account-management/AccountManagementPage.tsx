import { FormEvent, useEffect, useState } from 'react';
import { allMenuKeys, menuGroups } from '../menuKeys';
import type { CurrentUser, UserRole } from '../../../types/auth';
import type { StoreRecord } from '../../../types/store';

type UserStatus = 'active' | 'disabled';

interface ManagedUser extends CurrentUser {
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  leader: '组长',
  operator: '运营',
};

const statusLabels: Record<UserStatus, string> = {
  active: '启用',
  disabled: '停用',
};

function formatPasswordTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

const emptyForm = {
  username: '',
  displayName: '',
  role: 'operator' as UserRole,
  password: '',
  status: 'active' as UserStatus,
  allowedStoreIds: [] as string[],
  allowedMenuKeys: [] as string[],
};

const menuKeyAliases: Record<string, string> = {
  'store-data': 'store-business-center',
  'store-business': 'store-business-center',
  'storeBusinessCenter': 'store-business-center',
  'operation-data': 'operator-analysis-center',
  'operator-analysis': 'operator-analysis-center',
  'operatorAnalysisCenter': 'operator-analysis-center',
  'operator-performance': 'operator-analysis-center',
};

function normalizeMenuKey(key: string) {
  return menuKeyAliases[key] ?? key;
}

function expandMenuKeys(keys: string[]) {
  const keySet = new Set(keys.map(normalizeMenuKey));
  menuGroups.forEach((group) => {
    if (keySet.has(group.key)) {
      group.children.forEach((child) => keySet.add(child.key));
      if (group.children.some((child) => child.key !== group.key)) {
        keySet.delete(group.key);
      }
    }
  });
  return Array.from(keySet);
}

function AccountManagementPage({ currentUser }: { currentUser: CurrentUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingUserId, setEditingUserId] = useState('');
  const [message, setMessage] = useState('');

  async function loadUsers() {
    const response = await fetch('/api/auth/users', { credentials: 'include', cache: 'no-store' });
    const data = await response.json() as { success: boolean; users?: ManagedUser[]; message?: string };

    if (!data.success) {
      throw new Error(data.message || '账号读取失败');
    }

    setUsers(data.users ?? []);
  }

  useEffect(() => {
    loadUsers().catch((error) => setMessage(error instanceof Error ? error.message : '账号读取失败'));
    fetch('/api/stores', { cache: 'no-store' })
      .then((response) => response.json() as Promise<StoreRecord[]>)
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  if (currentUser.role !== 'admin') {
    return (
      <section className="excel-record-panel account-page">
        <header>
          <div>
            <h2>账号管理</h2>
            <p>仅管理员可访问。</p>
          </div>
        </header>
      </section>
    );
  }

  function getAuthorizedStoreIds(user: Pick<ManagedUser, 'role' | 'allowedStoreIds'>) {
    if (user.role === 'admin') {
      return stores.map((store) => store.id || store.storeName).filter(Boolean);
    }

    const allowedKeys = new Set((user.allowedStoreIds ?? []).map(String));
    const matchedStoreIds = stores
      .filter((store) => allowedKeys.has(store.id) || allowedKeys.has(store.storeName))
      .map((store) => store.id || store.storeName)
      .filter(Boolean);

    return matchedStoreIds.length > 0 ? matchedStoreIds : Array.from(allowedKeys);
  }

  function startEdit(user: ManagedUser) {
    setEditingUserId(user.userId);
    setForm({
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      password: '',
      status: user.status,
      allowedStoreIds: getAuthorizedStoreIds(user),
      allowedMenuKeys: expandMenuKeys(user.allowedMenuKeys ?? []),
    });
    setMessage('正在编辑账号，留空密码则不修改密码。');
  }

  function resetForm() {
    setEditingUserId('');
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      if (editingUserId === currentUser.userId && !form.allowedMenuKeys.includes('account-management')) {
        throw new Error('不能移除当前账号的账号管理权限');
      }

      const payload = {
        ...form,
        allowedMenuKeys: Array.from(new Set(form.allowedMenuKeys.map(normalizeMenuKey))),
      };
      const url = editingUserId ? `/api/auth/users/${encodeURIComponent(editingUserId)}` : '/api/auth/users';
      const response = await fetch(url, {
        method: editingUserId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { success: boolean; message?: string };

      if (!data.success) {
        throw new Error(data.message || '保存失败');
      }

      resetForm();
      setMessage(editingUserId ? '账号已更新' : '账号已新增');
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function updateStatus(user: ManagedUser, status: UserStatus) {
    if (user.userId === currentUser.userId) {
      setMessage('不能停用当前登录账号');
      return;
    }

    if (!window.confirm(`确认${status === 'disabled' ? '停用' : '启用'}账号 ${user.username} 吗？`)) {
      return;
    }

    const response = await fetch(`/api/auth/users/${encodeURIComponent(user.userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...user, status }),
    });
    const data = await response.json() as { success: boolean; message?: string };

    if (!data.success) {
      setMessage(data.message || '状态更新失败');
      return;
    }

    setMessage('状态已更新');
    await loadUsers();
  }

  async function deleteUser(user: ManagedUser) {
    if (user.username === 'admin' || user.userId === 'user-admin') {
      setMessage('默认管理员账号不能删除');
      return;
    }

    if (user.userId === currentUser.userId) {
      setMessage('不能删除当前登录账号');
      return;
    }

    const confirmed = window.prompt(`强确认删除账号：请输入用户名 ${user.username}`);
    if (confirmed !== user.username) {
      return;
    }

    const response = await fetch(`/api/auth/users/${encodeURIComponent(user.userId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await response.json() as { success: boolean; message?: string };

    if (!data.success) {
      setMessage(data.message || '删除失败');
      return;
    }

    if (editingUserId === user.userId) {
      resetForm();
    }
    setMessage('账号已删除');
    await loadUsers();
  }

  async function resetPassword(user: ManagedUser) {
    if (!window.confirm(`确认将账号 ${user.username} 的密码重置为默认密码 123456 吗？`)) {
      return;
    }

    const response = await fetch(`/api/auth/users/${encodeURIComponent(user.userId)}/reset-password`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json() as { success: boolean; message?: string };

    if (!data.success) {
      setMessage(data.message || '密码重置失败');
      return;
    }

    setMessage('密码已重置为默认密码 123456');
    await loadUsers();
  }

  function renderAccountFormFields(isEditing: boolean) {
    return (
      <>
        <div className="account-form-section">
          <h3>基础信息</h3>
          <div className="account-basic-grid">
            <label>
              用户名
              <input
                disabled={isEditing}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
            </label>
            <label>
              显示名称
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label>
              角色
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
                <option value="admin">管理员</option>
                <option value="leader">组长</option>
                <option value="operator">运营</option>
              </select>
            </label>
            <label>
              状态
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label>
              {isEditing ? '新密码' : '初始密码'}
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="account-form-section">
          <h3>权限配置</h3>
          <div className="account-permission-grid">
            <section className="account-permission-card">
              <header>
                <strong>可访问菜单</strong>
                {form.role === 'admin' && <span>管理员默认拥有全部菜单权限</span>}
              </header>
              <div className="account-menu-tree">
                {menuGroups.map((group) => (
                  <section key={group.key} className="account-menu-group">
                    <strong>{group.label}</strong>
                    <div className="account-checkbox-grid menu">
                      {group.children.map((item) => (
                        <label key={item.key}>
                          <input
                            checked={form.role === 'admin' || form.allowedMenuKeys.includes(item.key)}
                            disabled={form.role === 'admin'}
                            type="checkbox"
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setForm({
                                ...form,
                                allowedMenuKeys: checked
                                  ? Array.from(new Set([...form.allowedMenuKeys, item.key]))
                                  : form.allowedMenuKeys.filter((key) => key !== item.key),
                              });
                            }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="account-permission-card">
              <header>
                <strong>授权店铺</strong>
                <span>{getAuthorizedStoreIds({ role: form.role, allowedStoreIds: form.allowedStoreIds }).length} 个已选</span>
              </header>
              <div className="account-checkbox-grid stores">
                {stores.map((store) => {
                  const storeId = store.id || store.storeName;

                  return (
                    <label key={storeId}>
                      <input
                        checked={form.allowedStoreIds.includes(storeId)}
                        type="checkbox"
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setForm({
                            ...form,
                            allowedStoreIds: checked
                              ? Array.from(new Set([...form.allowedStoreIds, storeId]))
                              : form.allowedStoreIds.filter((id) => id !== storeId),
                          });
                        }}
                      />
                      {store.storeName}
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="account-page">
      <form className="excel-record-panel account-form" onSubmit={handleSubmit}>
        <header>
          <div>
            <h2>新增账号</h2>
            <p>未填写密码时默认使用 123456，首次登录后必须修改密码。</p>
          </div>
        </header>

        {renderAccountFormFields(false)}

        <div className="account-form-actions">
          <button type="submit">新增账号</button>
        </div>
        {message && <p className="account-message">{message}</p>}
      </form>

      <section className="excel-record-panel">
        <header>
          <div>
            <h2>账号列表</h2>
            <p>不展示 passwordHash，停用后不可登录。</p>
          </div>
          <span>{users.length} 个账号</span>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>显示名称</th>
                <th>角色</th>
                <th>状态</th>
                <th>授权店铺数量</th>
                <th>可访问菜单数量</th>
                <th>密码状态</th>
                <th>密码最后修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>{user.username}</td>
                  <td>{user.displayName}</td>
                  <td>{roleLabels[user.role]}</td>
                  <td>{statusLabels[user.status]}</td>
                  <td>{getAuthorizedStoreIds(user).length}</td>
                  <td>{user.role === 'admin' ? allMenuKeys.length : user.allowedMenuKeys?.length ?? 0}</td>
                  <td>{user.forceChangePassword ? '需修改' : '正常'}</td>
                  <td>{formatPasswordTime(user.passwordUpdatedAt)}</td>
                  <td className="account-table-actions">
                    <button type="button" onClick={() => startEdit(user)}>编辑</button>
                    <button type="button" onClick={() => resetPassword(user)}>重置密码</button>
                    <button
                      type="button"
                      onClick={() => updateStatus(user, user.status === 'active' ? 'disabled' : 'active')}
                    >
                      {user.status === 'active' ? '停用' : '启用'}
                    </button>
                    <button type="button" onClick={() => deleteUser(user)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingUserId && (
        <div className="account-modal-backdrop" role="presentation" onClick={resetForm}>
          <form
            className="account-edit-modal"
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="account-edit-title">编辑账号</h2>
                <p>留空密码则保持原密码不变。</p>
              </div>
              <button type="button" aria-label="关闭编辑弹窗" onClick={resetForm}>×</button>
            </header>

            <div className="account-edit-modal-body">
              {renderAccountFormFields(true)}
              {message && <p className="account-message">{message}</p>}
            </div>

            <div className="account-edit-modal-actions">
              <button type="button" onClick={resetForm}>取消</button>
              <button type="submit">保存修改</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default AccountManagementPage;
