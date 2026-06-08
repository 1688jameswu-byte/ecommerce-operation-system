import { useEffect, useMemo, useState } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type {
  Alibaba1688ProductDetail,
  Alibaba1688ProductRecord,
  Alibaba1688SettingRecord,
  Alibaba1688SkuRecord,
  Alibaba1688StoreRecord,
  Alibaba1688SupplierRecord,
} from '../../../types/alibaba1688';
import type { CurrentUser } from '../../../types/auth';

interface Alibaba1688ProductsPageProps {
  currentUser: CurrentUser;
}

interface ProductFormState {
  productCode: string;
  productName: string;
  categoryId: string;
  status: string;
  storeId: string;
  supplierId: string;
  remark: string;
}

interface SkuFormState {
  skuCode: string;
  color: string;
  size: string;
  specification: string;
  purchasePrice: string;
  wholesalePrice: string;
  suggestedPrice: string;
  minOrderQuantity: string;
  stockQuantity: string;
  isActive: boolean;
}

const emptyProductForm: ProductFormState = {
  productCode: '',
  productName: '',
  categoryId: '',
  status: 'draft',
  storeId: '',
  supplierId: '',
  remark: '',
};

const emptySkuForm: SkuFormState = {
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

const productStatuses = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '资料完成' },
  { value: 'listed', label: '已上架' },
  { value: 'disabled', label: '停用' },
];

function canManageAlibaba1688(currentUser: CurrentUser) {
  return ['admin', 'leader'].includes(String(currentUser?.role ?? '').toLowerCase());
}

function formatStatus(value?: string) {
  return productStatuses.find((item) => item.value === value)?.label || value || '-';
}

function toNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function Alibaba1688ProductsPage({ currentUser }: Alibaba1688ProductsPageProps) {
  const canManage = canManageAlibaba1688(currentUser);
  const [products, setProducts] = useState<Alibaba1688ProductRecord[]>([]);
  const [stores, setStores] = useState<Alibaba1688StoreRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Alibaba1688SupplierRecord[]>([]);
  const [categories, setCategories] = useState<Alibaba1688SettingRecord[]>([]);
  const [detail, setDetail] = useState<Alibaba1688ProductDetail | null>(null);
  const [keyword, setKeyword] = useState('');
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [skuForm, setSkuForm] = useState<SkuFormState>(emptySkuForm);
  const [editingProductId, setEditingProductId] = useState('');
  const [editingSkuId, setEditingSkuId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [store.id, store.storeName])),
    [stores],
  );
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.supplierName])),
    [suppliers],
  );
  const categoryNameByKey = useMemo(
    () => new Map(categories.map((category) => [category.settingKey, category.settingValue || category.settingKey])),
    [categories],
  );

  async function loadReferenceData() {
    const [storePage, supplierPage, categoryPage] = await Promise.all([
      alibaba1688DataSource.stores.loadPage({ page: 1, pageSize: 100 }),
      alibaba1688DataSource.suppliers.loadPage({ page: 1, pageSize: 100 }),
      alibaba1688DataSource.settings.loadPage({ page: 1, pageSize: 100, settingGroup: 'product_category', isActive: true }),
    ]);
    setStores(storePage.records);
    setSuppliers(supplierPage.records);
    setCategories(categoryPage.records);
  }

  async function loadProducts(nextKeyword = keyword) {
    setLoading(true);
    setError('');
    try {
      const page = await alibaba1688DataSource.products.loadPage({
        page: 1,
        pageSize: 50,
        keyword: nextKeyword.trim(),
      });
      setProducts(page.records);
      if (detail && !page.records.some((product) => product.id === detail.id)) {
        setDetail(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '产品库加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(productId: string) {
    setLoading(true);
    setError('');
    try {
      const nextDetail = await alibaba1688DataSource.products.loadDetail(productId);
      setDetail(nextDetail);
      setSkuForm((current) => ({ ...emptySkuForm, isActive: current.isActive }));
      setEditingSkuId('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '产品详情加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReferenceData();
    void loadProducts('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId('');
  }

  function resetSkuForm() {
    setSkuForm(emptySkuForm);
    setEditingSkuId('');
  }

  function beginEditProduct(product: Alibaba1688ProductRecord) {
    setEditingProductId(product.id);
    setProductForm({
      productCode: product.productCode || '',
      productName: product.productName || '',
      categoryId: product.categoryId || '',
      status: product.status || 'draft',
      storeId: product.storeId || '',
      supplierId: product.supplierId || '',
      remark: product.remark || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function beginEditSku(sku: Alibaba1688SkuRecord) {
    setEditingSkuId(sku.id);
    setSkuForm({
      skuCode: sku.skuCode || '',
      color: sku.color || '',
      size: sku.size || '',
      specification: sku.specification || '',
      purchasePrice: String(sku.purchasePrice ?? 0),
      wholesalePrice: String(sku.wholesalePrice ?? 0),
      suggestedPrice: String(sku.suggestedPrice ?? 0),
      minOrderQuantity: String(sku.minOrderQuantity ?? 0),
      stockQuantity: String(sku.stockQuantity ?? 0),
      isActive: Boolean(sku.isActive),
    });
  }

  async function handleSubmitProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看产品库。');
      return;
    }
    if (!productForm.productName.trim()) {
      setError('请填写产品名称。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...productForm,
        productCode: productForm.productCode.trim(),
        productName: productForm.productName.trim(),
      };
      const saved = editingProductId
        ? await alibaba1688DataSource.products.update(editingProductId, payload)
        : await alibaba1688DataSource.products.create(payload);
      setMessage(editingProductId ? '产品已保存。' : '产品已新增。');
      resetProductForm();
      await loadProducts();
      await loadDetail(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '产品保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveProduct(product: Alibaba1688ProductRecord) {
    if (!canManage || !window.confirm(`确认删除产品「${product.productName}」？`)) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await alibaba1688DataSource.products.remove(product.id);
      setMessage('产品已删除。');
      if (detail?.id === product.id) {
        setDetail(null);
      }
      await loadProducts();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '产品删除失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitSku(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      setError('请先选择产品。');
      return;
    }
    if (!canManage) {
      setError('当前账号只能查看 SKU。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        productId: detail.id,
        skuCode: skuForm.skuCode.trim(),
        color: skuForm.color.trim(),
        size: skuForm.size.trim(),
        specification: skuForm.specification.trim(),
        purchasePrice: toNumber(skuForm.purchasePrice),
        wholesalePrice: toNumber(skuForm.wholesalePrice),
        suggestedPrice: toNumber(skuForm.suggestedPrice),
        minOrderQuantity: toNumber(skuForm.minOrderQuantity),
        stockQuantity: toNumber(skuForm.stockQuantity),
        isActive: skuForm.isActive,
      };
      if (editingSkuId) {
        await alibaba1688DataSource.skus.update(editingSkuId, payload);
        setMessage('SKU 已保存。');
      } else {
        await alibaba1688DataSource.skus.create(payload);
        setMessage('SKU 已新增。');
      }
      resetSkuForm();
      await loadDetail(detail.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'SKU 保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSku(sku: Alibaba1688SkuRecord) {
    if (!detail || !canManage || !window.confirm(`确认删除 SKU「${sku.skuCode || sku.id.slice(0, 8)}」？`)) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await alibaba1688DataSource.skus.remove(sku.id);
      setMessage('SKU 已删除。');
      await loadDetail(detail.id);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'SKU 删除失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="alibaba-products-page">
      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 产品库</h2>
            <p>产品资料使用 PostgreSQL 存储，SKU 在产品详情中维护。</p>
          </div>
          <span>{canManage ? '可编辑' : '只读'}</span>
        </header>

        {message && <div className="store-success-message">{message}</div>}
        {error && <div className="store-error-message">{error}</div>}

        <div className="alibaba-product-toolbar">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索产品编码、名称、标题或关键词"
          />
          <button type="button" onClick={() => void loadProducts()} disabled={loading}>查询</button>
          <button type="button" onClick={() => { setKeyword(''); void loadProducts(''); }} disabled={loading}>重置</button>
        </div>

        {canManage && (
          <form className="alibaba-product-form" onSubmit={handleSubmitProduct}>
            <label>产品编码<input value={productForm.productCode} onChange={(event) => setProductForm((current) => ({ ...current, productCode: event.target.value }))} /></label>
            <label>产品名称<input value={productForm.productName} onChange={(event) => setProductForm((current) => ({ ...current, productName: event.target.value }))} /></label>
            <label>
              状态
              <select value={productForm.status} onChange={(event) => setProductForm((current) => ({ ...current, status: event.target.value }))}>
                {productStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <label>
              分类
              <select value={productForm.categoryId} onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}>
                <option value="">未选择</option>
                {categories.map((category) => <option key={category.id} value={category.settingKey}>{category.settingValue || category.settingKey}</option>)}
              </select>
            </label>
            <label>
              店铺
              <select value={productForm.storeId} onChange={(event) => setProductForm((current) => ({ ...current, storeId: event.target.value }))}>
                <option value="">未选择</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}
              </select>
            </label>
            <label>
              供应商
              <select value={productForm.supplierId} onChange={(event) => setProductForm((current) => ({ ...current, supplierId: event.target.value }))}>
                <option value="">未选择</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>)}
              </select>
            </label>
            <label>备注<input value={productForm.remark} onChange={(event) => setProductForm((current) => ({ ...current, remark: event.target.value }))} /></label>
            <div className="alibaba-form-actions">
              <button type="submit" className="store-primary-button" disabled={saving}>{editingProductId ? '保存产品' : '新增产品'}</button>
              {editingProductId && <button type="button" onClick={resetProductForm} disabled={saving}>取消</button>}
            </div>
          </form>
        )}

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
                <tr key={product.id}>
                  <td>{product.productCode || product.id.slice(0, 8)}</td>
                  <td>{product.productName}</td>
                  <td>{formatStatus(product.status)}</td>
                  <td>{product.categoryId ? categoryNameByKey.get(product.categoryId) ?? product.categoryId : '-'}</td>
                  <td>{product.storeId ? storeNameById.get(product.storeId) ?? product.storeId : '-'}</td>
                  <td>{product.supplierId ? supplierNameById.get(product.supplierId) ?? product.supplierId : '-'}</td>
                  <td>
                    <div className="alibaba-row-actions">
                      <button type="button" onClick={() => void loadDetail(product.id)} disabled={saving}>详情</button>
                      {canManage && (
                        <>
                          <button type="button" onClick={() => beginEditProduct(product)} disabled={saving}>编辑</button>
                          <button type="button" className="danger-action-button" onClick={() => void handleRemoveProduct(product)} disabled={saving}>删除</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={7}>暂无产品数据。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="excel-record-panel alibaba-product-detail">
        <header>
          <div>
            <h2>产品详情与 SKU</h2>
            <p>{detail ? `当前产品：${detail.productName}` : '从产品列表选择一个产品后查看 SKU。'}</p>
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
                    <th>拿货价</th>
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
                      <td>{Number(sku.purchasePrice ?? 0).toFixed(2)}</td>
                      <td>{Number(sku.wholesalePrice ?? 0).toFixed(2)}</td>
                      <td>{Number(sku.suggestedPrice ?? 0).toFixed(2)}</td>
                      <td>{sku.minOrderQuantity ?? 0}</td>
                      <td>{sku.stockQuantity ?? 0}</td>
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
                  {detail.skus.length === 0 && (
                    <tr><td colSpan={10}>暂无 SKU 数据。</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="empty-placeholder">选择产品后可维护 SKU。</p>
        )}
      </section>
    </div>
  );
}

export default Alibaba1688ProductsPage;
