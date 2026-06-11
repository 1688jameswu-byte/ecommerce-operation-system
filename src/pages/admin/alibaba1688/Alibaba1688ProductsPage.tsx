import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { alibaba1688DataSource, type Alibaba1688ProductStats } from '../../../data-source/alibaba1688DataSource';
import type {
  Alibaba1688ImageRecord,
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

interface PricingRow {
  id: string;
  color: string;
  skuCode: string;
  purchasePrice: string;
  wholesalePrice: string;
  supplierSkuCode: string;
  remark: string;
}

interface ProductPriceDraft {
  purchasePrice: string;
  supplierId: string;
  wholesalePrice: string;
}

interface ProductImageEditState {
  file: File | null;
  previewUrl: string;
  fileName: string;
}

interface CreatorUserLookup {
  userId?: string;
  username?: string;
  operatorId?: string;
  displayName?: string;
}

type ProductToastType = 'success' | 'warning';

interface ProductToast {
  message: string;
  type: ProductToastType;
}

const UNBOUND_SUPPLIER_FILTER = '__unbound__';

const productStatuses = [
  { value: 'missing_cost', label: '待补充成本' },
  { value: 'pending_price', label: '待定销售价' },
  { value: 'priced', label: '已定价' },
  { value: 'ready', label: '可上架' },
  { value: 'discarded', label: '已淘汰' },
  { value: 'draft', label: '待补充成本' },
  { value: 'disabled', label: '已淘汰' },
];

function getAlibaba1688ProductPermissions(currentUser: CurrentUser) {
  const role = String(currentUser?.role ?? '').toLowerCase();
  const isManager = role === 'admin' || role === 'leader';
  const isAdmin = role === 'admin';
  const allowedMenus = new Set(currentUser.allowedMenuKeys ?? []);
  const operations = new Set(currentUser.operationPermissionKeys ?? []);
  const platforms = new Set(currentUser.platformKeys ?? []);
  const roleCode = String(currentUser.roleCode ?? '');
  const has1688Platform = currentUser.platform === '1688' || platforms.has('1688') || roleCode.startsWith('1688_');
  const canSubmitProduct = isManager || (
    has1688Platform &&
    allowedMenus.has('1688-products') &&
    operations.has('create') &&
    operations.has('edit')
  );

  return {
    canSubmitProduct,
    canEditProductContent: canSubmitProduct,
    canViewCost: isManager,
    canViewSupplier: isManager,
    canViewSalesPrice: true,
    canEditPricing: isManager,
    canDeleteProduct: isAdmin,
  };
}

function statusLabel(status?: string) {
  return productStatuses.find((item) => item.value === status)?.label || status || '-';
}

function formatMoney(value?: number | string) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? `￥${next.toFixed(2)}` : '-';
}

function formatMoneyRange(min?: number, max?: number) {
  if (!min && !max) return '-';
  if (min && max && min !== max) return `${formatMoney(min)} - ${formatMoney(max)}`;
  return formatMoney(min ?? max);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (next: number) => String(next).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeCreatorDisplayName(value: string) {
  return value
    .replace(/^1688业务员[-_\s]*/, '')
    .replace(/^1688主管[-_\s]*/, '')
    .trim();
}

function formatCreatorName(createdBy: string | undefined, currentUser: CurrentUser, creatorNameByKey: Map<string, string>) {
  const creator = String(createdBy ?? '').trim();
  if (!creator) return '-';

  const mappedName = creatorNameByKey.get(creator);
  if (mappedName) {
    return mappedName;
  }

  const currentUserKeys = new Set([
    currentUser.userId,
    currentUser.username,
    currentUser.operatorId,
    currentUser.displayName,
  ].map((item) => String(item ?? '').trim()).filter(Boolean));

  if (!currentUserKeys.has(creator)) {
    return creator;
  }

  return normalizeCreatorDisplayName(String(currentUser.displayName || currentUser.username || creator)) || creator;
}

function toNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isRenderableImageSource(value?: string) {
  const next = String(value ?? '').trim();
  return Boolean(next) && (
    next.startsWith('http://') ||
    next.startsWith('https://') ||
    next.startsWith('data:') ||
    next.startsWith('/')
  );
}

function pickImageUrl(images: Alibaba1688ImageRecord[] = []) {
  return [...images]
    .sort((left, right) => {
      const leftRank = left.isMain ? 0 : left.imageType === 'main_image' ? 1 : 2;
      const rightRank = right.isMain ? 0 : right.imageType === 'main_image' ? 1 : 2;
      return leftRank - rightRank || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    })
    .map((image) => image.fileUrl || image.filePath || '')
    .find(Boolean) || '';
}

function ProductImage({ src, name, large = false }: { src?: string; name: string; large?: boolean }) {
  const className = large ? 'alibaba-product-image alibaba-product-image-large' : 'alibaba-product-image';
  if (isRenderableImageSource(src)) {
    return <img className={className} src={src} alt={name || '产品图片'} loading="lazy" />;
  }

  return <div className={`${className} alibaba-product-image-placeholder`}>{large ? '暂无主图' : '图'}</div>;
}

function ProductImagePreview({ src, name }: { src?: string; name: string }) {
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const canPreview = isRenderableImageSource(src);

  function showPreview(event: MouseEvent<HTMLSpanElement>) {
    if (!canPreview) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 312));
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 312));
    setPreviewPosition({ left, top });
  }

  return (
    <span className="alibaba-products-v1-image-preview" onMouseEnter={showPreview} onMouseLeave={() => setPreviewPosition(null)}>
      <ProductImage src={src} name={name} />
      {canPreview && previewPosition && (
        <img
          className="alibaba-products-v1-image-popover"
          src={src}
          alt={name || 'product image preview'}
          loading="lazy"
          style={{ left: previewPosition.left, top: previewPosition.top }}
        />
      )}
    </span>
  );
}

