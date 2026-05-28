import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { operatorDataSource } from '../../../data-source/operatorDataSource';
import { storeDataSource } from '../../../data-source/storeDataSource';
import { storeOperatorDataSource } from '../../../data-source/storeOperatorDataSource';
import { referenceDataService } from '../../../services/referenceDataService';
import type { OperatorRecord } from '../../../types/operator';
import type { StoreRecord } from '../../../types/store';
import type { StoreOperatorRelation, StoreOperatorRelationStatus, StoreOperatorRole } from '../../../types/storeOperator';
import { getStatusLabel } from '../../../utils/statusLabel';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

type OperatorForm = Pick<OperatorRecord, 'operatorName' | 'groupName' | 'level' | 'status' | 'remark'>;
type RelationForm = Pick<StoreOperatorRelation, 'storeId' | 'operatorId' | 'platform' | 'role' | 'status' | 'startDate' | 'endDate' | 'remark'>;

const emptyOperator: OperatorForm = { operatorName: '', groupName: '', level: '', status: 'active', remark: '' };
const emptyRelation: RelationForm = { storeId: '', operatorId: '', platform: 'TEMU', role: 'primary', status: 'active', startDate: '', endDate: '', remark: '' };
const platforms = ['TEMU', '1688', 'Amazon', 'TikTok', 'Shopify'];
const roles: StoreOperatorRole[] = ['primary', 'assistant', 'temporary'];
const statuses: StoreOperatorRelationStatus[] = ['active', 'inactive'];
const roleLabels: Record<string, string> = {
  primary: '主负责人',
  assistant: '协助运营',
  temporary: '临时负责',
};

function getRoleLabel(role?: string) {
  return role ? roleLabels[role] || role : '-';
}

