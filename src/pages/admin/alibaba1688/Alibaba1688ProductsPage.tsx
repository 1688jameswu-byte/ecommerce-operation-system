import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type { Alibaba1688ListingCheckResult } from '../../../data-source/alibaba1688DataSource';
import type { CurrentUser } from '../../../types/auth';
import {
  getAssigneeLabel,
  getAssigneeValue,
  hasAssigneeOption,
  loadAlibaba1688Assignees,
  type Alibaba1688AssigneeOption,
} from './alibaba1688Assignees';
import type {
  Alibaba1688ImageRecord,
  Alibaba1688ListingTaskRecord,
  Alibaba1688ProductRecord,
  Alibaba1688SettingRecord,
  Alibaba1688SkuRecord,
  Alibaba1688StoreRecord,
  Alibaba1688SupplierRecord,
} from '../../../types/alibaba1688';

interface Alibaba1688ProductsPageProps {
  currentUser: CurrentUser;
}

const productStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '可上架' },
  { value: 'manual_listing', label: '人工上架中' },
  { value: 'listed', label: '已上架' },
  { value: 'failed', label: '上架失败' },
  { value: 'offline', label: '已下架' },
];

const emptyProductForm = {
  productCode: '',
  productName: '',
  categoryId: '',
  status: 'draft',
  storeId: '',
  supplierId: '',
  listingTitle: '',
  keywords: '',
  sellingPoints: '',
  detailDescription: '',
  remark: '',
};

const emptyListingTaskForm = {
  assigneeUserId: '',
  storeId: '',
  dueDate: '',
  taskTitle: '',
  remark: '',
};

const emptySkuForm = {
  skuCode: '',
  color: '',
  size: '',
  specification: '',
  purchasePrice: '0',
  wholesalePrice: '0',
  suggestedPrice: '0',
  minOrderQuantity: '0',
  stockQuantity: '0',
  isActive: true,
};

