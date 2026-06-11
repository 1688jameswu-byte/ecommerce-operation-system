import { useEffect, useMemo, useState } from 'react';
import { alibaba1688DataSource } from '../../../data-source/alibaba1688DataSource';
import type {
  Alibaba1688ImageRecord,
  Alibaba1688ProductRecord,
  Alibaba1688SkuRecord,
} from '../../../types/alibaba1688';
import type { CurrentUser } from '../../../types/auth';

interface Alibaba1688ProductCreatePageProps {
  currentUser: CurrentUser;
}

interface SkuInputRow {
  id: string;
  skuCode: string;
}

interface ProductCreateForm {
  mainImagePath: string;
  productName: string;
  selectedColors: string[];
  skuRowsByColor: Record<string, SkuInputRow[]>;
}

const colorOptions = [
  { label: '钢色', suffix: 'S' },
  { label: '金色', suffix: 'G' },
  { label: '白色', suffix: 'W' },
  { label: '玫瑰金', suffix: 'RG' },
  { label: '黑色', suffix: 'B' },
];

const emptyForm: ProductCreateForm = {
  mainImagePath: '',
  productName: '',
  selectedColors: [],
  skuRowsByColor: {},
};

function createSkuInputRow(): SkuInputRow {
  return {
    id: `sku-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    skuCode: '',
  };
}

function getAlibaba1688ProductPermissions(currentUser: CurrentUser) {
  const role = String(currentUser?.role ?? '').toLowerCase();
  const isManager = role === 'admin' || role === 'leader';
  const allowedMenus = new Set(currentUser.allowedMenuKeys ?? []);
  const operations = new Set(currentUser.operationPermissionKeys ?? []);
  const platforms = new Set(currentUser.platformKeys ?? []);
  const roleCode = String(currentUser.roleCode ?? '');
  const has1688Platform = currentUser.platform === '1688' || platforms.has('1688') || roleCode.startsWith('1688_');

  return {
    canSubmitProduct: isManager || (
      has1688Platform &&
      allowedMenus.has('1688-products') &&
      operations.has('create') &&
      operations.has('edit')
    ),
  };
}

function toImageColumns(fileValue: string) {
  const trimmed = fileValue.trim();
  const isUrl = /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/');
  const fileName = trimmed.split(/[\\/]/).pop() || trimmed;
  return {
    fileName,
    filePath: isUrl ? '' : trimmed,
    fileUrl: isUrl ? trimmed : '',
  };
}

export function Alibaba1688ProductCreatePage({ currentUser }: Alibaba1688ProductCreatePageProps) {
  const permissions = useMemo(() => getAlibaba1688ProductPermissions(currentUser), [currentUser]);
  const [form, setForm] = useState<ProductCreateForm>(emptyForm);
  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [mainImagePreviewUrl, setMainImagePreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const skuGroups = useMemo(
    () => form.selectedColors.map((color) => ({
      color,
      rows: form.skuRowsByColor[color]?.length ? form.skuRowsByColor[color] : [createSkuInputRow()],
    })),
    [form.selectedColors, form.skuRowsByColor],
  );

  const skuPreview = useMemo(
    () => skuGroups.flatMap((group) => group.rows.map((row, index) => ({
      color: group.color,
      row,
      index,
      skuCode: row.skuCode,
    }))),
    [skuGroups],
  );

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    return () => {
      if (mainImagePreviewUrl) {
        URL.revokeObjectURL(mainImagePreviewUrl);
      }
    };
  }, [mainImagePreviewUrl]);

  function toggleColor(color: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      selectedColors: checked
        ? [...current.selectedColors, color]
        : current.selectedColors.filter((item) => item !== color),
      skuRowsByColor: checked
        ? { ...current.skuRowsByColor, [color]: current.skuRowsByColor[color]?.length ? current.skuRowsByColor[color] : [createSkuInputRow()] }
        : Object.fromEntries(Object.entries(current.skuRowsByColor).filter(([key]) => key !== color)),
    }));
  }

  function addSkuRow(color: string) {
    setForm((current) => ({
      ...current,
      skuRowsByColor: {
        ...current.skuRowsByColor,
        [color]: [...(current.skuRowsByColor[color] ?? [createSkuInputRow()]), createSkuInputRow()],
      },
    }));
  }

  function removeSkuRow(color: string, rowId: string) {
    setForm((current) => {
      const rows = current.skuRowsByColor[color] ?? [];
      if (rows.length <= 1) return current;
      return {
        ...current,
        skuRowsByColor: {
          ...current.skuRowsByColor,
          [color]: rows.filter((row) => row.id !== rowId),
        },
      };
    });
  }

  function updateSkuCode(color: string, rowId: string, skuCode: string) {
    setForm((current) => ({
      ...current,
      skuRowsByColor: {
        ...current.skuRowsByColor,
        [color]: (current.skuRowsByColor[color] ?? [createSkuInputRow()]).map((row) => (
          row.id === rowId ? { ...row, skuCode } : row
        )),
      },
    }));
  }

  async function handleMainImageFileChange(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    setUploadingImage(true);
    setMessage('');
    setError('');
    try {
      const previewUrl = URL.createObjectURL(file);
      setMainImagePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return previewUrl;
      });
      setMainImageFile(file);
      setForm((current) => ({ ...current, mainImagePath: '' }));
      setUploadedImageName(`${file.name}（提交时自动裁剪为 800×800）`);
      setMessage('主图已选择，提交产品时会按第一条 SKU 编号裁剪上传。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片读取失败');
    } finally {
      setUploadingImage(false);
    }
  }

  function validateForm() {
    const missing: string[] = [];
    if (!mainImageFile && !form.mainImagePath.trim()) missing.push('产品主图');
    if (!form.productName.trim()) missing.push('产品名称');
    if (form.selectedColors.length === 0) missing.push('至少 1 个颜色');
    const missingSkuRows = skuPreview
      .filter((item) => !item.skuCode.trim())
      .map((item) => `${item.color} SKU ${item.index + 1}`);
    if (missingSkuRows.length > 0) missing.push(`${missingSkuRows.join('、')} 编号`);
    return missing;
  }

  async function submitProduct() {
    if (!permissions.canSubmitProduct) {
      setError('当前账号无权提交 1688 产品。');
      return;
    }

    const missing = validateForm();
    if (missing.length > 0) {
      setError(`请先补充：${missing.join('、')}`);
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const firstSkuCode = skuPreview[0]?.skuCode.trim() || '';
      if (!firstSkuCode) {
        setError('请先填写第一条颜色 SKU 编号，用于命名主图文件。');
        return;
      }
      const upload = mainImageFile
        ? await alibaba1688DataSource.uploadImage(mainImageFile, firstSkuCode)
        : null;
      const mainImagePath = upload?.fileUrl || form.mainImagePath;
      const productPayload: Partial<Alibaba1688ProductRecord> = {
        productName: form.productName.trim(),
        productCode: firstSkuCode,
        colorDescription: form.selectedColors.join('、'),
        status: 'missing_cost',
        listingStatus: 'not_listed',
      };
      const product = await alibaba1688DataSource.products.create(productPayload);

      const imagePayload: Partial<Alibaba1688ImageRecord> = {
        productId: product.id,
        imageType: 'main_image',
        imageStatus: 'ready',
        isMain: true,
        sortOrder: 0,
        ...toImageColumns(mainImagePath),
      };
      if (upload?.fileName) {
        imagePayload.fileName = upload.fileName;
      }
      await alibaba1688DataSource.images.create(imagePayload);

      for (const item of skuPreview) {
        const skuPayload: Partial<Alibaba1688SkuRecord> = {
          productId: product.id,
          color: item.color,
          skuCode: item.skuCode.trim(),
          specification: item.color,
          purchasePrice: 0,
          wholesalePrice: 0,
          suggestedPrice: 0,
          minOrderQuantity: 0,
          stockQuantity: 0,
          isActive: true,
        };
        await alibaba1688DataSource.skus.create(skuPayload);
      }

      setMessage('提交成功');
      setForm(emptyForm);
      setMainImageFile(null);
      setMainImagePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return '';
      });
      setUploadedImageName('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '产品提交失败');
    } finally {
      setSaving(false);
    }
  }

  if (!permissions.canSubmitProduct) {
    return (
      <section className="excel-record-panel admin-permission-empty">
        当前账号无权新增 1688 产品。
      </section>
    );
  }

  return (
    <div className="alibaba-product-create-simple-page">
      <section className="alibaba-create-simple-header">
        <a href="/admin/1688-business/products" className="alibaba-back-link">返回产品库</a>
        <div>
          <h2>新增产品</h2>
        </div>
      </section>

      {message && <div className="store-success-message alibaba-auto-success-message">{message}</div>}
      {error && <div className="store-error-message">{error}</div>}

      <section className="alibaba-create-simple-shell">
        <main className="alibaba-create-simple-form">
          <section className="alibaba-local-image-panel wide">
            <div className="alibaba-local-image-head">
              <strong>产品主图</strong>
            </div>
            <label className="alibaba-local-image-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploadingImage || saving}
                onChange={(event) => void handleMainImageFileChange(event.target.files?.[0])}
              />
              {mainImagePreviewUrl || form.mainImagePath ? (
                <img src={mainImagePreviewUrl || form.mainImagePath} alt="产品主图预览" />
              ) : (
                <span>选择本地图片</span>
              )}
            </label>
            <div className="alibaba-local-image-meta">
              <button
                type="button"
                disabled={uploadingImage || saving}
                onClick={(event) => {
                  const input = event.currentTarget.parentElement?.previousElementSibling?.querySelector('input[type="file"]') as HTMLInputElement | null;
                  input?.click();
                }}
              >
                {uploadingImage ? '读取中...' : mainImagePreviewUrl || form.mainImagePath ? '重新选择' : '选择图片'}
              </button>
              <span>{uploadedImageName || form.mainImagePath || '未选择主图'}</span>
            </div>
          </section>
          <label className="required alibaba-product-name-field">
            产品名称
            <input
              value={form.productName}
              placeholder="例如：爱心吊坠 A款"
              onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))}
            />
          </label>
          <section className="alibaba-color-picker">
            <strong>颜色选择</strong>
            <div>
              {colorOptions.map((color) => (
                <label
                  key={color.label}
                  className={`alibaba-color-option alibaba-color-${color.suffix.toLowerCase()}${form.selectedColors.includes(color.label) ? ' selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.selectedColors.includes(color.label)}
                    onChange={(event) => toggleColor(color.label, event.target.checked)}
                  />
                  <span className="alibaba-color-swatch" />
                  <span className="alibaba-color-name">{color.label}</span>
                  <span className="alibaba-color-code">{color.suffix}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="alibaba-sku-preview-panel">
            <strong>颜色 SKU 预览</strong>
            <div className="alibaba-sku-group-list">
              {skuGroups.map((group) => (
                <article key={group.color} className="alibaba-sku-color-group">
                  <header>
                    <div>
                      <span>{group.color}</span>
                      <em>{group.rows.length} 个 SKU</em>
                    </div>
                    <button type="button" onClick={() => addSkuRow(group.color)} disabled={saving}>
                      新增 SKU
                    </button>
                  </header>
                  <div className="alibaba-sku-row-list">
                    {group.rows.map((row, index) => (
                      <div key={row.id} className="alibaba-sku-input-row">
                        <label>
                          <span>{group.color} SKU {index + 1}</span>
                          <input
                            className="alibaba-sku-code-input"
                            value={row.skuCode}
                            placeholder={`请输入${group.color} SKU 编号`}
                            onChange={(event) => updateSkuCode(group.color, row.id, event.target.value)}
                          />
                        </label>
                        {group.rows.length > 1 && (
                          <button type="button" onClick={() => removeSkuRow(group.color, row.id)} disabled={saving}>
                            删除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {skuGroups.length === 0 && <p className="alibaba-sku-empty">请选择颜色后填写 SKU 编号。</p>}
            </div>
          </section>

          <div className="alibaba-create-simple-actions">
            <button type="button" onClick={() => window.location.assign('/admin/1688-business/products')} disabled={saving}>取消</button>
            <button type="button" className="store-primary-button" onClick={() => void submitProduct()} disabled={saving}>提交</button>
          </div>
        </main>

      </section>
    </div>
  );
}

export default Alibaba1688ProductCreatePage;
