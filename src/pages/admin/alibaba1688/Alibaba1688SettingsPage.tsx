import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type { CurrentUser } from '../../../types/auth';
import type { Alibaba1688SettingRecord, Alibaba1688StoreRecord } from '../../../types/alibaba1688';
import {
  formatAssigneeName,
  getAssigneeLabel,
  getAssigneeValue,
  loadAlibaba1688Assignees,
  type Alibaba1688AssigneeOption,
} from './alibaba1688Assignees';

interface SettingGroupConfig {
  key: string;
  label: string;
  placeholder: string;
}

interface Alibaba1688SettingsPageProps {
  currentUser: CurrentUser;
}

const settingGroups: SettingGroupConfig[] = [
  { key: 'product_category', label: '分类', placeholder: '例如：饰品配件' },
  { key: 'material', label: '材质', placeholder: '例如：合金' },
  { key: 'craft', label: '工艺', placeholder: '例如：电镀' },
  { key: 'color', label: '颜色', placeholder: '例如：金色' },
  { key: 'size_unit', label: '尺寸单位', placeholder: '例如：cm' },
  { key: 'ship_from', label: '发货地', placeholder: '例如：义乌' },
  { key: 'lead_time', label: '发货时间', placeholder: '例如：48小时内' },
  { key: 'freight_template', label: '运费模板', placeholder: '例如：默认包邮模板' },
];