function settingLabel(setting: Alibaba1688SettingRecord) {
  return setting.settingValue || setting.settingKey;
}

function skuColorSummary(product: Alibaba1688ProductRecord) {
  const colors = product.skuColors ?? [];
  if (colors.length > 0) {
    const preview = colors.slice(0, 3).join('、');
    return `${preview}${colors.length > 3 ? '等' : ''}，共 ${product.skuCount ?? colors.length} 个 SKU`;
  }
  return product.skuCount ? `共 ${product.skuCount} 个 SKU` : '暂无颜色 SKU';
}

function calculateMargin(purchase: number, sale: number) {
  if (!sale || sale <= 0 || !purchase || purchase <= 0) return '-';
  return `${Math.round(((sale - purchase) / sale) * 100)}%`;
}

function isLossPrice(purchasePrice: number, wholesalePrice: number) {
  return purchasePrice > 0 && wholesalePrice > 0 && wholesalePrice < purchasePrice;
}

function buildPricingRows(skus: Alibaba1688SkuRecord[]): PricingRow[] {
  return skus.map((sku) => ({
    id: sku.id,
    color: sku.color || '',
    skuCode: sku.skuCode || '',
    purchasePrice: String(sku.purchasePrice ?? 0),
    wholesalePrice: String(sku.wholesalePrice ?? 0),
    supplierSkuCode: sku.supplierSkuCode || '',
    remark: sku.remark || '',
  }));
}

