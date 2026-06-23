import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type { CurrentUser } from '../../../types/auth';
import type {
  Alibaba1688ImageRecord,
  Alibaba1688ProductRecord,
  Alibaba1688SkuRecord,
} from '../../../types/alibaba1688';

interface Alibaba1688ImagesPageProps {
  currentUser: CurrentUser;
}

const imageTypeOptions = [
  { value: 'raw_photo', label: '原始拍摄图' },
  { value: 'ai_generated', label: 'AI生成图' },
  { value: 'main_image', label: '主图' },
  { value: 'white_background', label: '白底图' },
  { value: 'size_image', label: '尺寸图' },
  { value: 'detail_image', label: '详情图' },
  { value: 'scene_image', label: '场景图' },
  { value: 'sku_image', label: 'SKU图' },
  { value: 'detail_page_image', label: '详情页长图' },
];

const imageStatusOptions = [
  { value: 'pending_photo', label: '待拍照' },
  { value: 'pending_edit', label: '待修图' },
  { value: 'ready', label: '可用' },
  { value: 'used', label: '已使用' },
  { value: 'need_redo', label: '停用/需重做' },
];

const emptyImageForm = {
  productId: '',
  skuId: '',
  imageType: 'raw_photo',
  imageStatus: 'pending_photo',
  fileName: '',
  filePath: '',
  fileUrl: '',
  sortOrder: '0',
  isMain: false,
  remark: '',
};

function canManage1688(currentUser: CurrentUser) {
  return currentUser.role === 'admin' ||
    currentUser.role === 'leader' ||
    (
      (currentUser.platform === '1688' || currentUser.platformKeys?.includes('1688')) &&
      currentUser.allowedMenuKeys?.includes('1688-images') &&
      currentUser.operationPermissionKeys?.includes('create') &&
      currentUser.operationPermissionKeys?.includes('edit')
    );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toInteger(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.floor(next) : 0;
}

function formatOption(options: { value: string; label: string }[], value?: string) {
  return options.find((item) => item.value === value)?.label ?? value ?? '-';
}

function isRenderableImageSource(value?: string) {
  const src = String(value ?? '').trim();
  return Boolean(src && (
    /^https?:\/\//i.test(src) ||
    src.startsWith('/') ||
    src.startsWith('data:image/') ||
    src.startsWith('blob:')
  ));
}

function getImagePreviewSource(image: Alibaba1688ImageRecord) {
  const fileUrl = String(image.fileUrl ?? '').trim();
  const filePath = String(image.filePath ?? '').trim();
  if (isRenderableImageSource(fileUrl)) return fileUrl;
  if (isRenderableImageSource(filePath)) return filePath;
  return '';
}

function ImageMaterialPreview({ image }: { image: Alibaba1688ImageRecord }) {
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const src = getImagePreviewSource(image);
  const canPreview = isRenderableImageSource(src);
  const name = image.fileName || image.id.slice(0, 8);

  function showPreview(event: MouseEvent<HTMLSpanElement>) {
    if (!canPreview) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const previewSize = 520;
    const gap = 12;
    const hasRoomOnRight = rect.right + gap + previewSize <= window.innerWidth - gap;
    const preferredLeft = hasRoomOnRight ? rect.right + gap : rect.left - previewSize - gap;
    const left = Math.max(gap, Math.min(preferredLeft, window.innerWidth - previewSize - gap));
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - previewSize - gap));
    setPreviewPosition({ left, top });
  }

  return (
    <span className="alibaba-image-material-preview" onMouseEnter={showPreview} onMouseLeave={() => setPreviewPosition(null)}>
      {canPreview ? (
        <img className="alibaba-product-image" src={src} alt={name} loading="lazy" />
      ) : (
        <span className="alibaba-product-image alibaba-product-image-placeholder">图</span>
      )}
      {canPreview && previewPosition && createPortal(
        <img
          className="alibaba-image-material-popover"
          src={src}
          alt={`${name} preview`}
          style={{ left: previewPosition.left, top: previewPosition.top }}
        />,
        document.body,
      )}
    </span>
  );
}