const emptyStoreForm = {
  storeName: '',
  shopUrl: '',
  ownerUserId: '',
  remark: '',
  isActive: true,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toSettingKey(value: string) {
  return value.trim().replace(/\s+/g, '_').toLowerCase();
}

function canManageSettings(currentUser: CurrentUser) {
  return currentUser.role === 'admin' || currentUser.role === 'leader';
}

function Alibaba1688SettingsPage({ currentUser }: Alibaba1688SettingsPageProps) {
  const canManage = canManageSettings(currentUser);
  const [stores, setStores] = useState<Alibaba1688StoreRecord[]>([]);
  const [settings, setSettings] = useState<Alibaba1688SettingRecord[]>([]);
  const [assignees, setAssignees] = useState<Alibaba1688AssigneeOption[]>([]);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [editingStoreId, setEditingStoreId] = useState('');
  const [settingInputs, setSettingInputs] = useState<Record<string, string>>({});
  const [editingSettingId, setEditingSettingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const settingsByGroup = useMemo(() => {
    return settingGroups.reduce<Record<string, Alibaba1688SettingRecord[]>>((result, group) => {
      result[group.key] = settings
        .filter((setting) => setting.settingGroup === group.key)
        .sort((first, second) => first.sortOrder - second.sortOrder || first.settingKey.localeCompare(second.settingKey));
      return result;
    }, {});
  }, [settings]);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [storePage, settingPage, assigneeOptions] = await Promise.all([
        alibaba1688DataSource.stores.loadPage({ page: 1, pageSize: 100 }),
        alibaba1688DataSource.settings.loadPage({ page: 1, pageSize: 100 }),
        loadAlibaba1688Assignees(),
      ]);

      setStores(storePage.records);
      setSettings(settingPage.records);
      setAssignees(assigneeOptions);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function resetStoreForm() {
    setStoreForm(emptyStoreForm);
    setEditingStoreId('');
  }

  function beginEditStore(store: Alibaba1688StoreRecord) {
    setStoreForm({
      storeName: store.storeName,
      shopUrl: store.shopUrl ?? '',
      ownerUserId: store.ownerUserId ?? '',
      remark: store.remark ?? '',
      isActive: store.isActive,
    });
    setEditingStoreId(store.id);
  }

  async function handleSubmitStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看 1688 设置，不能修改。');
      return;
    }

    const storeName = storeForm.storeName.trim();
    if (!storeName) {
      setError('请先填写 1688 店铺名称。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        ...storeForm,
        storeName,
        shopUrl: storeForm.shopUrl.trim(),
        ownerUserId: storeForm.ownerUserId.trim(),
        remark: storeForm.remark.trim(),
      };
      if (editingStoreId) {
        await alibaba1688DataSource.stores.update(editingStoreId, payload);
        setMessage('1688 店铺映射已更新。');
      } else {
        await alibaba1688DataSource.stores.create(payload);
        setMessage('1688 店铺映射已新增。');
      }
      resetStoreForm();
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStore(store: Alibaba1688StoreRecord) {
    if (!canManage) {
      setError('当前账号只能查看 1688 设置，不能修改。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.stores.update(store.id, { isActive: !store.isActive });
      setMessage(store.isActive ? '店铺已停用。' : '店铺已启用。');
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveStore(store: Alibaba1688StoreRecord) {
    if (!canManage) {
      setError('当前账号只能查看 1688 设置，不能删除。');
      return;
    }
    if (!window.confirm(`确认删除 1688 店铺映射“${store.storeName}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.stores.remove(store.id);
      setMessage('1688 店铺映射已删除。');
      if (editingStoreId === store.id) {
        resetStoreForm();
      }
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitSetting(group: SettingGroupConfig) {
    if (!canManage) {
      setError('当前账号只能查看基础配置，不能修改。');
      return;
    }

    const text = (settingInputs[group.key] ?? '').trim();
    if (!text) {
      setError(`请先填写${group.label}。`);
      return;
    }

    const groupSettings = settingsByGroup[group.key] ?? [];
    const editingSetting = groupSettings.find((setting) => setting.id === editingSettingId);
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (editingSetting) {
        await alibaba1688DataSource.settings.update(editingSetting.id, {
          settingKey: toSettingKey(text),
          settingValue: text,
        });
        setMessage(`${group.label}已更新。`);
        setEditingSettingId('');
      } else {
        await alibaba1688DataSource.settings.create({
          settingGroup: group.key,
          settingKey: toSettingKey(text),
          settingValue: text,
          sortOrder: groupSettings.length + 1,
          isActive: true,
        });
        setMessage(`${group.label}已新增。`);
      }
      setSettingInputs((current) => ({ ...current, [group.key]: '' }));
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function beginEditSetting(setting: Alibaba1688SettingRecord) {
    setEditingSettingId(setting.id);
    setSettingInputs((current) => ({
      ...current,
      [setting.settingGroup]: setting.settingValue || setting.settingKey,
    }));
  }

  async function handleToggleSetting(setting: Alibaba1688SettingRecord) {
    if (!canManage) {
      setError('当前账号只能查看基础配置，不能修改。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.settings.update(setting.id, { isActive: !setting.isActive });
      setMessage(setting.isActive ? '配置项已停用。' : '配置项已启用。');
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSetting(setting: Alibaba1688SettingRecord) {
    if (!canManage) {
      setError('当前账号只能查看基础配置，不能删除。');
      return;
    }
    if (!window.confirm(`确认删除配置项“${setting.settingValue || setting.settingKey}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.settings.remove(setting.id);
      setMessage('配置项已删除。');
      if (editingSettingId === setting.id) {
        setEditingSettingId('');
      }
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="alibaba-settings-page">
      {error && <div className="alibaba-settings-error"><strong>{error}</strong></div>}
      {message && <p className="alibaba-settings-message">{message}</p>}

      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 店铺映射</h2>
          </div>
          <span>{stores.length} 个店铺</span>
        </header>
        {canManage && (
          <form className="alibaba-store-form" onSubmit={handleSubmitStore}>
            <label>
              店铺名称
              <input
                value={storeForm.storeName}
                onChange={(event) => setStoreForm((current) => ({ ...current, storeName: event.target.value }))}
                placeholder="例如：1688义乌饰品店"
              />
            </label>
            <label>
              店铺链接
              <input
                value={storeForm.shopUrl}
                onChange={(event) => setStoreForm((current) => ({ ...current, shopUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              负责人账号
              <select
                value={storeForm.ownerUserId}
                onChange={(event) => setStoreForm((current) => ({ ...current, ownerUserId: event.target.value }))}
              >
                <option value="">请选择 1688 业务员</option>
                {storeForm.ownerUserId && !assignees.some((assignee) => getAssigneeValue(assignee) === storeForm.ownerUserId) && (
                  <option value={storeForm.ownerUserId}>{storeForm.ownerUserId}</option>
                )}
                {assignees.map((assignee) => {
                  const value = getAssigneeValue(assignee);
                  return (
                    <option key={value} value={value}>
                      {getAssigneeLabel(assignee)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="alibaba-form-wide">
              备注
              <input
                value={storeForm.remark}
                onChange={(event) => setStoreForm((current) => ({ ...current, remark: event.target.value }))}
                placeholder="可填写站点、用途或对应关系"
              />
            </label>
            <div className="alibaba-form-actions">
              <button type="submit" className="store-primary-button" disabled={saving}>
                {editingStoreId ? '保存修改' : '新增店铺'}
              </button>
              {editingStoreId && (
                <button type="button" onClick={resetStoreForm} disabled={saving}>
                  取消
                </button>
              )}
            </div>
          </form>
        )}
        <div className="alibaba-store-list">
          {stores.map((store) => (
            <article key={store.id}>
              <div>
                <strong>{store.storeName}</strong>
                <span>{store.shopUrl || '未填写店铺链接'}</span>
                <em>{store.ownerUserId ? `负责人：${formatAssigneeName(assignees, store.ownerUserId)}` : '未绑定负责人'}</em>
                {store.remark && <em>{store.remark}</em>}
              </div>
              <div className="alibaba-row-actions">
                <span className={store.isActive ? 'alibaba-state-on' : 'alibaba-state-off'}>{store.isActive ? '启用' : '停用'}</span>
                {canManage && (
                  <>
                    <button type="button" onClick={() => beginEditStore(store)} disabled={saving}>编辑</button>
                    <button type="button" onClick={() => handleToggleStore(store)} disabled={saving}>{store.isActive ? '停用' : '启用'}</button>
                    <button type="button" className="danger-action-button" onClick={() => handleRemoveStore(store)} disabled={saving}>删除</button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!loading && stores.length === 0 && <div className="admin-home-empty">暂无可见 1688 店铺映射</div>}
        </div>
      </section>

      <section className="alibaba-setting-groups">
        {settingGroups.map((group) => {
          const groupSettings = settingsByGroup[group.key] ?? [];
          const editingInGroup = groupSettings.some((setting) => setting.id === editingSettingId);

          return (
            <article key={group.key} className="excel-record-panel alibaba-setting-group">
              <header>
                <div>
                  <h2>{group.label}</h2>
                </div>
                <span>{groupSettings.length} 项</span>
              </header>
              {canManage && (
                <div className="alibaba-setting-input">
                  <input
                    value={settingInputs[group.key] ?? ''}
                    onChange={(event) => setSettingInputs((current) => ({ ...current, [group.key]: event.target.value }))}
                    placeholder={group.placeholder}
                  />
                  <button type="button" className="store-primary-button" onClick={() => handleSubmitSetting(group)} disabled={saving}>
                    {editingInGroup ? '保存' : '添加'}
                  </button>
                  {editingInGroup && (
                    <button type="button" onClick={() => {
                      setEditingSettingId('');
                      setSettingInputs((current) => ({ ...current, [group.key]: '' }));
                    }} disabled={saving}>
                      取消
                    </button>
                  )}
                </div>
              )}
              <div className="alibaba-setting-list">
                {groupSettings.map((setting) => (
                  <span key={setting.id} className={setting.isActive ? '' : 'disabled'}>
                    <b>{setting.settingValue || setting.settingKey}</b>
                    <em>{setting.isActive ? '启用' : '停用'}</em>
                    {canManage && (
                      <>
                        <button type="button" onClick={() => beginEditSetting(setting)} disabled={saving}>编辑</button>
                        <button type="button" onClick={() => handleToggleSetting(setting)} disabled={saving}>{setting.isActive ? '停用' : '启用'}</button>
                        <button type="button" className="danger-action-button" onClick={() => handleRemoveSetting(setting)} disabled={saving}>删除</button>
                      </>
                    )}
                  </span>
                ))}
                {!loading && groupSettings.length === 0 && <em>暂无配置</em>}
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}

export default Alibaba1688SettingsPage;
