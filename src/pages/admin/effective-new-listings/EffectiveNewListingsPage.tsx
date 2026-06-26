import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useVisibleStores } from '../../../auth/useVisibleStores';
import { effectiveNewListingsDataSource } from '../../../data-source/effectiveNewListingsDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { EffectiveNewListingInput, EffectiveNewListingRecord } from '../../../types/effectiveNewListing';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const EFFECTIVE_LISTING_CHANGE_EVENT = 'effective-new-listings-change';

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonthKey(value: string) {
  return String(value || '').slice(0, 7);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${toDateKey(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function createEmptyForm(): EffectiveNewListingInput {
  return {
    platform: 'TEMU',
    storeId: '',
    siteJoinDate: toDateKey(new Date()),
    skc: '',
    remark: '',
  };
}

function EffectiveNewListingsPage({ currentUser }: { currentUser: CurrentUser }) {
  const visibleStores = useVisibleStores(currentUser);
  const [records, setRecords] = useState<EffectiveNewListingRecord[]>([]);
  const [form, setForm] = useState<EffectiveNewListingInput>(createEmptyForm);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [deleteRecord, setDeleteRecord] = useState<EffectiveNewListingRecord | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [skcSearch, setSkcSearch] = useState('');

  const storeMap = useMemo(() => new Map(visibleStores.stores.map((store) => [store.id, store])), [visibleStores.stores]);
  const monthOptions = useMemo(() => Array.from(new Set(records.map((item) => getMonthKey(item.siteJoinDate)).filter(Boolean))).sort().reverse(), [records]);
  const filteredRecords = useMemo(() => {
    const skc = skcSearch.trim().toLowerCase();
    return records.filter((item) => (
      (!monthFilter || getMonthKey(item.siteJoinDate) === monthFilter) &&
      (!storeFilter || item.storeId === storeFilter) &&
      (!skc || item.skc.toLowerCase().includes(skc))
    ));
  }, [monthFilter, records, skcSearch, storeFilter]);

  const refresh = async () => {
    setRecords(await effectiveNewListingsDataSource.load());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const resetForm = () => {
    setEditingId('');
    setError('');
    setForm(createEmptyForm());
  };

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (editingId) {
        await effectiveNewListingsDataSource.update(editingId, form);
      } else {
        await effectiveNewListingsDataSource.create(form);
      }
      resetForm();
      await refresh();
      window.dispatchEvent(new Event(EFFECTIVE_LISTING_CHANGE_EVENT));
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败');
    }
  };

  const editRecord = (record: EffectiveNewListingRecord) => {
    setEditingId(record.id);
    setError('');
    setForm({
      platform: record.platform,
      storeId: record.storeId,
      siteJoinDate: record.siteJoinDate,
      skc: record.skc,
      remark: record.remark,
    });
  };

  const removeRecord = async () => {
    if (!deleteRecord) {
      return;
    }
    try {
      await effectiveNewListingsDataSource.remove(deleteRecord.id);
      setDeleteRecord(null);
      await refresh();
      window.dispatchEvent(new Event(EFFECTIVE_LISTING_CHANGE_EVENT));
    } catch (error) {
      setError(error instanceof Error ? error.message : '删除失败');
      setDeleteRecord(null);
    }
  };

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel effective-listing-panel">
        <header>
          <div>
            <h2>有效上新录入</h2>
            <p>按店铺和 SKC 手动登记有效上新，用于首页“有效上新排名”。</p>
          </div>
          <span>{filteredRecords.length} 条</span>
        </header>

        <form className="effective-listing-form effective-listing-form-compact" onSubmit={saveRecord}>
          <label>
            平台
            <select value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}>
              {['TEMU', 'Amazon', 'TikTok', 'Shopify'].map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </label>
          <label>
            店铺
            <select value={form.storeId} onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))} required>
              <option value="">选择店铺</option>
              {visibleStores.stores.map((store) => (
                <option key={store.id} value={store.id}>{store.storeName || store.id}</option>
              ))}
            </select>
          </label>
          <label>
            加入站点时间
            <input type="date" value={form.siteJoinDate} onChange={(event) => setForm((current) => ({ ...current, siteJoinDate: event.target.value }))} required />
          </label>
          <label>
            产品 SKC 号
            <input value={form.skc} onChange={(event) => setForm((current) => ({ ...current, skc: event.target.value }))} required />
          </label>
          <label className="effective-listing-remark">
            备注
            <input value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} />
          </label>
          <div className="effective-listing-actions">
            <button type="submit" className="store-primary-button">{editingId ? '保存修改' : '新增记录'}</button>
            {editingId && <button type="button" onClick={resetForm}>取消编辑</button>}
          </div>
        </form>
        {error && <div className="excel-import-error">{error}</div>}

        <section className="import-filter-bar effective-listing-filter">
          <label>
            月份
            <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
              <option value="">全部月份</option>
              {monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </label>
          <label>
            店铺
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">全部店铺</option>
              {visibleStores.stores.map((store) => <option key={store.id} value={store.id}>{store.storeName || store.id}</option>)}
            </select>
          </label>
          <label>
            SKC
            <input value={skcSearch} onChange={(event) => setSkcSearch(event.target.value)} placeholder="搜索 SKC" />
          </label>
        </section>

        <div className="import-record-table-wrap effective-listing-table-wrap">
          <table className="import-record-table effective-listing-table">
            <thead>
              <tr>
                <th>平台</th>
                <th>店铺</th>
                <th>加入站点时间</th>
                <th>SKC</th>
                <th>备注</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.platform}</td>
                  <td><strong>{storeMap.get(record.storeId)?.storeName || record.storeName || record.storeId}</strong></td>
                  <td>{record.siteJoinDate}</td>
                  <td>{record.skc}</td>
                  <td>{record.remark || '-'}</td>
                  <td>{formatDateTime(record.updatedAt)}</td>
                  <td>
                    <div className="store-table-actions">
                      <button type="button" className="primary-action" onClick={() => editRecord(record)}>编辑</button>
                      <button type="button" className="danger-action-button" onClick={() => setDeleteRecord(record)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRecords.length === 0 && <div className="import-record-empty">暂无有效上新记录</div>}
        </div>
      </article>

      {deleteRecord && (
        <ConfirmDeleteModal
          title="确认删除这条有效上新记录吗？"
          description="删除后首页有效上新排名会同步变化。"
          onCancel={() => setDeleteRecord(null)}
          onConfirm={removeRecord}
        >
          <span>平台：{deleteRecord.platform}</span>
          <span>店铺：{storeMap.get(deleteRecord.storeId)?.storeName || deleteRecord.storeName || deleteRecord.storeId}</span>
          <span>SKC：{deleteRecord.skc}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}

export default EffectiveNewListingsPage;
