import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type { CurrentUser } from '../../../types/auth';
import {
  formatAssigneeName,
  getAssigneeLabel,
  getAssigneeValue,
  hasAssigneeOption,
  loadAlibaba1688Assignees,
  type Alibaba1688AssigneeOption,
} from './alibaba1688Assignees';
import type {
  Alibaba1688ListingTaskRecord,
  Alibaba1688ProductRecord,
  Alibaba1688SkuRecord,
  Alibaba1688StoreRecord,
} from '../../../types/alibaba1688';

interface Alibaba1688ListingTasksPageProps {
  currentUser: CurrentUser;
}

const taskStatusOptions = [
  { value: 'pending', label: '待处理', className: 'alibaba-task-status-pending' },
  { value: 'manual_listing', label: '处理中', className: 'alibaba-task-status-processing' },
  { value: 'listed', label: '已上架', className: 'alibaba-task-status-completed' },
  { value: 'failed', label: '上架失败', className: 'alibaba-task-status-failed' },
];

const emptyTaskForm = {
  productId: '',
  storeId: '',
  assigneeUserId: '',
  taskTitle: '',
  taskStatus: 'pending',
  dueDate: '',
  listingUrl: '',
  failureReason: '',
  remark: '',
};

const emptyProgressForm = {
  listingUrl: '',
  failureReason: '',
  remark: '',
};

function canManage1688(currentUser: CurrentUser) {
  return currentUser.role === 'admin' ||
    currentUser.role === 'leader' ||
    (
      (currentUser.platform === '1688' || currentUser.platformKeys?.includes('1688')) &&
      currentUser.allowedMenuKeys?.includes('1688-listing-tasks') &&
      currentUser.operationPermissionKeys?.includes('create') &&
      currentUser.operationPermissionKeys?.includes('edit')
    );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : '-';
}

function formatTaskStatus(value?: string) {
  if (value === 'closed') {
    return { label: '已停用', className: 'alibaba-task-status-disabled' };
  }

  return taskStatusOptions.find((item) => item.value === value) ?? {
    label: value || '-',
    className: 'alibaba-task-status-pending',
  };
}

function isAssignedToCurrentUser(task: Alibaba1688ListingTaskRecord, currentUser: CurrentUser) {
  const values = new Set([
    currentUser.userId,
    currentUser.username,
    currentUser.operatorId,
    currentUser.displayName,
  ].map((item) => String(item ?? '').trim()).filter(Boolean));

  return values.has(String(task.assigneeUserId ?? '').trim());
}