export function Alibaba1688ProductsPage({ currentUser }: Alibaba1688ProductsPageProps) {
  const permissions = useMemo(() => getAlibaba1688ProductPermissions(currentUser), [currentUser]);
  const [products, setProducts] = useState<Alibaba1688ProductRecord[]>([]);
  const [productStats, setProductStats] = useState<Alibaba1688ProductStats>({ totalProducts: 0, listedProducts: 0 });
  const [stores, setStores] = useState<Alibaba1688StoreRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Alibaba1688SupplierRecord[]>([]);
  const [categories, setCategories] = useState<Alibaba1688SettingRecord[]>([]);
  const [detail, setDetail] = useState<Alibaba1688ProductDetail | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [detailProductName, setDetailProductName] = useState('');
  const [detailProductCode, setDetailProductCode] = useState('');
  const [detailStatus, setDetailStatus] = useState('missing_cost');
  const [detailSupplierId, setDetailSupplierId] = useState('');
  const [detailRemark, setDetailRemark] = useState('');
  const [detailImageEdit, setDetailImageEdit] = useState<ProductImageEditState>({ file: null, previewUrl: '', fileName: '' });
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkSupplierId, setBulkSupplierId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, ProductPriceDraft>>({});
  const [creatorNameByKey, setCreatorNameByKey] = useState<Map<string, string>>(() => new Map());
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState<ProductToast | null>(null);
  const [error, setError] = useState('');

  const categoryNameByKey = useMemo(
    () => new Map(categories.map((category) => [category.settingKey, settingLabel(category)])),
    [categories],
  );
  const previewImageUrl = detail
    ? (detailImageEdit.previewUrl || detail.mainImageUrl || pickImageUrl(detail.images))
    : '';
  const hasProductActions = permissions.canEditProductContent || permissions.canDeleteProduct;
  const canBulkBindSupplier = permissions.canEditPricing && permissions.canViewSupplier;
  const productTableColumnCount = 6
    + (permissions.canViewCost ? 2 : 0)
    + (permissions.canViewSupplier ? 1 : 0)
    + (hasProductActions ? 1 : 0)
    + (canBulkBindSupplier ? 1 : 0);
  const skuTableColumnCount = 3
    + (permissions.canViewCost ? 2 : 0)
    + (permissions.canViewSupplier ? 2 : 0)
    + (permissions.canEditProductContent ? 1 : 0);
  const missingCostProducts = products.filter((product) => (product.missingCostCount ?? 0) > 0 || product.status === 'missing_cost' || product.status === 'draft').length;
  const pricedProducts = products.filter((product) => product.status === 'priced' || product.status === 'ready').length;
  const visibleProductIds = useMemo(() => products.map((product) => product.id), [products]);
  const allVisibleProductsSelected = visibleProductIds.length > 0 && visibleProductIds.every((id) => selectedProductIds.includes(id));

  async function loadReferenceData() {
    const [storePage, supplierPage, categoryPage] = await Promise.all([
      alibaba1688DataSource.stores.loadPage({ page: 1, pageSize: 100 }),
      permissions.canViewSupplier ? alibaba1688DataSource.suppliers.loadPage({ page: 1, pageSize: 100 }) : Promise.resolve({ records: [], total: 0, page: 1, pageSize: 100 }),
      alibaba1688DataSource.settings.loadPage({ page: 1, pageSize: 100, settingGroup: 'product_category', isActive: true }),
    ]);
    setStores(storePage.records);
    setSuppliers(supplierPage.records);
    setCategories(categoryPage.records);
  }

  async function loadCreatorNames() {
    if (currentUser.role !== 'admin') {
      return;
    }

    try {
      const response = await fetch('/api/auth/users', { credentials: 'include', cache: 'no-store' });
      const data = await response.json() as { success: boolean; users?: CreatorUserLookup[] };
      if (!data.success || !Array.isArray(data.users)) {
        return;
      }

      const next = new Map<string, string>();
      for (const user of data.users) {
        const displayName = normalizeCreatorDisplayName(String(user.displayName || user.username || user.userId || '').trim());
        if (!displayName) continue;
        [user.userId, user.username, user.operatorId, user.displayName]
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
          .forEach((key) => next.set(key, displayName));
      }
      setCreatorNameByKey(next);
    } catch {
      setCreatorNameByKey(new Map());
    }
  }

  async function loadProducts(overrides: Partial<{ keyword: string; status: string; categoryId: string; supplierId: string }> = {}) {
    const nextKeyword = overrides.keyword ?? keyword;
    const nextStatus = overrides.status ?? statusFilter;
    const nextCategory = overrides.categoryId ?? categoryFilter;
    const nextSupplier = permissions.canViewSupplier ? (overrides.supplierId ?? supplierFilter) : '';
    setLoading(true);
    setError('');
    try {
      const page = await alibaba1688DataSource.products.loadPage({
        page: 1,
        pageSize: 50,
        keyword: nextKeyword.trim(),
        status: nextStatus,
        categoryId: nextCategory,
        supplierId: nextSupplier,
      });
      setProducts(page.records);
      setPriceDrafts((current) => {
        const next = { ...current };
        for (const product of page.records) {
          if (!next[product.id]) {
            next[product.id] = {
              purchasePrice: product.minPurchasePrice ? String(product.minPurchasePrice) : '',
              supplierId: product.supplierId || '',
              wholesalePrice: product.minWholesalePrice ? String(product.minWholesalePrice) : '',
            };
          }
        }
        return next;
      });
      setProductStats(page.stats ?? { totalProducts: page.total, listedProducts: 0 });
      if (selectedProductId && !page.records.some((product) => product.id === selectedProductId)) {
        setSelectedProductId('');
        setDetail(null);
      }
      setSelectedProductIds((current) => current.filter((id) => page.records.some((product) => product.id === id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '产品库加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(productId: string) {
    setSelectedProductId(productId);
    setLoading(true);
    setError('');
    try {
      const nextDetail = await alibaba1688DataSource.products.loadDetail(productId);
      setDetail(nextDetail);
      setPricingRows(buildPricingRows(nextDetail.skus));
      setDetailProductName(nextDetail.productName || '');
      setDetailProductCode(nextDetail.productCode || '');
      setDetailStatus(nextDetail.status || 'missing_cost');
      setDetailSupplierId(nextDetail.supplierId || '');
      setDetailRemark(nextDetail.remark || '');
      setDetailImageEdit((current) => {
        if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return { file: null, previewUrl: '', fileName: '' };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '产品详情加载失败');
    } finally {
      setLoading(false);
    }
  }

  function closeDetailModal() {
    setSelectedProductId('');
    setDetail(null);
    setPricingRows([]);
    setDetailProductName('');
    setDetailProductCode('');
    setDetailStatus('missing_cost');
    setDetailSupplierId('');
    setDetailRemark('');
    setDetailImageEdit((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file: null, previewUrl: '', fileName: '' };
    });
  }

  useEffect(() => {
    void loadReferenceData();
    void loadCreatorNames();
    void loadProducts({ keyword: '', status: '', categoryId: '', supplierId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(message: string, type: ProductToastType = 'success') {
    setToast({ message, type });
  }

  function resetFilters() {
    setKeyword('');
    setStatusFilter('');
    setCategoryFilter('');
    setSupplierFilter('');
    void loadProducts({ keyword: '', status: '', categoryId: '', supplierId: '' });
  }

  function toggleProductSelection(productId: string, checked: boolean) {
    setSelectedProductIds((current) => {
      if (checked) {
        return current.includes(productId) ? current : [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
  }

  function toggleAllVisibleProducts(checked: boolean) {
    setSelectedProductIds((current) => {
      if (!checked) {
        return current.filter((id) => !visibleProductIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleProductIds]));
    });
  }

  function updatePricingRow(id: string, patch: Partial<PricingRow>) {
    setPricingRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (isLossPrice(toNumber(next.purchasePrice), toNumber(next.wholesalePrice))) {
        showToast('亏本，亏本！', 'warning');
      }
      return next;
    }));
  }

  function updateProductPriceDraft(productId: string, patch: Partial<ProductPriceDraft>) {
    setPriceDrafts((current) => ({
      ...current,
      [productId]: (() => {
        const next = {
          purchasePrice: current[productId]?.purchasePrice ?? '',
          supplierId: current[productId]?.supplierId ?? '',
          wholesalePrice: current[productId]?.wholesalePrice ?? '',
          ...patch,
        };
        if (isLossPrice(toNumber(next.purchasePrice), toNumber(next.wholesalePrice))) {
          showToast('亏本，亏本！', 'warning');
        }
        return next;
      })(),
    }));
  }

  function handleDetailImageFileChange(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setDetailImageEdit((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl, fileName: `${file.name}（保存时自动裁剪为 300×300）` };
    });
    setError('');
  }

  async function saveProductImage() {
    if (!detail || !permissions.canEditProductContent || !detailImageEdit.file) return;
    const firstSkuCode = pricingRows.find((row) => row.skuCode.trim())?.skuCode.trim() || detail.productCode || detail.id.slice(0, 8);
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const upload = await alibaba1688DataSource.uploadImage(detailImageEdit.file, firstSkuCode);
      const existingMainImage = [...detail.images]
        .sort((left, right) => {
          const leftRank = left.isMain ? 0 : left.imageType === 'main_image' ? 1 : 2;
          const rightRank = right.isMain ? 0 : right.imageType === 'main_image' ? 1 : 2;
          return leftRank - rightRank || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
        })[0];
      const imagePayload: Partial<Alibaba1688ImageRecord> = {
        productId: detail.id,
        imageType: 'main_image',
        imageStatus: 'ready',
        isMain: true,
        sortOrder: 0,
        fileName: upload.fileName,
        filePath: upload.filePath,
        fileUrl: upload.fileUrl,
      };
      if (existingMainImage) {
        await alibaba1688DataSource.images.update(existingMainImage.id, imagePayload);
      } else {
        await alibaba1688DataSource.images.create(imagePayload);
      }
      await loadDetail(detail.id);
      await loadProducts();
      showToast('保存成功');
      setMessage('产品主图已保存。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '产品主图保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function saveProductMeta() {
    if (!detail || !permissions.canEditPricing) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await alibaba1688DataSource.products.update(detail.id, {
        productName: detailProductName.trim(),
        productCode: detailProductCode.trim(),
        status: detailStatus,
        supplierId: detailSupplierId,
        remark: detailRemark,
      });
      setDetail((current) => current ? { ...current, ...saved } : current);
      await loadProducts();
      showToast('保存成功');
      setMessage('产品状态和供应商信息已保存。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '产品信息保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function saveSkuPricing(row: PricingRow) {
    if (!permissions.canEditProductContent) return;
    const purchasePrice = toNumber(row.purchasePrice);
    const wholesalePrice = toNumber(row.wholesalePrice);
    if (permissions.canEditPricing && isLossPrice(purchasePrice, wholesalePrice)) {
      showToast('亏本，亏本！', 'warning');
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload: Partial<Alibaba1688SkuRecord> = {
        color: row.color.trim(),
        skuCode: row.skuCode.trim(),
      };
      if (permissions.canEditPricing) {
        payload.purchasePrice = purchasePrice;
        payload.wholesalePrice = wholesalePrice;
        payload.supplierSkuCode = row.supplierSkuCode.trim();
        payload.remark = row.remark.trim();
      }
      await alibaba1688DataSource.skus.update(row.id, payload);
      if (detail) await loadDetail(detail.id);
      await loadProducts();
      showToast('保存成功');
      setMessage(`SKU ${row.skuCode || row.color || row.id.slice(0, 8)} 定价已保存。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'SKU 定价保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function saveProductPrices(product: Alibaba1688ProductRecord) {
    if (!permissions.canEditPricing) return;

    const draft = priceDrafts[product.id] ?? { purchasePrice: '', supplierId: product.supplierId || '', wholesalePrice: '' };
    const purchasePrice = toNumber(draft.purchasePrice);
    const wholesalePrice = toNumber(draft.wholesalePrice);

    if (purchasePrice <= 0 || wholesalePrice <= 0) {
      setError('请填写大于 0 的进货价和销售价。');
      return;
    }

    if (isLossPrice(purchasePrice, wholesalePrice)) {
      showToast('亏本，亏本！', 'warning');
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const productDetail = await alibaba1688DataSource.products.loadDetail(product.id);
      const activeSkus = productDetail.skus.filter((sku) => sku.isActive !== false);
      if (activeSkus.length === 0) {
        setError('该产品暂无可定价 SKU，请先新增颜色 SKU。');
        return;
      }

      await Promise.all(activeSkus.map((sku) => alibaba1688DataSource.skus.update(sku.id, {
        purchasePrice,
        wholesalePrice,
      })));
      await alibaba1688DataSource.products.update(product.id, {
        status: 'priced',
        supplierId: draft.supplierId || null,
      } as Partial<Alibaba1688ProductRecord>);
      await loadProducts();
      showToast('保存成功');
      setMessage(`${product.productName || product.productCode || '产品'} 价格已保存。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '产品价格保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function bindSelectedProductsToSupplier() {
    if (!canBulkBindSupplier) return;
    if (selectedProductIds.length === 0) {
      setError('请先选择需要绑定供应商的产品。');
      return;
    }
    if (!bulkSupplierId) {
      setError('请选择要绑定的供应商。');
      return;
    }

    const supplier = suppliers.find((item) => item.id === bulkSupplierId);
    const supplierName = supplier?.supplierName || '所选供应商';
    if (!window.confirm(`确认将 ${selectedProductIds.length} 个产品绑定到「${supplierName}」吗？`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const results = await Promise.allSettled(
        selectedProductIds.map((productId) => alibaba1688DataSource.products.update(productId, {
          supplierId: bulkSupplierId,
        } as Partial<Alibaba1688ProductRecord>)),
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      setSelectedProductIds([]);
      setBulkSupplierId('');
      await loadProducts();
      if (failedCount > 0) {
        setError(`已成功绑定 ${successCount} 个产品，${failedCount} 个产品绑定失败，请稍后重试。`);
      } else {
        showToast('批量绑定成功');
        setMessage(`已将 ${successCount} 个产品绑定到「${supplierName}」。`);
      }
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : '批量绑定供应商失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product: Alibaba1688ProductRecord) {
    if (!permissions.canDeleteProduct) {
      setError('当前账号无权删除产品。');
      return;
    }
    const productName = product.productName || product.productCode || product.id.slice(0, 8);
    if (!window.confirm(`确认删除产品“${productName}”？删除后会同时删除该产品的 SKU、图片素材记录和上架任务。`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const productDetail = await alibaba1688DataSource.products.loadDetail(product.id);
      await Promise.all(productDetail.listingTasks.map((task) => alibaba1688DataSource.listingTasks.remove(task.id)));
      await Promise.all(productDetail.images.map((image) => alibaba1688DataSource.images.remove(image.id)));
      await Promise.all(productDetail.skus.map((sku) => alibaba1688DataSource.skus.remove(sku.id)));
      await alibaba1688DataSource.products.remove(product.id);
      if (selectedProductId === product.id) {
        closeDetailModal();
      }
      await loadProducts();
      showToast('删除成功');
      setMessage('产品已删除。');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '产品删除失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="alibaba-products-v1-page">
      {toast && (
        <div className={`alibaba-products-v1-toast ${toast.type === 'warning' ? 'is-warning' : 'is-success'}`}>
          {toast.message}
        </div>
      )}
      <section className="alibaba-products-v1-main">
        <header className="alibaba-products-v1-header">
          <span aria-hidden="true" />
          {permissions.canSubmitProduct && (
            <a className="store-primary-button alibaba-create-link" href="/admin/1688-business/products/new">
              新增产品
            </a>
          )}
        </header>

        {message && <div className="store-success-message">{message}</div>}
        {error && <div className="store-error-message">{error}</div>}

        <div className="alibaba-products-v1-summary">
          <article><span>当前产品</span><strong>{productStats.totalProducts.toLocaleString()}</strong></article>
          <article><span>待补充成本</span><strong>{missingCostProducts.toLocaleString()}</strong></article>
          <article><span>已定价/可上架</span><strong>{pricedProducts.toLocaleString()}</strong></article>
          {permissions.canViewSupplier && <article><span>供应商缺失</span><strong>{products.filter((product) => !product.supplierId).length}</strong></article>}
        </div>

        <div className="alibaba-products-v1-toolbar">
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索产品名称 / SKU / 关键词" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">全部状态</option>
            {productStatuses.slice(0, 5).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">全部类目</option>
            {categories.map((category) => <option key={category.id} value={category.settingKey}>{settingLabel(category)}</option>)}
          </select>
          {permissions.canViewSupplier && (
            <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
              <option value="">全部供应商</option>
              <option value={UNBOUND_SUPPLIER_FILTER}>未绑定供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void loadProducts()} disabled={loading}>筛选</button>
          <button type="button" onClick={resetFilters} disabled={loading}>重置</button>
        </div>

        {canBulkBindSupplier && (
          <div className="alibaba-products-v1-bulk-toolbar">
            <span>已选 {selectedProductIds.length} 个产品</span>
            <select value={bulkSupplierId} onChange={(event) => setBulkSupplierId(event.target.value)}>
              <option value="">选择供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void bindSelectedProductsToSupplier()}
              disabled={saving || selectedProductIds.length === 0 || !bulkSupplierId}
            >
              批量绑定供应商
            </button>
            {selectedProductIds.length > 0 && (
              <button type="button" onClick={() => setSelectedProductIds([])} disabled={saving}>
                清空选择
              </button>
            )}
          </div>
        )}

        <div className="alibaba-products-v1-table-wrap">
          <table className="alibaba-products-v1-table">
            <thead>
              <tr>
                {canBulkBindSupplier && (
                  <th className="alibaba-products-v1-select-col">
                    <input
                      type="checkbox"
                      checked={allVisibleProductsSelected}
                      onChange={(event) => toggleAllVisibleProducts(event.target.checked)}
                      aria-label="选择当前页产品"
                    />
                  </th>
                )}
                <th>产品</th>
                <th>颜色 SKU</th>
                <th>销售价</th>
                {permissions.canViewCost && <th>进货价</th>}
                {permissions.canViewCost && <th>毛利率</th>}
                {permissions.canViewSupplier && <th>供应商</th>}
                <th>状态</th>
                <th>创建人</th>
                <th>最近更新</th>
                {hasProductActions && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const purchaseMin = product.minPurchasePrice;
                const purchaseMax = product.maxPurchasePrice;
                const saleMin = product.minWholesalePrice;
                const saleMax = product.maxWholesalePrice;
                const draft = priceDrafts[product.id] ?? { purchasePrice: '', supplierId: product.supplierId || '', wholesalePrice: '' };
                return (
                  <tr key={product.id}>
                    {canBulkBindSupplier && (
                      <td className="alibaba-products-v1-select-col">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={(event) => toggleProductSelection(product.id, event.target.checked)}
                          aria-label={`选择 ${product.productName || product.productCode || product.id}`}
                        />
                      </td>
                    )}
                    <td>
                      <div className="alibaba-products-v1-product-cell">
                        <ProductImagePreview src={product.mainImageUrl} name={product.productName} />
                        <div>
                          <strong>{product.productName || '-'}</strong>
                          <span>{product.productCode || product.id.slice(0, 8)}</span>
                          {product.categoryId && <em>{categoryNameByKey.get(product.categoryId) ?? product.categoryId}</em>}
                        </div>
                      </div>
                    </td>
                    <td>{skuColorSummary(product)}</td>
                    <td>
                      {permissions.canEditPricing ? (
                        <input
                          className="alibaba-products-v1-price-input"
                          value={draft.wholesalePrice}
                          placeholder={formatMoneyRange(saleMin, saleMax)}
                          onChange={(event) => updateProductPriceDraft(product.id, { wholesalePrice: event.target.value })}
                        />
                      ) : formatMoneyRange(saleMin, saleMax)}
                    </td>
                    {permissions.canViewCost && (
                      <td>
                        <input
                          className="alibaba-products-v1-price-input"
                          value={draft.purchasePrice}
                          placeholder={formatMoneyRange(purchaseMin, purchaseMax)}
                          onChange={(event) => updateProductPriceDraft(product.id, { purchasePrice: event.target.value })}
                        />
                      </td>
                    )}
                    {permissions.canViewCost && <td>{calculateMargin(Number(purchaseMin), Number(saleMin))}{(product.missingCostCount ?? 0) > 0 && <span className="alibaba-products-v1-warning">缺成本 {product.missingCostCount}</span>}</td>}
                    {permissions.canViewSupplier && (
                      <td>
                        <select
                          className="alibaba-products-v1-supplier-select"
                          value={draft.supplierId}
                          onChange={(event) => updateProductPriceDraft(product.id, { supplierId: event.target.value })}
                        >
                          <option value="">未绑定</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td><span className={`alibaba-status-badge status-${product.status || 'missing_cost'}`}>{statusLabel(product.status)}</span></td>
                    <td>{formatCreatorName(product.createdBy, currentUser, creatorNameByKey)}</td>
                    <td>{formatDateTime(product.latestUpdatedAt || product.updatedAt)}</td>
                    {hasProductActions && (
                      <td>
                        {permissions.canEditPricing && (
                          <button
                            type="button"
                            className="alibaba-products-v1-save-price"
                            onClick={() => void saveProductPrices(product)}
                            disabled={saving}
                          >
                            保存
                          </button>
                        )}
                        {permissions.canEditProductContent && (
                          <button
                            type="button"
                            className="alibaba-products-v1-edit"
                            onClick={() => void loadDetail(product.id)}
                            disabled={loading}
                          >
                            编辑
                          </button>
                        )}
                        {permissions.canDeleteProduct && (
                          <button
                            type="button"
                            className="alibaba-products-v1-delete"
                            onClick={() => void removeProduct(product)}
                            disabled={saving}
                          >
                            删除
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!loading && products.length === 0 && (
                <tr><td colSpan={productTableColumnCount}>暂无产品数据。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <div className="alibaba-products-v1-modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑产品">
          <section className="alibaba-products-v1-edit-modal">
            <header>
              <div>
                <h3>编辑产品</h3>
                <p>{detail.productCode || detail.id.slice(0, 8)}</p>
              </div>
              <button type="button" onClick={closeDetailModal}>关闭</button>
            </header>

            <section className="alibaba-products-v1-edit-basic">
              <div className="alibaba-products-v1-edit-image-panel">
                <ProductImage src={previewImageUrl} name={detail.productName} large />
                {permissions.canEditProductContent && (
                  <div className="alibaba-products-v1-image-actions">
                    <label>
                      选择新主图
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(event) => handleDetailImageFileChange(event.target.files?.[0])}
                        disabled={saving}
                      />
                    </label>
                    <span>{detailImageEdit.fileName || '未选择新主图'}</span>
                    <button type="button" onClick={() => void saveProductImage()} disabled={saving || !detailImageEdit.file}>
                      保存主图
                    </button>
                  </div>
                )}
              </div>
              <div className="alibaba-products-v1-admin-form">
                <label>
                  产品名称
                  <input value={detailProductName} onChange={(event) => setDetailProductName(event.target.value)} disabled={!permissions.canEditPricing} />
                </label>
                <label>
                  产品编号 / SPU
                  <input value={detailProductCode} onChange={(event) => setDetailProductCode(event.target.value)} disabled={!permissions.canEditPricing} />
                </label>
                <label>
                  状态
                  <select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value)} disabled={!permissions.canEditPricing}>
                    {productStatuses.slice(0, 5).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                {permissions.canViewSupplier && (
                  <label>
                    供应商
                    <select value={detailSupplierId} onChange={(event) => setDetailSupplierId(event.target.value)} disabled={!permissions.canEditPricing}>
                      <option value="">未绑定</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>)}
                    </select>
                  </label>
                )}
                <label className="wide">
                  业务备注
                  <textarea value={detailRemark} onChange={(event) => setDetailRemark(event.target.value)} disabled={!permissions.canEditPricing} rows={3} />
                </label>
                {permissions.canEditPricing && <button type="button" onClick={() => void saveProductMeta()} disabled={saving}>保存产品信息</button>}
              </div>
            </section>

            <section className="alibaba-products-v1-sku-panel">
              <h4>{permissions.canEditPricing ? '颜色 SKU 定价' : '颜色 SKU 信息'}</h4>
              <div className="alibaba-products-v1-sku-table-wrap">
                <table className="alibaba-products-v1-sku-table">
                  <thead>
                    <tr>
                      <th>颜色</th>
                      <th>SKU 编号</th>
                      {permissions.canViewCost && <th>进货价</th>}
                      {permissions.canViewSalesPrice && <th>销售价</th>}
                      {permissions.canViewCost && <th>毛利率</th>}
                      {permissions.canViewSupplier && <th>供应商货号</th>}
                      {permissions.canViewSupplier && <th>管理备注</th>}
                      {permissions.canEditProductContent && <th>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pricingRows.map((row) => (
                      <tr key={row.id}>
                        <td>{permissions.canEditProductContent ? <input value={row.color} onChange={(event) => updatePricingRow(row.id, { color: event.target.value })} /> : row.color || '-'}</td>
                        <td>{permissions.canEditProductContent ? <input value={row.skuCode} onChange={(event) => updatePricingRow(row.id, { skuCode: event.target.value })} /> : row.skuCode || '-'}</td>
                        {permissions.canViewCost && <td><input value={row.purchasePrice} onChange={(event) => updatePricingRow(row.id, { purchasePrice: event.target.value })} disabled={!permissions.canEditPricing} /></td>}
                        {permissions.canViewSalesPrice && <td><input value={row.wholesalePrice} onChange={(event) => updatePricingRow(row.id, { wholesalePrice: event.target.value })} disabled={!permissions.canEditPricing} /></td>}
                        {permissions.canViewCost && <td>{calculateMargin(toNumber(row.purchasePrice), toNumber(row.wholesalePrice))}</td>}
                        {permissions.canViewSupplier && <td><input value={row.supplierSkuCode} onChange={(event) => updatePricingRow(row.id, { supplierSkuCode: event.target.value })} disabled={!permissions.canEditPricing} /></td>}
                        {permissions.canViewSupplier && <td><input value={row.remark} onChange={(event) => updatePricingRow(row.id, { remark: event.target.value })} disabled={!permissions.canEditPricing} /></td>}
                        {permissions.canEditProductContent && <td><button type="button" onClick={() => void saveSkuPricing(row)} disabled={saving}>保存</button></td>}
                      </tr>
                    ))}
                    {pricingRows.length === 0 && <tr><td colSpan={skuTableColumnCount}>暂无颜色 SKU。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}

export default Alibaba1688ProductsPage;