function canManage1688(currentUser: CurrentUser) {
  return currentUser.role === 'admin' ||
    currentUser.role === 'leader' ||
    (
      (currentUser.platform === '1688' || currentUser.platformKeys?.includes('1688')) &&
      currentUser.allowedMenuKeys?.includes('1688-products') &&
      currentUser.operationPermissionKeys?.includes('create') &&
      currentUser.operationPermissionKeys?.includes('edit')
    );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatStatus(value: string) {
  return productStatusOptions.find((item) => item.value === value)?.label ?? value;
}

function toNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function Alibaba1688ProductsPage({ currentUser }: Alibaba1688ProductsPageProps) {
  const canManage = canManage1688(currentUser);
  const [products, setProducts] = useState<Alibaba1688ProductRecord[]>([]);
  const [stores, setStores] = useState<Alibaba1688StoreRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Alibaba1688SupplierRecord[]>([]);
  const [categories, setCategories] = useState<Alibaba1688SettingRecord[]>([]);
  const [assignees, setAssignees] = useState<Alibaba1688AssigneeOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [detail, setDetail] = useState<Alibaba1688ProductRecord & { skus: Alibaba1688SkuRecord[]; images: Alibaba1688ImageRecord[]; listingTasks: Alibaba1688ListingTaskRecord[] } | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [listingTaskForm, setListingTaskForm] = useState(emptyListingTaskForm);
  const [editingProductId, setEditingProductId] = useState('');
  const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);
  const [isListingTaskModalOpen, setIsListingTaskModalOpen] = useState(false);
  const [listingCheck, setListingCheck] = useState<Alibaba1688ListingCheckResult | null>(null);
  const [skuForm, setSkuForm] = useState(emptySkuForm);
  const [editingSkuId, setEditingSkuId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const storeNameById = useMemo(() => new Map(stores.map((store) => [store.id, store.storeName])), [stores]);
  const supplierNameById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.supplierName])), [suppliers]);
  const categoryNameById = useMemo(() => new Map(categories.map((item) => [item.id, item.settingValue || item.settingKey])), [categories]);

  async function loadProducts(nextKeyword = keyword) {
    setLoading(true);
    setError('');

    try {
      const [productPage, storePage, supplierPage, categoryPage, assigneeOptions] = await Promise.all([
        alibaba1688DataSource.products.loadPage({ page: 1, pageSize: 100, keyword: nextKeyword.trim() }),
        alibaba1688DataSource.stores.loadPage({ page: 1, pageSize: 100, isActive: true }),
        alibaba1688DataSource.suppliers.loadPage({ page: 1, pageSize: 100, isActive: true }),
        alibaba1688DataSource.settings.loadPage({ page: 1, pageSize: 100, settingGroup: 'product_category', isActive: true }),
        loadAlibaba1688Assignees(),
      ]);
      setProducts(productPage.records);
      setStores(storePage.records);
      setSuppliers(supplierPage.records);
      setCategories(categoryPage.records);
      setAssignees(assigneeOptions);

      if (selectedProductId && !productPage.records.some((product) => product.id === selectedProductId)) {
        setSelectedProductId('');
        setDetail(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(productId: string) {
    setSelectedProductId(productId);
    setError('');

    try {
      const nextDetail = await alibaba1688DataSource.products.loadDetail(productId);
      setDetail(nextDetail);
      setListingCheck(null);
    } catch (loadError) {
      setDetail(null);
      setError(getErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void loadProducts('');
  }, []);

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId('');
    setIsProductEditorOpen(false);
  }

  function beginCreateProduct() {
    setProductForm(emptyProductForm);
    setEditingProductId('');
    setIsProductEditorOpen(true);
    setError('');
    setMessage('');
  }

  function beginEditProduct(product: Alibaba1688ProductRecord) {
    setProductForm({
      productCode: product.productCode,
      productName: product.productName,
      categoryId: product.categoryId ?? '',
      status: product.status,
      storeId: product.storeId ?? '',
      supplierId: product.supplierId ?? '',
      listingTitle: product.listingTitle ?? '',
      keywords: product.keywords ?? '',
      sellingPoints: product.sellingPoints ?? '',
      detailDescription: product.detailDescription ?? '',
      remark: product.remark ?? '',
    });
    setEditingProductId(product.id);
    setIsProductEditorOpen(true);
    setError('');
    setMessage('');
  }

  async function handleSubmitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看产品库，不能修改。');
      return;
    }

    const productName = productForm.productName.trim();
    if (!productName) {
      setError('请先填写产品名称。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        productCode: productForm.productCode.trim(),
        productName,
        categoryId: productForm.categoryId,
        status: productForm.status,
        listingStatus: productForm.status === 'listed' ? 'listed' : 'not_listed',
        storeId: productForm.storeId || undefined,
        supplierId: productForm.supplierId || undefined,
        listingTitle: productForm.listingTitle.trim(),
        keywords: productForm.keywords.trim(),
        sellingPoints: productForm.sellingPoints.trim(),
        detailDescription: productForm.detailDescription.trim(),
        remark: productForm.remark.trim(),
      };
      const saved = editingProductId
        ? await alibaba1688DataSource.products.update(editingProductId, payload)
        : await alibaba1688DataSource.products.create(payload);

      setMessage(editingProductId ? '产品已更新。' : '产品已新增。');
      resetProductForm();
      await loadProducts();
      await loadDetail(saved.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveProduct(product: Alibaba1688ProductRecord) {
    if (!canManage) {
      setError('当前账号只能查看产品库，不能删除。');
      return;
    }
    if (!window.confirm(`确认删除产品“${product.productName}”？关联 SKU 会一并删除。`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.products.remove(product.id);
      setMessage('产品已删除。');
      if (selectedProductId === product.id) {
        setSelectedProductId('');
        setDetail(null);
      }
      await loadProducts();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function resetSkuForm() {
    setSkuForm(emptySkuForm);
    setEditingSkuId('');
  }

  function beginEditSku(sku: Alibaba1688SkuRecord) {
    setSkuForm({
      skuCode: sku.skuCode,
      color: sku.color ?? '',
      size: sku.size ?? '',
      specification: sku.specification ?? '',
      purchasePrice: String(sku.purchasePrice ?? 0),
      wholesalePrice: String(sku.wholesalePrice ?? 0),
      suggestedPrice: String(sku.suggestedPrice ?? 0),
      minOrderQuantity: String(sku.minOrderQuantity ?? 0),
      stockQuantity: String(sku.stockQuantity ?? 0),
      isActive: sku.isActive,
    });
    setEditingSkuId(sku.id);
  }

  async function handleSubmitSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看 SKU，不能修改。');
      return;
    }
    if (!selectedProductId) {
      setError('请先选择产品。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        productId: selectedProductId,
        skuCode: skuForm.skuCode.trim(),
        color: skuForm.color.trim(),
        size: skuForm.size.trim(),
        specification: skuForm.specification.trim(),
        purchasePrice: toNumber(skuForm.purchasePrice),
        wholesalePrice: toNumber(skuForm.wholesalePrice),
        suggestedPrice: toNumber(skuForm.suggestedPrice),
        minOrderQuantity: Math.floor(toNumber(skuForm.minOrderQuantity)),
        stockQuantity: Math.floor(toNumber(skuForm.stockQuantity)),
        isActive: skuForm.isActive,
      };
      if (editingSkuId) {
        await alibaba1688DataSource.skus.update(editingSkuId, payload);
        setMessage('SKU 已更新。');
      } else {
        await alibaba1688DataSource.skus.create(payload);
        setMessage('SKU 已新增。');
      }
      resetSkuForm();
      await loadDetail(selectedProductId);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSku(sku: Alibaba1688SkuRecord) {
    if (!canManage) {
      setError('当前账号只能查看 SKU，不能删除。');
      return;
    }
    if (!window.confirm(`确认删除 SKU“${sku.skuCode || sku.id}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.skus.remove(sku.id);
      setMessage('SKU 已删除。');
      resetSkuForm();
      await loadDetail(selectedProductId);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckListingReady(productId = selectedProductId) {
    if (!canManage) {
      setError('当前账号只能查看产品资料，不能执行上架完整性检查。');
      return;
    }
    if (!productId) {
      setError('请先选择产品。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await alibaba1688DataSource.products.checkListingReady(productId, true);
      setListingCheck(result);
      if (result.ok) {
        setMessage('资料完整，可以生成上架任务。');
        await loadProducts();
        await loadDetail(productId);
      } else {
        setError(`资料不完整，缺少：${result.missingItems.join('、')}`);
      }
    } catch (checkError) {
      setError(getErrorMessage(checkError));
    } finally {
      setSaving(false);
    }
  }

  async function beginGenerateListingTask(product: Alibaba1688ProductRecord) {
    if (!canManage) {
      setError('当前账号不能生成上架任务。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await alibaba1688DataSource.products.checkListingReady(product.id, true);
      setListingCheck(result);
      if (!result.ok) {
        setSelectedProductId(product.id);
        await loadDetail(product.id);
        setError(`资料不完整，缺少：${result.missingItems.join('、')}`);
        return;
      }

      setSelectedProductId(product.id);
      setListingTaskForm({
        assigneeUserId: assignees[0] ? getAssigneeValue(assignees[0]) : currentUser.userId || currentUser.username || '',
        storeId: product.storeId ?? result.product?.storeId ?? '',
        dueDate: '',
        taskTitle: `${product.listingTitle || product.productName || product.productCode} 上架任务`,
        remark: '',
      });
      setIsListingTaskModalOpen(true);
      await loadDetail(product.id);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateListingTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setError('请先选择产品。');
      return;
    }
    if (!listingTaskForm.assigneeUserId.trim()) {
      setError('请选择负责人业务员。');
      return;
    }
    if (!listingTaskForm.storeId) {
      setError('请选择上架店铺。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.products.generateListingTask(selectedProductId, {
        assigneeUserId: listingTaskForm.assigneeUserId.trim(),
        storeId: listingTaskForm.storeId,
        dueDate: listingTaskForm.dueDate || undefined,
        taskTitle: listingTaskForm.taskTitle.trim(),
        remark: listingTaskForm.remark.trim(),
      });
      setMessage('上架任务已生成，产品已进入人工上架中。');
      setIsListingTaskModalOpen(false);
      setListingTaskForm(emptyListingTaskForm);
      await loadProducts();
      await loadDetail(selectedProductId);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successText);
    } catch {
      setError('复制失败，请手动选中文本复制。');
    }
  }

  function buildSkuPackageText() {
    if (!detail) {
      return '';
    }

    const headers = canManage
      ? ['SKU编码', '颜色', '尺寸', '规格', '批发价', '建议价', '起批量', '库存']
      : ['SKU编码', '颜色', '尺寸', '规格', '批发价', '建议价', '起批量', '库存'];
    const rows = detail.skus.map((sku) => [
      sku.skuCode || '',
      sku.color || '',
      sku.size || '',
      sku.specification || '',
      String(sku.wholesalePrice ?? ''),
      String(sku.suggestedPrice ?? ''),
      String(sku.minOrderQuantity ?? ''),
      String(sku.stockQuantity ?? ''),
    ].join('\t'));

    return [headers.join('\t'), ...rows].join('\n');
  }

  return (
    <section className="alibaba-products-page">
      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 产品库</h2>
          </div>
          <span>{products.length} 个产品</span>
        </header>

        <div className="alibaba-product-toolbar">
          <label>
            搜索产品
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="产品名称、编号、标题或关键词"
            />
          </label>
          <button type="button" className="store-primary-button" onClick={() => void loadProducts()} disabled={loading || saving}>
            查询
          </button>
          {canManage && (
            <button type="button" className="store-primary-button" onClick={beginCreateProduct} disabled={saving}>
              新增产品
            </button>
          )}
        </div>

        {error && <div className="alibaba-settings-error"><strong>{error}</strong></div>}
        {message && <p className="alibaba-settings-message">{message}</p>}

        <div className="alibaba-product-table-wrap">
          <table className="alibaba-product-table">
            <thead>
              <tr>
                <th>产品编号</th>
                <th>名称</th>
                <th>状态</th>
                <th>分类</th>
                <th>店铺</th>
                <th>供应商</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className={selectedProductId === product.id ? 'selected' : ''}>
                  <td>{product.productCode || '-'}</td>
                  <td>{product.productName || '-'}</td>
                  <td>{formatStatus(product.status)}</td>
                  <td>{product.categoryId ? categoryNameById.get(product.categoryId) ?? product.categoryId.slice(0, 8) : '-'}</td>
                  <td>{product.storeId ? storeNameById.get(product.storeId) ?? product.storeId.slice(0, 8) : '-'}</td>
                  <td>{product.supplierId ? supplierNameById.get(product.supplierId) ?? product.supplierId.slice(0, 8) : '-'}</td>
                  <td>
                    <div className="alibaba-row-actions">
                      <button type="button" onClick={() => void loadDetail(product.id)} disabled={saving}>详情</button>
                      {canManage && (
                        <>
                          <button type="button" onClick={() => void handleCheckListingReady(product.id)} disabled={saving}>检查是否可上架</button>
                          <button type="button" onClick={() => void beginGenerateListingTask(product)} disabled={saving}>生成上架任务</button>
                          <button type="button" onClick={() => beginEditProduct(product)} disabled={saving}>编辑</button>
                          <button type="button" className="danger-action-button" onClick={() => void handleRemoveProduct(product)} disabled={saving}>删除</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && products.length === 0 && (
                <tr><td colSpan={7}>暂无产品数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="excel-record-panel alibaba-product-detail">
        <header>
          <div>
            <h2>产品详情与 SKU</h2>
            <p>{detail ? `当前产品：${detail.productName}` : '从左侧产品列表选择一个产品后查看 SKU。'}</p>
          </div>
          <span>{detail?.skus.length ?? 0} 个 SKU</span>
        </header>

        {detail ? (
          <>
            <div className="alibaba-product-detail-grid">
              <article><span>产品名称</span><strong>{detail.productName}</strong></article>
              <article><span>状态</span><strong>{formatStatus(detail.status)}</strong></article>
              <article><span>店铺</span><strong>{detail.storeId ? storeNameById.get(detail.storeId) ?? detail.storeId : '-'}</strong></article>
              <article><span>供应商</span><strong>{detail.supplierId ? supplierNameById.get(detail.supplierId) ?? detail.supplierId : '-'}</strong></article>
            </div>

            <section className="alibaba-listing-flow-panel">
              <header>
                {canManage && (
                  <div className="alibaba-row-actions">
                    <button type="button" onClick={() => void handleCheckListingReady(detail.id)} disabled={saving}>检查是否可上架</button>
                    <button type="button" className="store-primary-button" onClick={() => void beginGenerateListingTask(detail)} disabled={saving}>生成上架任务</button>
                  </div>
                )}
              </header>
              {listingCheck && (
                <div className={`alibaba-listing-check ${listingCheck.ok ? 'ok' : 'warning'}`}>
                  <strong>{listingCheck.message}</strong>
                  <span>启用 SKU：{listingCheck.activeSkuCount} 个，可用图片：{listingCheck.availableImageCount} 张</span>
                  {!listingCheck.ok && (
                    <p>缺少资料：{listingCheck.missingItems.join('、')}</p>
                  )}
                </div>
              )}
              {detail.listingTasks.some((task) => ['pending', 'manual_listing'].includes(String(task.taskStatus))) && (
                <p className="alibaba-listing-task-note">该产品已有未完成上架任务，不能重复生成。</p>
              )}
            </section>

            <section className="alibaba-listing-package">
              <div className="alibaba-package-grid">
                <article>
                  <span>标题</span>
                  <strong>{detail.listingTitle || '-'}</strong>
                  <button type="button" onClick={() => void copyText(detail.listingTitle || '', '标题已复制。')} disabled={!detail.listingTitle}>复制资料</button>
                </article>
                <article>
                  <span>关键词</span>
                  <strong>{detail.keywords || '-'}</strong>
                  <button type="button" onClick={() => void copyText(detail.keywords || '', '关键词已复制。')} disabled={!detail.keywords}>复制资料</button>
                </article>
                <article>
                  <span>卖点</span>
                  <strong>{detail.sellingPoints || '-'}</strong>
                  <button type="button" onClick={() => void copyText(detail.sellingPoints || '', '卖点已复制。')} disabled={!detail.sellingPoints}>复制资料</button>
                </article>
                <article>
                  <span>详情文案</span>
                  <strong>{detail.detailDescription || '-'}</strong>
                  <button type="button" onClick={() => void copyText(detail.detailDescription || '', '详情文案已复制。')} disabled={!detail.detailDescription}>复制资料</button>
                </article>
                <article>
                  <span>SKU 表格</span>
                  <strong>{detail.skus.length} 个 SKU</strong>
                  <button type="button" onClick={() => void copyText(buildSkuPackageText(), 'SKU 表格已复制。')} disabled={detail.skus.length === 0}>复制资料</button>
                </article>
              </div>
              <div className="alibaba-package-images">
                <strong>可用图片列表</strong>
                {detail.images.filter((image) => ['ready', 'used'].includes(String(image.imageStatus))).length > 0 ? (
                  detail.images
                    .filter((image) => ['ready', 'used'].includes(String(image.imageStatus)))
                    .map((image) => (
                      <span key={image.id}>{image.fileName || image.filePath || image.fileUrl || image.id.slice(0, 8)}</span>
                    ))
                ) : (
                  <em>暂无可用图片</em>
                )}
              </div>
            </section>

            {canManage && (
              <form className="alibaba-sku-form" onSubmit={handleSubmitSku}>
                <label>SKU 编号<input value={skuForm.skuCode} onChange={(event) => setSkuForm((current) => ({ ...current, skuCode: event.target.value }))} /></label>
                <label>颜色<input value={skuForm.color} onChange={(event) => setSkuForm((current) => ({ ...current, color: event.target.value }))} /></label>
                <label>尺寸<input value={skuForm.size} onChange={(event) => setSkuForm((current) => ({ ...current, size: event.target.value }))} /></label>
                <label>规格<input value={skuForm.specification} onChange={(event) => setSkuForm((current) => ({ ...current, specification: event.target.value }))} /></label>
                <label>拿货价<input value={skuForm.purchasePrice} onChange={(event) => setSkuForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
                <label>批发价<input value={skuForm.wholesalePrice} onChange={(event) => setSkuForm((current) => ({ ...current, wholesalePrice: event.target.value }))} /></label>
                <label>建议价<input value={skuForm.suggestedPrice} onChange={(event) => setSkuForm((current) => ({ ...current, suggestedPrice: event.target.value }))} /></label>
                <label>起批量<input value={skuForm.minOrderQuantity} onChange={(event) => setSkuForm((current) => ({ ...current, minOrderQuantity: event.target.value }))} /></label>
                <label>库存<input value={skuForm.stockQuantity} onChange={(event) => setSkuForm((current) => ({ ...current, stockQuantity: event.target.value }))} /></label>
                <label className="alibaba-checkbox-label">
                  <input type="checkbox" checked={skuForm.isActive} onChange={(event) => setSkuForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  启用
                </label>
                <div className="alibaba-form-actions">
                  <button type="submit" className="store-primary-button" disabled={saving}>{editingSkuId ? '保存 SKU' : '新增 SKU'}</button>
                  {editingSkuId && <button type="button" onClick={resetSkuForm} disabled={saving}>取消</button>}
                </div>
              </form>
            )}

            <div className="alibaba-product-table-wrap">
              <table className="alibaba-product-table">
                <thead>
                  <tr>
                    <th>SKU ID</th>
                    <th>SKU 编号</th>
                    <th>规格</th>
                    {canManage && <th>拿货价</th>}
                    <th>批发价</th>
                    <th>建议价</th>
                    <th>起批量</th>
                    <th>库存</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.skus.map((sku) => (
                    <tr key={sku.id}>
                      <td>{sku.id.slice(0, 8)}</td>
                      <td>{sku.skuCode || '-'}</td>
                      <td>{[sku.color, sku.size, sku.specification].filter(Boolean).join(' / ') || '-'}</td>
                      {canManage && <td>{sku.purchasePrice}</td>}
                      <td>{sku.wholesalePrice}</td>
                      <td>{sku.suggestedPrice}</td>
                      <td>{sku.minOrderQuantity}</td>
                      <td>{sku.stockQuantity}</td>
                      <td>{sku.isActive ? '启用' : '停用'}</td>
                      <td>
                        {canManage ? (
                          <div className="alibaba-row-actions">
                            <button type="button" onClick={() => beginEditSku(sku)} disabled={saving}>编辑</button>
                            <button type="button" className="danger-action-button" onClick={() => void handleRemoveSku(sku)} disabled={saving}>删除</button>
                          </div>
                        ) : '只读'}
                      </td>
                    </tr>
                  ))}
                  {detail.skus.length === 0 && <tr><td colSpan={canManage ? 10 : 9}>暂无 SKU</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="admin-home-empty">请选择产品查看 SKU</div>
        )}
      </section>

      {isListingTaskModalOpen && canManage && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleGenerateListingTask}>
            <header>
              <div>
                <h2>生成上架任务</h2>
                <p>资料完整后生成待处理任务，业务员人工上架后在任务页回填 1688 商品链接。</p>
              </div>
              <button type="button" onClick={() => setIsListingTaskModalOpen(false)} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              <label>
                负责人账号
                <select value={listingTaskForm.assigneeUserId} onChange={(event) => setListingTaskForm((current) => ({ ...current, assigneeUserId: event.target.value }))}>
                  <option value="">请选择业务员</option>
                  {assignees.map((assignee) => (
                    <option key={getAssigneeValue(assignee)} value={getAssigneeValue(assignee)}>{getAssigneeLabel(assignee)}</option>
                  ))}
                  {listingTaskForm.assigneeUserId && !hasAssigneeOption(assignees, listingTaskForm.assigneeUserId) && (
                    <option value={listingTaskForm.assigneeUserId}>{listingTaskForm.assigneeUserId}</option>
                  )}
                </select>
              </label>
              <label>
                上架店铺
                <select value={listingTaskForm.storeId} onChange={(event) => setListingTaskForm((current) => ({ ...current, storeId: event.target.value }))}>
                  <option value="">请选择店铺</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.storeName}</option>
                  ))}
                </select>
              </label>
              <label>
                截止日期
                <input type="date" value={listingTaskForm.dueDate} onChange={(event) => setListingTaskForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                任务标题
                <input value={listingTaskForm.taskTitle} onChange={(event) => setListingTaskForm((current) => ({ ...current, taskTitle: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                备注
                <textarea value={listingTaskForm.remark} onChange={(event) => setListingTaskForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={() => setIsListingTaskModalOpen(false)} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>生成上架任务</button>
            </div>
          </form>
        </div>
      )}

      {isProductEditorOpen && canManage && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleSubmitProduct}>
            <header>
              <div>
                <h2>{editingProductId ? '编辑产品' : '新增产品'}</h2>
                <p>维护产品基础信息，并关联负责店铺和供应商。</p>
              </div>
              <button type="button" onClick={resetProductForm} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              <label>
                产品编号
                <input value={productForm.productCode} onChange={(event) => setProductForm((current) => ({ ...current, productCode: event.target.value }))} />
              </label>
              <label>
                产品名称
                <input value={productForm.productName} onChange={(event) => setProductForm((current) => ({ ...current, productName: event.target.value }))} />
              </label>
              <label>
                分类
                <select value={productForm.categoryId} onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}>
                  <option value="">未选择</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.settingValue || category.settingKey}</option>
                  ))}
                </select>
              </label>
              <label>
                店铺
                <select value={productForm.storeId} onChange={(event) => setProductForm((current) => ({ ...current, storeId: event.target.value }))}>
                  <option value="">未绑定</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.storeName}</option>
                  ))}
                </select>
              </label>
              <label>
                供应商
                <select value={productForm.supplierId} onChange={(event) => setProductForm((current) => ({ ...current, supplierId: event.target.value }))}>
                  <option value="">未绑定</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
                  ))}
                </select>
              </label>
              <label>
                状态
                <select value={productForm.status} onChange={(event) => setProductForm((current) => ({ ...current, status: event.target.value }))}>
                  {productStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="alibaba-form-wide">
                上架标题
                <input value={productForm.listingTitle} onChange={(event) => setProductForm((current) => ({ ...current, listingTitle: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                关键词
                <input value={productForm.keywords} onChange={(event) => setProductForm((current) => ({ ...current, keywords: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                商品卖点
                <textarea value={productForm.sellingPoints} onChange={(event) => setProductForm((current) => ({ ...current, sellingPoints: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                详情文案
                <textarea value={productForm.detailDescription} onChange={(event) => setProductForm((current) => ({ ...current, detailDescription: event.target.value }))} />
              </label>
              <label className="alibaba-form-wide">
                备注
                <textarea value={productForm.remark} onChange={(event) => setProductForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={resetProductForm} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>
                {editingProductId ? '保存修改' : '新增产品'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default Alibaba1688ProductsPage;