function Alibaba1688ListingTasksPage({ currentUser }: Alibaba1688ListingTasksPageProps) {
  const canManage = canManage1688(currentUser);
  const [tasks, setTasks] = useState<Alibaba1688ListingTaskRecord[]>([]);
  const [products, setProducts] = useState<Alibaba1688ProductRecord[]>([]);
  const [skus, setSkus] = useState<Alibaba1688SkuRecord[]>([]);
  const [stores, setStores] = useState<Alibaba1688StoreRecord[]>([]);
  const [assignees, setAssignees] = useState<Alibaba1688AssigneeOption[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [progressTaskId, setProgressTaskId] = useState('');
  const [progressMode, setProgressMode] = useState<'link' | 'failure'>('link');
  const [progressForm, setProgressForm] = useState(emptyProgressForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const storeNameById = useMemo(() => new Map(stores.map((store) => [store.id, store.storeName])), [stores]);
  const skusByProductId = useMemo(() => {
    const next = new Map<string, Alibaba1688SkuRecord[]>();
    for (const sku of skus) {
      const list = next.get(sku.productId) ?? [];
      list.push(sku);
      next.set(sku.productId, list);
    }
    return next;
  }, [skus]);

  async function loadTasks(nextKeyword = keyword, nextStatus = statusFilter) {
    setLoading(true);
    setError('');

    try {
      const [taskPage, productPage, skuPage, storePage, assigneeOptions] = await Promise.all([
        alibaba1688DataSource.listingTasks.loadPage({
          page: 1,
          pageSize: 100,
          keyword: nextKeyword.trim(),
          taskStatus: nextStatus || undefined,
        }),
        alibaba1688DataSource.products.loadPage({ page: 1, pageSize: 100 }),
        alibaba1688DataSource.skus.loadPage({ page: 1, pageSize: 100 }),
        alibaba1688DataSource.stores.loadPage({ page: 1, pageSize: 100 }),
        loadAlibaba1688Assignees(),
      ]);
      setTasks(taskPage.records);
      setProducts(productPage.records);
      setSkus(skuPage.records);
      setStores(storePage.records);
      setAssignees(assigneeOptions);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks('', '');
  }, []);

  function resetTaskForm() {
    setTaskForm(emptyTaskForm);
    setEditingTaskId('');
    setIsEditorOpen(false);
  }

  function resetProgressForm() {
    setProgressTaskId('');
    setProgressMode('link');
    setProgressForm(emptyProgressForm);
  }

  function beginCreateTask() {
    setTaskForm({
      ...emptyTaskForm,
      assigneeUserId: assignees[0] ? getAssigneeValue(assignees[0]) : '',
    });
    setEditingTaskId('');
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  function beginEditTask(task: Alibaba1688ListingTaskRecord) {
    setTaskForm({
      productId: task.productId,
      storeId: task.storeId ?? productById.get(task.productId)?.storeId ?? '',
      assigneeUserId: task.assigneeUserId ?? '',
      taskTitle: task.taskTitle ?? '',
      taskStatus: task.taskStatus === 'closed' ? 'pending' : task.taskStatus || 'pending',
      dueDate: formatDate(task.dueDate),
      listingUrl: task.listingUrl ?? '',
      failureReason: task.failureReason ?? '',
      remark: task.remark ?? '',
    });
    setEditingTaskId(task.id);
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  function beginProgress(task: Alibaba1688ListingTaskRecord, mode: 'link' | 'failure') {
    setProgressTaskId(task.id);
    setProgressMode(mode);
    setProgressForm({
      listingUrl: task.listingUrl ?? '',
      failureReason: task.failureReason ?? '',
      remark: task.remark ?? '',
    });
    setError('');
    setMessage('');
  }

  function handleProductChange(productId: string) {
    const product = productById.get(productId);
    setTaskForm((current) => ({
      ...current,
      productId,
      storeId: product?.storeId ?? current.storeId,
      taskTitle: current.taskTitle || (product ? `${product.productName || product.productCode} 上架任务` : ''),
    }));
  }

  async function handleSubmitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看上架任务，不能新增或编辑。');
      return;
    }

    if (!taskForm.productId) {
      setError('请先选择关联产品。');
      return;
    }

    const taskTitle = taskForm.taskTitle.trim();
    if (!taskTitle) {
      setError('请填写任务标题。');
      return;
    }

    if (!taskForm.assigneeUserId.trim()) {
      setError('请选择负责人业务员。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        productId: taskForm.productId,
        storeId: taskForm.storeId || undefined,
        assigneeUserId: taskForm.assigneeUserId.trim(),
        taskTitle,
        taskStatus: taskForm.taskStatus,
        dueDate: taskForm.dueDate || undefined,
        startedAt: taskForm.taskStatus === 'manual_listing' ? new Date().toISOString() : undefined,
        completedAt: taskForm.taskStatus === 'listed' ? new Date().toISOString() : undefined,
        listingUrl: taskForm.listingUrl.trim(),
        failureReason: taskForm.failureReason.trim(),
        remark: taskForm.remark.trim(),
      };

      if (editingTaskId) {
        await alibaba1688DataSource.listingTasks.update(editingTaskId, payload);
        setMessage('上架任务已更新。');
      } else {
        await alibaba1688DataSource.listingTasks.create(payload);
        setMessage('上架任务已新增。');
      }

      resetTaskForm();
      await loadTasks();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progressTaskId) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (progressMode === 'link') {
        await alibaba1688DataSource.listingTasks.fillListingUrl(progressTaskId, {
          listingUrl: progressForm.listingUrl.trim(),
          remark: progressForm.remark.trim(),
        });
        setMessage('1688 商品链接已回填，任务和产品已同步标记为已上架。');
      } else {
        await alibaba1688DataSource.listingTasks.markFailed(progressTaskId, {
          failureReason: progressForm.failureReason.trim(),
          remark: progressForm.remark.trim(),
        });
        setMessage('上架失败原因已记录，产品未标记为已上架。');
      }

      resetProgressForm();
      await loadTasks();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleTask(task: Alibaba1688ListingTaskRecord) {
    if (!canManage) {
      setError('当前账号只能查看上架任务，不能启用或停用。');
      return;
    }

    const shouldEnable = task.taskStatus === 'closed';
    const actionText = shouldEnable ? '启用' : '停用';
    if (!window.confirm(`确认${actionText}上架任务“${task.taskTitle || task.id.slice(0, 8)}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.listingTasks.update(task.id, {
        taskStatus: shouldEnable ? 'pending' : 'closed',
      });
      setMessage(`上架任务已${actionText}。`);
      await loadTasks();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTask(task: Alibaba1688ListingTaskRecord) {
    if (!canManage) {
      setError('当前账号只能查看上架任务，不能删除。');
      return;
    }

    if (!window.confirm(`确认删除上架任务“${task.taskTitle || task.id.slice(0, 8)}”？删除后不会删除产品或 SKU。`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.listingTasks.remove(task.id);
      setMessage('上架任务已删除。');
      if (editingTaskId === task.id) {
        resetTaskForm();
      }
      await loadTasks();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function renderSkuSummary(productId: string) {
    const productSkus = skusByProductId.get(productId) ?? [];
    if (productSkus.length === 0) {
      return '-';
    }

    return productSkus.slice(0, 3).map((sku) => sku.skuCode || sku.id.slice(0, 8)).join('、') + (
      productSkus.length > 3 ? ` 等 ${productSkus.length} 个` : ''
    );
  }

  return (
    <section className="alibaba-listing-tasks-page">
      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 上架任务</h2>
          </div>
          <span>{tasks.length} 个任务</span>
        </header>

        <div className="alibaba-product-toolbar alibaba-task-toolbar">
          <label>
            搜索任务
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="任务标题、1688 链接或失败原因"
            />
          </label>
          <label>
            任务状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {taskStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="store-primary-button" onClick={() => void loadTasks()} disabled={loading || saving}>
            查询
          </button>
          {canManage && (
            <button type="button" className="store-primary-button" onClick={beginCreateTask} disabled={saving}>
              新增任务
            </button>
          )}
        </div>

        {error && <div className="alibaba-settings-error"><strong>{error}</strong></div>}
        {message && <p className="alibaba-settings-message">{message}</p>}

        <div className="alibaba-product-table-wrap">
          <table className="alibaba-product-table alibaba-task-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>任务标题</th>
                <th>状态</th>
                <th>产品</th>
                <th>关联 SKU</th>
                <th>店铺</th>
                <th>负责人</th>
                <th>截止日期</th>
                <th>1688 链接</th>
                <th>失败原因</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const product = productById.get(task.productId);
                const status = formatTaskStatus(task.taskStatus);
                const canFillProgress = canManage || isAssignedToCurrentUser(task, currentUser);
                return (
                  <tr key={task.id}>
                    <td>{task.id.slice(0, 8)}</td>
                    <td>
                      <strong>{task.taskTitle || '-'}</strong>
                      {task.remark && <span>{task.remark}</span>}
                    </td>
                    <td><span className={`alibaba-task-status ${status.className}`}>{status.label}</span></td>
                    <td>{product?.productName || product?.productCode || task.productId.slice(0, 8)}</td>
                    <td>{renderSkuSummary(task.productId)}</td>
                    <td>{task.storeId ? storeNameById.get(task.storeId) ?? task.storeId.slice(0, 8) : '-'}</td>
                    <td>{formatAssigneeName(assignees, task.assigneeUserId)}</td>
                    <td>{formatDate(task.dueDate)}</td>
                    <td>
                      {task.listingUrl ? (
                        <a href={task.listingUrl} target="_blank" rel="noreferrer">查看链接</a>
                      ) : '-'}
                    </td>
                    <td>{task.failureReason || '-'}</td>
                    <td>
                      <div className="alibaba-row-actions">
                        {canFillProgress && (
                          <>
                            <button type="button" onClick={() => beginProgress(task, 'link')} disabled={saving}>回填1688链接</button>
                            <button type="button" onClick={() => beginProgress(task, 'failure')} disabled={saving}>上架失败</button>
                          </>
                        )}
                        {canManage && (
                          <>
                            <button type="button" onClick={() => beginEditTask(task)} disabled={saving}>编辑</button>
                            <button type="button" onClick={() => void handleToggleTask(task)} disabled={saving}>
                              {task.taskStatus === 'closed' ? '启用' : '停用'}
                            </button>
                            <button type="button" className="danger-action-button" onClick={() => void handleRemoveTask(task)} disabled={saving}>删除</button>
                          </>
                        )}
                        {!canFillProgress && !canManage && '只读'}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && tasks.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="admin-home-empty">暂无上架任务，可由管理员或主管从产品库生成上架任务。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {progressTaskId && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleSubmitProgress}>
            <header>
              <div>
                <h2>{progressMode === 'link' ? '回填1688链接' : '记录上架失败'}</h2>
                <p>{progressMode === 'link' ? '人工上架完成后填写商品链接，系统会同步更新任务和产品状态。' : '记录人工上架失败原因，产品不会被标记为已上架。'}</p>
              </div>
              <button type="button" onClick={resetProgressForm} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              {progressMode === 'link' ? (
                <label className="alibaba-form-wide">
                  1688 商品链接
                  <input value={progressForm.listingUrl} onChange={(event) => setProgressForm((current) => ({ ...current, listingUrl: event.target.value }))} placeholder="https://..." />
                </label>
              ) : (
                <label className="alibaba-form-wide">
                  失败原因
                  <textarea value={progressForm.failureReason} onChange={(event) => setProgressForm((current) => ({ ...current, failureReason: event.target.value }))} />
                </label>
              )}
              <label className="alibaba-form-wide">
                备注
                <textarea value={progressForm.remark} onChange={(event) => setProgressForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={resetProgressForm} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>
                {progressMode === 'link' ? '确认回填' : '记录失败'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isEditorOpen && canManage && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleSubmitTask}>
            <header>
              <div>
                <h2>{editingTaskId ? '编辑上架任务' : '新增上架任务'}</h2>
                <p>任务绑定产品，SKU 通过产品自动关联；本页不做自动发布或浏览器模拟上架。</p>
              </div>
              <button type="button" onClick={resetTaskForm} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              <label>
                关联产品
                <select value={taskForm.productId} onChange={(event) => handleProductChange(event.target.value)}>
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.productName || product.productCode || product.id.slice(0, 8)}</option>
                  ))}
                </select>
              </label>
              <label>
                店铺
                <select value={taskForm.storeId} onChange={(event) => setTaskForm((current) => ({ ...current, storeId: event.target.value }))}>
                  <option value="">未选择</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.storeName || store.id.slice(0, 8)}</option>
                  ))}
                </select>
              </label>
              <label>
                任务状态
                <select value={taskForm.taskStatus} onChange={(event) => setTaskForm((current) => ({ ...current, taskStatus: event.target.value }))}>
                  {taskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                任务标题
                <input value={taskForm.taskTitle} onChange={(event) => setTaskForm((current) => ({ ...current, taskTitle: event.target.value }))} />
              </label>
              <label>
                负责人账号
                <select value={taskForm.assigneeUserId} onChange={(event) => setTaskForm((current) => ({ ...current, assigneeUserId: event.target.value }))}>
                  <option value="">请选择业务员</option>
                  {assignees.map((assignee) => (
                    <option key={getAssigneeValue(assignee)} value={getAssigneeValue(assignee)}>{getAssigneeLabel(assignee)}</option>
                  ))}
                  {taskForm.assigneeUserId && !hasAssigneeOption(assignees, taskForm.assigneeUserId) && (
                    <option value={taskForm.assigneeUserId}>{taskForm.assigneeUserId}</option>
                  )}
                </select>
              </label>
              <label>
                截止日期
                <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                关联 SKU
                <input value={taskForm.productId ? renderSkuSummary(taskForm.productId) : ''} readOnly placeholder="选择产品后自动显示该产品下的 SKU" />
              </label>
              <label className="alibaba-form-wide">
                1688 商品链接
                <input value={taskForm.listingUrl} onChange={(event) => setTaskForm((current) => ({ ...current, listingUrl: event.target.value }))} placeholder="https://..." />
              </label>
              <label className="alibaba-form-wide">
                失败原因
                <input value={taskForm.failureReason} onChange={(event) => setTaskForm((current) => ({ ...current, failureReason: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                备注
                <textarea value={taskForm.remark} onChange={(event) => setTaskForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={resetTaskForm} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>
                {editingTaskId ? '保存修改' : '新增任务'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default Alibaba1688ListingTasksPage;
