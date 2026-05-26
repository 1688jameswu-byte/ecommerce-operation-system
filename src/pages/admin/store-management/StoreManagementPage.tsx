import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { storeDataSource } from '../../../data-source/storeDataSource';
import type { StorePlatform, StoreRecord, StoreStatus } from '../../../types/store';
import { getStatusLabel } from '../../../utils/statusLabel';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const platforms: StorePlatform[] = ['TEMU', '1688', 'Amazon', 'TikTok', 'Shopify'];
const statuses: StoreStatus[] = ['active', 'inactive', 'disabled', 'paused', 'closed'];

type StoreForm = Pick<StoreRecord, 'storeName' | 'platform' | 'status'> &
  Partial<Pick<StoreRecord, 'platformStoreId' | 'siteCountry' | 'storeGroup' | 'remark'>>;

const emptyForm: StoreForm = {
  storeName: '',
  platform: 'TEMU',
  platformStoreId: '',
  siteCountry: '',
  status: 'active',
  storeGroup: '',
  remark: '',
};

function getPlatform(store: StoreRecord) {
  return store.platform || 'TEMU';
}

function getSiteCountry(store: StoreRecord) {
  return store.siteCountry ?? store.country ?? '';
}

function getStoreGroup(store: StoreRecord) {
  return store.storeGroup ?? store.groupName ?? '';
}

