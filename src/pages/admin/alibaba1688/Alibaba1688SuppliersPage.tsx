import { useEffect, useState, type FormEvent } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type { CurrentUser } from '../../../types/auth';
import type { Alibaba1688SupplierRecord } from '../../../types/alibaba1688';

interface Alibaba1688SuppliersPageProps {
  currentUser: CurrentUser;
}

const supplyStabilityOptions = [
  { value: '', label: '未评估' },
  { value: 'stable', label: '稳定' },
  { value: 'normal', label: '一般' },
  { value: 'unstable', label: '不稳定' },
  { value: 'backup', label: '备用' },
];

const costVisibleLevelOptions = [
  { value: 'restricted', label: '管理员/主管可见' },
  { value: 'manager', label: '仅管理层可见' },
  { value: 'public', label: '内部可见' },
];

const emptySupplierForm = {
  supplierName: '',
  contactName: '',
  contactPhone: '',
  shopUrl: '',
  mainCategories: '',
  supplyStability: '',
  minOrderQuantity: '0',
  leadTimeDays: '0',
  address: '',
  costVisibleLevel: 'restricted',
  isActive: true,
  remark: '',
};

function canManage1688(currentUser: CurrentUser) {
  return currentUser.role === 'admin' || currentUser.role === 'leader';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toInteger(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
}

function formatStability(value?: string) {
  return supplyStabilityOptions.find((item) => item.value === value)?.label ?? value ?? '-';
}

function formatCostVisibleLevel(value?: string) {
  return costVisibleLevelOptions.find((item) => item.value === value)?.label ?? value ?? '-';
}

function Alibaba1688SuppliersPage({ currentUser }: Alibaba1688SuppliersPageProps) {
  const canManage = canManage1688(currentUser);
  const [suppliers, setSuppliers] = useState<Alibaba1688SupplierRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadSuppliers(nextKeyword = keyword) {
    setLoading(true);
    setError('');

    try {
      const page = await alibaba1688DataSource.suppliers.loadPage({
        page: 1,
        pageSize: 100,
        keyword: nextKeyword.trim(),
      });
      setSuppliers(page.records);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSuppliers('');
  }, []);

  function resetSupplierForm() {
    setSupplierForm(emptySupplierForm);
    setEditingSupplierId('');
    setIsEditorOpen(false);
  }

  function beginCreateSupplier() {
    setSupplierForm(emptySupplierForm);
    setEditingSupplierId('');
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  function beginEditSupplier(supplier: Alibaba1688SupplierRecord) {
    setSupplierForm({
      supplierName: supplier.supplierName,
      contactName: supplier.contactName ?? '',
      contactPhone: supplier.contactPhone ?? '',
      shopUrl: supplier.shopUrl ?? '',
      mainCategories: supplier.mainCategories ?? '',
      supplyStability: supplier.supplyStability ?? '',
      minOrderQuantity: String(supplier.minOrderQuantity ?? 0),
      leadTimeDays: String(supplier.leadTimeDays ?? 0),
      address: supplier.address ?? '',
      costVisibleLevel: supplier.costVisibleLevel ?? 'restricted',
      isActive: supplier.isActive,
      remark: supplier.remark ?? '',
    });
    setEditingSupplierId(supplier.id);
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  async function handleSubmitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看供应商，不能新增或编辑。');
      return;
    }

    const supplierName = supplierForm.supplierName.trim();
    if (!supplierName) {
      setError('请先填写供应商名称。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        supplierName,
        contactName: supplierForm.contactName.trim(),
        contactPhone: supplierForm.contactPhone.trim(),
        shopUrl: supplierForm.shopUrl.trim(),
        mainCategories: supplierForm.mainCategories.trim(),
        supplyStability: supplierForm.supplyStability,
        minOrderQuantity: toInteger(supplierForm.minOrderQuantity),
        leadTimeDays: toInteger(supplierForm.leadTimeDays),
        address: supplierForm.address.trim(),
        costVisibleLevel: supplierForm.costVisibleLevel,
        isActive: supplierForm.isActive,
        remark: supplierForm.remark.trim(),
      };

      if (editingSupplierId) {
        await alibaba1688DataSource.suppliers.update(editingSupplierId, payload);
        setMessage('供应商信息已更新。');
      } else {
        await alibaba1688DataSource.suppliers.create(payload);
        setMessage('供应商已新增。');
      }

      resetSupplierForm();
      await loadSuppliers();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleSupplier(supplier: Alibaba1688SupplierRecord) {
    if (!canManage) {
      setError('当前账号只能查看供应商，不能启用或停用。');
      return;
    }

    const actionText = supplier.isActive ? '停用' : '启用';
    if (!window.confirm(`确认${actionText}供应商“${supplier.supplierName}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.suppliers.update(supplier.id, { isActive: !supplier.isActive });
      setMessage(`供应商已${actionText}。`);
      await loadSuppliers();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSupplier(supplier: Alibaba1688SupplierRecord) {
    if (!canManage) {
      setError('当前账号只能查看供应商，不能删除。');
      return;
    }
    if (!window.confirm(`确认删除供应商“${supplier.supplierName}”？删除前请确认没有产品正在引用该供应商。`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.suppliers.remove(supplier.id);
      setMessage('供应商已删除。');
      if (editingSupplierId === supplier.id) {
        resetSupplierForm();
      }
      await loadSuppliers();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="alibaba-suppliers-page">
      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 供应商管理</h2>
          </div>
          <span>{suppliers.length} 个供应商</span>
        </header>

        <div className="alibaba-product-toolbar">
          <label>
            搜索供应商
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="供应商名称、联系人、电话或主营品类"
            />
          </label>
          <button type="button" className="store-primary-button" onClick={() => void loadSuppliers()} disabled={loading || saving}>
            查询
          </button>
          {canManage && (
            <button type="button" className="store-primary-button" onClick={beginCreateSupplier} disabled={saving}>
              新增供应商
            </button>
          )}
        </div>

        {error && <div className="alibaba-settings-error"><strong>{error}</strong></div>}
        {message && <p className="alibaba-settings-message">{message}</p>}

        <div className="alibaba-product-table-wrap">
          <table className="alibaba-product-table alibaba-supplier-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>供应商名称</th>
                <th>联系人</th>
                <th>联系电话</th>
                <th>主营品类</th>
                <th>供货稳定性</th>
                <th>最低起订量</th>
                <th>交期天数</th>
                <th>状态</th>
                {canManage && <th>成本可见级别</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.id.slice(0, 8)}</td>
                  <td>
                    <strong>{supplier.supplierName || '-'}</strong>
                    {supplier.shopUrl && (
                      <a href={supplier.shopUrl} target="_blank" rel="noreferrer">
                        店铺链接
                      </a>
                    )}
                  </td>
                  <td>{supplier.contactName || '-'}</td>
                  <td>{supplier.contactPhone || '-'}</td>
                  <td>{supplier.mainCategories || '-'}</td>
                  <td>{formatStability(supplier.supplyStability)}</td>
                  <td>{supplier.minOrderQuantity ?? 0}</td>
                  <td>{supplier.leadTimeDays ?? 0}</td>
                  <td>
                    <span className={supplier.isActive ? 'alibaba-state-on' : 'alibaba-state-off'}>
                      {supplier.isActive ? '启用' : '停用'}
                    </span>
                  </td>
                  {canManage && <td>{formatCostVisibleLevel(supplier.costVisibleLevel)}</td>}
                  <td>
                    {canManage ? (
                      <div className="alibaba-row-actions">
                        <button type="button" onClick={() => beginEditSupplier(supplier)} disabled={saving}>编辑</button>
                        <button type="button" onClick={() => void handleToggleSupplier(supplier)} disabled={saving}>
                          {supplier.isActive ? '停用' : '启用'}
                        </button>
                        <button type="button" className="danger-action-button" onClick={() => void handleRemoveSupplier(supplier)} disabled={saving}>删除</button>
                      </div>
                    ) : '只读'}
                  </td>
                </tr>
              ))}
              {!loading && suppliers.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 11 : 10}>
                    <div className="admin-home-empty">暂无供应商数据，可由管理员或主管新增供应商基础信息。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isEditorOpen && canManage && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleSubmitSupplier}>
            <header>
              <div>
                <h2>{editingSupplierId ? '编辑供应商' : '新增供应商'}</h2>
                <p>维护基础信息；拿货价后续在产品或 SKU 层面管理。</p>
              </div>
              <button type="button" onClick={resetSupplierForm} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              <label>
                供应商名称
                <input value={supplierForm.supplierName} onChange={(event) => setSupplierForm((current) => ({ ...current, supplierName: event.target.value }))} />
              </label>
              <label>
                联系人
                <input value={supplierForm.contactName} onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} />
              </label>
              <label>
                联系电话
                <input value={supplierForm.contactPhone} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPhone: event.target.value }))} />
              </label>
              <label>
                1688店铺链接
                <input value={supplierForm.shopUrl} onChange={(event) => setSupplierForm((current) => ({ ...current, shopUrl: event.target.value }))} placeholder="https://..." />
              </label>
              <label>
                主营品类
                <input value={supplierForm.mainCategories} onChange={(event) => setSupplierForm((current) => ({ ...current, mainCategories: event.target.value }))} />
              </label>
              <label>
                供货稳定性
                <select value={supplierForm.supplyStability} onChange={(event) => setSupplierForm((current) => ({ ...current, supplyStability: event.target.value }))}>
                  {supplyStabilityOptions.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                最低起订量
                <input value={supplierForm.minOrderQuantity} onChange={(event) => setSupplierForm((current) => ({ ...current, minOrderQuantity: event.target.value }))} />
              </label>
              <label>
                交期天数
                <input value={supplierForm.leadTimeDays} onChange={(event) => setSupplierForm((current) => ({ ...current, leadTimeDays: event.target.value }))} />
              </label>
              <label>
                成本可见级别
                <select value={supplierForm.costVisibleLevel} onChange={(event) => setSupplierForm((current) => ({ ...current, costVisibleLevel: event.target.value }))}>
                  {costVisibleLevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="alibaba-checkbox-label">
                <input type="checkbox" checked={supplierForm.isActive} onChange={(event) => setSupplierForm((current) => ({ ...current, isActive: event.target.checked }))} />
                启用供应商
              </label>
              <label className="alibaba-form-wide">
                地址
                <input value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                备注
                <textarea value={supplierForm.remark} onChange={(event) => setSupplierForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={resetSupplierForm} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>
                {editingSupplierId ? '保存修改' : '新增供应商'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default Alibaba1688SuppliersPage;