function OperatorManagementPage() {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [relations, setRelations] = useState<StoreOperatorRelation[]>([]);
  const [operatorForm, setOperatorForm] = useState<OperatorForm>(emptyOperator);
  const [relationForm, setRelationForm] = useState<RelationForm>(emptyRelation);
  const [editingOperatorId, setEditingOperatorId] = useState('');
  const [editingRelationId, setEditingRelationId] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'operator' | 'relation'; id: string } | null>(null);

  const storeMap = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const storeByName = useMemo(() => new Map(stores.map((store) => [store.storeName, store])), [stores]);
  const operatorMap = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators]);
  const getRelationPlatform = (relation: StoreOperatorRelation) => {
    const store = storeMap.get(relation.storeId) || (relation.storeName ? storeByName.get(relation.storeName) : undefined);
    return relation.platform || store?.platform || 'TEMU';
  };
  const filteredRelations = useMemo(() => relations.filter((relation) => (
    (!platformFilter || getRelationPlatform(relation) === platformFilter) &&
    (!operatorFilter || relation.operatorId === operatorFilter) &&
    (!statusFilter || relation.status === statusFilter)
  )), [operatorFilter, platformFilter, relations, statusFilter, storeByName, storeMap]);

  const refreshAll = async () => {
    try {
      const referenceData = await referenceDataService.loadAll();
      setStores(referenceData.stores);
      setOperators(referenceData.operators);
      setRelations(referenceData.relations);
    } catch {
      setStores([]);
      setOperators([]);
      setRelations([]);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const saveOperator = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!operatorForm.operatorName?.trim()) {
      setMessage('请填写运营姓名。');
      return;
    }

    if (editingOperatorId) {
      operatorDataSource.update(editingOperatorId, operatorForm);
    } else {
      operatorDataSource.create(operatorForm);
    }

    setOperatorForm(emptyOperator);
    setEditingOperatorId('');
    setMessage('运营人员已保存。');
    void refreshAll();
  };

  const saveRelation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const store = storeMap.get(relationForm.storeId);
    const operator = operatorMap.get(relationForm.operatorId);

    if (!store || !operator) {
      setMessage('请选择店铺和运营。');
      return;
    }

    const payload = {
      ...relationForm,
      storeName: store.storeName,
      platform: relationForm.platform || store.platform || 'TEMU',
      operatorName: operator.operatorName,
    };

    if (editingRelationId) {
      storeOperatorDataSource.update(editingRelationId, payload);
    } else {
      storeOperatorDataSource.create(payload);
    }

    setRelationForm(emptyRelation);
    setEditingRelationId('');
    setMessage('店铺-运营关系已保存。');
    void refreshAll();
  };

  const editOperator = (operator: OperatorRecord) => {
    setEditingOperatorId(operator.id);
    setOperatorForm({
      operatorName: operator.operatorName,
      groupName: operator.groupName || '',
      level: operator.level || '',
      status: operator.status || 'active',
      remark: operator.remark || '',
    });
  };

  const editRelation = (relation: StoreOperatorRelation) => {
    const store = storeMap.get(relation.storeId) || (relation.storeName ? storeByName.get(relation.storeName) : undefined);
    setEditingRelationId(relation.id);
    setRelationForm({
      storeId: store?.id || relation.storeId,
      operatorId: relation.operatorId,
      platform: relation.platform || store?.platform || 'TEMU',
      role: relation.role || 'primary',
      status: relation.status || 'active',
      startDate: relation.startDate || '',
      endDate: relation.endDate || '',
      remark: relation.remark || '',
    });
  };

  const removeOperator = (id: string) => {
    operatorDataSource.remove(id);
    if (editingOperatorId === id) {
      setEditingOperatorId('');
      setOperatorForm(emptyOperator);
    }
    setMessage('运营人员已删除。');
    setDeleteTarget(null);
    void refreshAll();
  };

  const removeRelation = (id: string) => {
    storeOperatorDataSource.remove(id);
    if (editingRelationId === id) {
      setEditingRelationId('');
      setRelationForm(emptyRelation);
    }
    setMessage('店铺-运营关系已删除。');
    setDeleteTarget(null);
    void refreshAll();
  };

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel operator-filter-panel">
        <header>
          <div>
            <h2>运营关系筛选</h2>
            <p>筛选只影响下方关系列表展示，不修改原始数据。</p>
          </div>
          <span>{filteredRelations.length} / {relations.length} 条</span>
        </header>
        <div className="operator-filter-grid">
          <label>
            <strong>平台筛选</strong>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
              <option value="">全部平台</option>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </label>
          <label>
            <strong>运营筛选</strong>
            <select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}>
              <option value="">全部运营</option>
              {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.operatorName}</option>)}
            </select>
          </label>
          <label>
            <strong>状态筛选</strong>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
            </select>
          </label>
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>运营人员管理</h2>
            <p>维护运营姓名、组别、职级、状态和备注。</p>
          </div>
          <span>{operators.length} 人</span>
        </header>

        <form className="operator-form-grid" onSubmit={saveOperator}>
          <label>
            <strong>运营姓名</strong>
            <input value={operatorForm.operatorName || ''} onChange={(event) => setOperatorForm({ ...operatorForm, operatorName: event.target.value })} />
          </label>
          <label>
            <strong>组别</strong>
            <input value={operatorForm.groupName || ''} onChange={(event) => setOperatorForm({ ...operatorForm, groupName: event.target.value })} />
          </label>
          <label>
            <strong>职级</strong>
            <input value={operatorForm.level || ''} onChange={(event) => setOperatorForm({ ...operatorForm, level: event.target.value })} />
          </label>
          <label>
            <strong>状态</strong>
            <select value={operatorForm.status || 'active'} onChange={(event) => setOperatorForm({ ...operatorForm, status: event.target.value })}>
              <option value="active">{getStatusLabel('active')}</option>
              <option value="inactive">{getStatusLabel('inactive')}</option>
            </select>
          </label>
          <label className="operator-form-wide">
            <strong>备注</strong>
            <input value={operatorForm.remark || ''} onChange={(event) => setOperatorForm({ ...operatorForm, remark: event.target.value })} />
          </label>
          <button className="excel-clear-button primary-action" type="submit">{editingOperatorId ? '保存编辑' : '新增运营'}</button>
        </form>

        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr><th>运营姓名</th><th>组别</th><th>职级</th><th>状态</th><th>备注</th><th>操作</th></tr>
            </thead>
            <tbody>
              {operators.map((operator) => (
                <tr key={operator.id}>
                  <td><strong>{operator.operatorName}</strong></td>
                  <td>{operator.groupName || '-'}</td>
                  <td>{operator.level || '-'}</td>
                  <td><span className={`import-status import-status-${operator.status === 'inactive' ? 'closed' : 'success'}`}>{getStatusLabel(operator.status)}</span></td>
                  <td>{operator.remark || '-'}</td>
                  <td className="operator-actions">
                    <button type="button" onClick={() => editOperator(operator)}>编辑</button>
                    <button type="button" className="danger-action-button" onClick={() => setDeleteTarget({ type: 'operator', id: operator.id })}>删除</button>
                  </td>
                </tr>
              ))}
              {operators.length === 0 && <tr><td colSpan={6}>暂无运营人员</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>店铺-运营关系管理</h2>
            <p>从现有店铺列表选择店铺，本页不维护店铺基础资料。</p>
          </div>
          <span>{filteredRelations.length} 条</span>
        </header>

        <form className="operator-form-grid" onSubmit={saveRelation}>
          <label>
            <strong>店铺</strong>
            <select
              value={relationForm.storeId}
              onChange={(event) => {
                const store = storeMap.get(event.target.value);
                setRelationForm({
                  ...relationForm,
                  storeId: event.target.value,
                  platform: store?.platform && platforms.includes(store.platform) ? store.platform : relationForm.platform || 'TEMU',
                });
              }}
            >
              <option value="">请选择店铺</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}{store.platform ? ` / ${store.platform}` : ''}</option>)}
            </select>
          </label>
          <label>
            <strong>平台</strong>
            <select value={relationForm.platform || 'TEMU'} onChange={(event) => setRelationForm({ ...relationForm, platform: event.target.value })}>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </label>
          <label>
            <strong>运营</strong>
            <select value={relationForm.operatorId} onChange={(event) => setRelationForm({ ...relationForm, operatorId: event.target.value })}>
              <option value="">请选择运营</option>
              {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.operatorName}</option>)}
            </select>
          </label>
          <label>
            <strong>负责角色</strong>
            <select value={relationForm.role} onChange={(event) => setRelationForm({ ...relationForm, role: event.target.value })}>
              {roles.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
            </select>
          </label>
          <label>
            <strong>开始日期</strong>
            <input type="date" value={relationForm.startDate} onChange={(event) => setRelationForm({ ...relationForm, startDate: event.target.value })} />
          </label>
          <label>
            <strong>结束日期</strong>
            <input type="date" value={relationForm.endDate} onChange={(event) => setRelationForm({ ...relationForm, endDate: event.target.value })} />
          </label>
          <label>
            <strong>状态</strong>
            <select value={relationForm.status} onChange={(event) => setRelationForm({ ...relationForm, status: event.target.value as RelationForm['status'] })}>
              {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
            </select>
          </label>
          <label className="operator-form-wide">
            <strong>备注</strong>
            <input value={relationForm.remark} onChange={(event) => setRelationForm({ ...relationForm, remark: event.target.value })} />
          </label>
          <button className="excel-clear-button primary-action" type="submit">{editingRelationId ? '保存编辑' : '新增关系'}</button>
        </form>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>关系列表展示</h2>
            <p>展示店铺、平台、运营、组别、角色、状态和负责周期。</p>
          </div>
          {message && <span>{message}</span>}
        </header>

        <div className="import-record-table-wrap">
          <table className="import-record-table operator-relation-table">
            <thead>
              <tr><th>店铺名称</th><th>平台</th><th>运营姓名</th><th>组别</th><th>角色</th><th>状态</th><th>开始日期</th><th>结束日期</th><th>操作</th></tr>
            </thead>
            <tbody>
              {filteredRelations.map((relation) => {
                const store = storeMap.get(relation.storeId) || (relation.storeName ? storeByName.get(relation.storeName) : undefined);
                const operator = operatorMap.get(relation.operatorId);
                return (
                  <tr key={relation.id}>
                    <td><strong>{store?.storeName || relation.storeName || '-'}</strong></td>
                    <td>{getRelationPlatform(relation)}</td>
                    <td>{operator?.operatorName || relation.operatorName || '-'}</td>
                    <td>{operator?.groupName || '-'}</td>
                    <td>{getRoleLabel(relation.role)}</td>
                    <td><span className={`import-status import-status-${relation.status === 'inactive' ? 'closed' : 'success'}`}>{getStatusLabel(relation.status)}</span></td>
                    <td>{relation.startDate || '-'}</td>
                    <td>{relation.endDate || '-'}</td>
                    <td className="operator-actions">
                      <button type="button" onClick={() => editRelation(relation)}>编辑</button>
                      <button type="button" className="danger-action-button" onClick={() => setDeleteTarget({ type: 'relation', id: relation.id })}>删除</button>
                    </td>
                  </tr>
                );
              })}
              {filteredRelations.length === 0 && <tr><td colSpan={9}>暂无匹配的店铺-运营关系</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {deleteTarget && (
        <ConfirmDeleteModal
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget.type === 'operator') {
              removeOperator(deleteTarget.id);
            } else {
              removeRelation(deleteTarget.id);
            }
          }}
        />
      )}
    </section>
  );
}

export default OperatorManagementPage;