function StoreManagementPage() {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [form, setForm] = useState<StoreForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('');
  const [siteCountryFilter, setSiteCountryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeGroupFilter, setStoreGroupFilter] = useState('');
  const [deleteStoreId, setDeleteStoreId] = useState<string | null>(null);
  const editingStore = useMemo(() => stores.find((store) => store.id === editingId), [editingId, stores]);
  const siteCountryOptions = useMemo(() => Array.from(new Set(stores.map(getSiteCountry).filter(Boolean))), [stores]);
  const storeGroupOptions = useMemo(() => Array.from(new Set(stores.map(getStoreGroup).filter(Boolean))), [stores]);
  const filteredStores = useMemo(() => stores.filter((store) => (
    (!platformFilter || getPlatform(store) === platformFilter)
    && (!siteCountryFilter || getSiteCountry(store) === siteCountryFilter)
    && (!statusFilter || store.status === statusFilter)
    && (!storeGroupFilter || getStoreGroup(store) === storeGroupFilter)
  )), [platformFilter, siteCountryFilter, statusFilter, storeGroupFilter, stores]);

  const refreshStores = () => {
    setStores(storeDataSource.load());
  };

  useEffect(() => {
    refreshStores();
  }, []);

  const updateForm = (key: keyof StoreForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      storeName: form.storeName.trim(),
      platformStoreId: form.platformStoreId?.trim(),
      siteCountry: form.siteCountry?.trim(),
      storeGroup: form.storeGroup?.trim(),
      remark: form.remark?.trim(),
    };

    if (!payload.storeName) {
      return;
    }

    if (editingId) {
      storeDataSource.update(editingId, payload);
    } else {
      storeDataSource.create(payload);
    }

    resetForm();
    refreshStores();
  };

  const handleEdit = (store: StoreRecord) => {
    setEditingId(store.id);
    setForm({
      storeName: store.storeName,
      platform: getPlatform(store),
      platformStoreId: store.platformStoreId ?? '',
      siteCountry: getSiteCountry(store),
      status: store.status,
      storeGroup: getStoreGroup(store),
      remark: store.remark ?? '',
    });
  };

  const handleRemove = (id: string) => {
    storeDataSource.remove(id);
    if (editingId === id) {
      resetForm();
    }
    setDeleteStoreId(null);
    refreshStores();
  };

  return (
    <section className="excel-import-page">
      <article className="admin-placeholder-card">
        <span className="admin-status">多平台店铺基础资料</span>
        <h2>{editingId ? '编辑店铺' : '新增店铺'}</h2>
        <p>维护店铺名称、平台、站点、状态、分组和备注；店铺归属运营请到运营管理维护。</p>
        <form className="store-form-grid" onSubmit={handleSubmit}>
          {editingStore && (
            <label className="store-form-wide">
              <strong>系统ID</strong>
              <input value={editingStore.id} readOnly />
            </label>
          )}
          <label>
            <strong>店铺名称</strong>
            <input value={form.storeName} onChange={(event) => updateForm('storeName', event.target.value)} />
          </label>
          <label>
            <strong>平台</strong>
            <select value={form.platform} onChange={(event) => updateForm('platform', event.target.value)}>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          <label>
            <strong>平台店铺ID</strong>
            <input value={form.platformStoreId} onChange={(event) => updateForm('platformStoreId', event.target.value)} />
          </label>
          <label>
            <strong>站点/国家</strong>
            <input value={form.siteCountry} onChange={(event) => updateForm('siteCountry', event.target.value)} />
          </label>
          <label>
            <strong>状态</strong>
            <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {getStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <strong>店铺分组</strong>
            <input value={form.storeGroup} onChange={(event) => updateForm('storeGroup', event.target.value)} />
          </label>
          <label className="store-form-wide">
            <strong>备注</strong>
            <textarea value={form.remark} onChange={(event) => updateForm('remark', event.target.value)} />
          </label>
          <div className="store-form-actions">
            <button className="excel-clear-button store-primary-button" type="submit">
              {editingId ? '保存修改' : '新增店铺'}
            </button>
            {editingId && (
              <button className="excel-clear-button" type="button" onClick={resetForm}>
                取消编辑
              </button>
            )}
          </div>
        </form>
      </article>

      <article className="excel-preview-card">
        <header>
          <div>
            <h2>店铺列表</h2>
            <p>共维护 {stores.length} 个店铺基础资料，当前显示 {filteredStores.length} 个。</p>
          </div>
          <span>{filteredStores.length} 条</span>
        </header>
        <section className="import-filter-bar">
          <label>
            平台
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
              <option value="">全部平台</option>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </label>
          <label>
            站点/国家
            <select value={siteCountryFilter} onChange={(event) => setSiteCountryFilter(event.target.value)}>
              <option value="">全部站点/国家</option>
              {siteCountryOptions.map((siteCountry) => <option key={siteCountry} value={siteCountry}>{siteCountry}</option>)}
            </select>
          </label>
          <label>
            状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
            </select>
          </label>
          <label>
            店铺分组
            <select value={storeGroupFilter} onChange={(event) => setStoreGroupFilter(event.target.value)}>
              <option value="">全部店铺分组</option>
              {storeGroupOptions.map((storeGroup) => <option key={storeGroup} value={storeGroup}>{storeGroup}</option>)}
            </select>
          </label>
        </section>
        <div className="excel-preview-table">
          <table>
            <thead>
              <tr>
                <th>店铺名称</th>
                <th>平台</th>
                <th>平台店铺ID</th>
                <th>站点/国家</th>
                <th>店铺分组</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((store) => (
                <tr key={store.id}>
                  <td>{store.storeName}</td>
                  <td>{getPlatform(store)}</td>
                  <td>{store.platformStoreId || '-'}</td>
                  <td>{getSiteCountry(store) || '-'}</td>
                  <td>{getStoreGroup(store) || '-'}</td>
                  <td>{getStatusLabel(store.status)}</td>
                  <td>{store.updatedAt}</td>
                  <td>
                    <div className="store-table-actions">
                      <button type="button" onClick={() => handleEdit(store)}>
                        编辑
                      </button>
                      <button type="button" className="danger-action-button" onClick={() => setDeleteStoreId(store.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={8}>暂无店铺资料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      {deleteStoreId && (
        <ConfirmDeleteModal onCancel={() => setDeleteStoreId(null)} onConfirm={() => handleRemove(deleteStoreId)} />
      )}
    </section>
  );
}

export default StoreManagementPage;