function Alibaba1688ImagesPage({ currentUser }: Alibaba1688ImagesPageProps) {
  const canManage = canManage1688(currentUser);
  const [images, setImages] = useState<Alibaba1688ImageRecord[]>([]);
  const [products, setProducts] = useState<Alibaba1688ProductRecord[]>([]);
  const [skus, setSkus] = useState<Alibaba1688SkuRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [imageForm, setImageForm] = useState(emptyImageForm);
  const [editingImageId, setEditingImageId] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const productNameById = useMemo(() => new Map(products.map((product) => [product.id, product.productName])), [products]);
  const skuNameById = useMemo(() => new Map(skus.map((sku) => [sku.id, sku.skuCode || sku.id.slice(0, 8)])), [skus]);
  const skuById = useMemo(() => new Map(skus.map((sku) => [sku.id, sku])), [skus]);

  async function loadImages(nextKeyword = keyword) {
    setLoading(true);
    setError('');

    try {
      const [imagePage, productPage, skuPage] = await Promise.all([
        alibaba1688DataSource.images.loadPage({ page: 1, pageSize: 100, keyword: nextKeyword.trim() }),
        alibaba1688DataSource.products.loadPage({ page: 1, pageSize: 100 }),
        alibaba1688DataSource.skus.loadPage({ page: 1, pageSize: 100 }),
      ]);
      setImages(imagePage.records);
      setProducts(productPage.records);
      setSkus(skuPage.records);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadImages('');
  }, []);

  function resetImageForm() {
    setImageForm(emptyImageForm);
    setEditingImageId('');
    setIsEditorOpen(false);
  }

  function beginCreateImage() {
    setImageForm(emptyImageForm);
    setEditingImageId('');
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  function beginEditImage(image: Alibaba1688ImageRecord) {
    setImageForm({
      productId: image.productId ?? '',
      skuId: image.skuId ?? '',
      imageType: image.imageType || 'raw_photo',
      imageStatus: image.imageStatus || 'pending_photo',
      fileName: image.fileName ?? '',
      filePath: image.filePath ?? '',
      fileUrl: image.fileUrl ?? '',
      sortOrder: String(image.sortOrder ?? 0),
      isMain: image.isMain,
      remark: image.remark ?? '',
    });
    setEditingImageId(image.id);
    setIsEditorOpen(true);
    setError('');
    setMessage('');
  }

  function handleSkuChange(skuId: string) {
    const sku = skuById.get(skuId);
    setImageForm((current) => ({
      ...current,
      skuId,
      productId: sku?.productId || current.productId,
    }));
  }

  async function handleSubmitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      setError('当前账号只能查看图片素材，不能新增或编辑。');
      return;
    }

    if (!imageForm.filePath.trim() && !imageForm.fileUrl.trim()) {
      setError('请至少填写图片路径或图片 URL。数据库只保存路径，不保存图片本体。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        productId: imageForm.productId || undefined,
        skuId: imageForm.skuId || undefined,
        imageType: imageForm.imageType,
        imageStatus: imageForm.imageStatus,
        fileName: imageForm.fileName.trim(),
        filePath: imageForm.filePath.trim(),
        fileUrl: imageForm.fileUrl.trim(),
        sortOrder: toInteger(imageForm.sortOrder),
        isMain: imageForm.isMain,
        remark: imageForm.remark.trim(),
      };

      if (editingImageId) {
        await alibaba1688DataSource.images.update(editingImageId, payload);
        setMessage('图片素材已更新。');
      } else {
        await alibaba1688DataSource.images.create(payload);
        setMessage('图片素材已新增。');
      }

      resetImageForm();
      await loadImages();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleImage(image: Alibaba1688ImageRecord) {
    if (!canManage) {
      setError('当前账号只能查看图片素材，不能启用或停用。');
      return;
    }

    const shouldEnable = image.imageStatus === 'need_redo';
    const actionText = shouldEnable ? '启用' : '停用';
    if (!window.confirm(`确认${actionText}图片素材“${image.fileName || image.filePath || image.id.slice(0, 8)}”？`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.images.update(image.id, {
        imageStatus: shouldEnable ? 'ready' : 'need_redo',
      });
      setMessage(`图片素材已${actionText}。`);
      await loadImages();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveImage(image: Alibaba1688ImageRecord) {
    if (!canManage) {
      setError('当前账号只能查看图片素材，不能删除。');
      return;
    }

    if (!window.confirm(`确认删除图片素材“${image.fileName || image.filePath || image.id.slice(0, 8)}”？此操作只删除素材记录，不删除图片文件本体。`)) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await alibaba1688DataSource.images.remove(image.id);
      setMessage('图片素材记录已删除。');
      await loadImages();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="alibaba-images-page">
      <section className="excel-record-panel">
        <header>
          <div>
            <h2>1688 图片素材</h2>
          </div>
          <span>{images.length} 条素材</span>
        </header>

        <div className="alibaba-product-toolbar alibaba-image-toolbar">
          <label>
            搜索素材
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="文件名、路径或 URL"
            />
          </label>
          <button type="button" className="store-primary-button" onClick={() => void loadImages()} disabled={loading || saving}>
            查询
          </button>
          {canManage && (
            <button type="button" className="store-primary-button" onClick={beginCreateImage} disabled={saving}>
              新增素材
            </button>
          )}
        </div>

        {error && <div className="alibaba-settings-error"><strong>{error}</strong></div>}
        {message && <p className="alibaba-settings-message">{message}</p>}

        <div className="alibaba-product-table-wrap">
          <table className="alibaba-product-table alibaba-image-table">
            <thead>
              <tr>
                <th>预览</th>
                <th>ID</th>
                <th>文件/路径</th>
                <th>类型</th>
                <th>状态</th>
                <th>产品</th>
                <th>SKU</th>
                <th>主图</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {images.map((image) => (
                <tr key={image.id}>
                  <td><ImageMaterialPreview image={image} /></td>
                  <td>{image.id.slice(0, 8)}</td>
                  <td>
                    <div className="alibaba-image-material-path">
                      <strong>{image.fileName || '-'}</strong>
                      <span title={image.filePath || image.fileUrl || '-'}>{image.filePath || image.fileUrl || '-'}</span>
                    </div>
                  </td>
                  <td>{formatOption(imageTypeOptions, image.imageType)}</td>
                  <td>
                    <span className={image.imageStatus === 'need_redo' ? 'alibaba-state-off' : 'alibaba-state-on'}>
                      {formatOption(imageStatusOptions, image.imageStatus)}
                    </span>
                  </td>
                  <td>{image.productId ? productNameById.get(image.productId) ?? image.productId.slice(0, 8) : '-'}</td>
                  <td>{image.skuId ? skuNameById.get(image.skuId) ?? image.skuId.slice(0, 8) : '-'}</td>
                  <td>{image.isMain ? '是' : '否'}</td>
                  <td>{image.sortOrder}</td>
                  <td>
                    {canManage ? (
                      <div className="alibaba-row-actions">
                        <button type="button" onClick={() => beginEditImage(image)} disabled={saving}>编辑</button>
                        <button type="button" onClick={() => void handleToggleImage(image)} disabled={saving}>
                          {image.imageStatus === 'need_redo' ? '启用' : '停用'}
                        </button>
                        <button type="button" className="danger-action-button" onClick={() => void handleRemoveImage(image)} disabled={saving}>删除</button>
                      </div>
                    ) : '只读'}
                  </td>
                </tr>
              ))}
              {!loading && images.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="admin-home-empty">暂无图片素材，可由管理员或主管新增路径记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isEditorOpen && canManage && (
        <div className="alibaba-modal-backdrop" role="presentation">
          <form className="alibaba-edit-modal" onSubmit={handleSubmitImage}>
            <header>
              <div>
                <h2>{editingImageId ? '编辑图片素材' : '新增图片素材'}</h2>
                <p>数据库只保存文件路径或 URL；图片文件本体仍由共享盘、对象存储或外部系统管理。</p>
              </div>
              <button type="button" onClick={resetImageForm} disabled={saving}>关闭</button>
            </header>

            <div className="alibaba-modal-form-grid">
              <label>
                关联产品
                <select value={imageForm.productId} onChange={(event) => setImageForm((current) => ({ ...current, productId: event.target.value, skuId: '' }))}>
                  <option value="">未关联</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.productName || product.productCode || product.id.slice(0, 8)}</option>
                  ))}
                </select>
              </label>
              <label>
                关联 SKU
                <select value={imageForm.skuId} onChange={(event) => handleSkuChange(event.target.value)}>
                  <option value="">未关联</option>
                  {skus
                    .filter((sku) => !imageForm.productId || sku.productId === imageForm.productId)
                    .map((sku) => (
                      <option key={sku.id} value={sku.id}>{sku.skuCode || sku.id.slice(0, 8)}</option>
                    ))}
                </select>
              </label>
              <label>
                图片类型
                <select value={imageForm.imageType} onChange={(event) => setImageForm((current) => ({ ...current, imageType: event.target.value }))}>
                  {imageTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                图片状态
                <select value={imageForm.imageStatus} onChange={(event) => setImageForm((current) => ({ ...current, imageStatus: event.target.value }))}>
                  {imageStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                文件名
                <input value={imageForm.fileName} onChange={(event) => setImageForm((current) => ({ ...current, fileName: event.target.value }))} />
              </label>
              <label>
                排序
                <input value={imageForm.sortOrder} onChange={(event) => setImageForm((current) => ({ ...current, sortOrder: event.target.value }))} />
              </label>
              <label className="alibaba-checkbox-label">
                <input type="checkbox" checked={imageForm.isMain} onChange={(event) => setImageForm((current) => ({ ...current, isMain: event.target.checked }))} />
                设为主图
              </label>
              <label className="alibaba-form-wide">
                图片路径
                <input value={imageForm.filePath} onChange={(event) => setImageForm((current) => ({ ...current, filePath: event.target.value }))} placeholder="例如：F:\\1688\\products\\P001\\main.jpg" />
              </label>
              <label className="alibaba-form-wide">
                图片 URL
                <input value={imageForm.fileUrl} onChange={(event) => setImageForm((current) => ({ ...current, fileUrl: event.target.value }))} placeholder="https://..." />
              </label>
              <label className="alibaba-form-wide">
                备注
                <textarea value={imageForm.remark} onChange={(event) => setImageForm((current) => ({ ...current, remark: event.target.value }))} />
              </label>
            </div>

            <div className="alibaba-form-actions alibaba-modal-actions">
              <button type="button" onClick={resetImageForm} disabled={saving}>取消</button>
              <button type="submit" className="store-primary-button" disabled={saving}>
                {editingImageId ? '保存修改' : '新增素材'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default Alibaba1688ImagesPage;
