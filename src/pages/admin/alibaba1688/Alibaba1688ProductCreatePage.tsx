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

interface ProductCreateForm {
  mainImagePath: string;
  productName: string;
  selectedColors: string[];
  skuCodesByColor: Record<string, string>;
}

const colorOptions = [
  { label: '钢色', suffix: 'S' },
  { label: '金色', suffix: 'G' },
  { label: '玫瑰金', suffix: 'RG' },
  { label: '黑色', suffix: 'B' },
];

const emptyForm: ProductCreateForm = {
  mainImagePath: '',
  productName: '',
  selectedColors: [],
  skuCodesByColor: {},
};

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
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const skuPreview = useMemo(
    () => form.selectedColors.map((color) => ({ color, skuCode: form.skuCodesByColor[color] ?? '' })),
    [form.selectedColors, form.skuCodesByColor],
  );

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  function toggleColor(color: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      selectedColors: checked
        ? [...current.selectedColors, color]
        : current.selectedColors.filter((item) => item !== color),
      skuCodesByColor: checked
        ? { ...current.skuCodesByColor, [color]: current.skuCodesByColor[color] ?? '' }
        : Object.fromEntries(Object.entries(current.skuCodesByColor).filter(([key]) => key !== color)),
    }));
  }

  function updateSkuCode(color: string, skuCode: string) {
    setForm((current) => ({
      ...current,
      skuCodesByColor: {
        ...current.skuCodesByColor,
        [color]: skuCode,
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
      const upload = await alibaba1688DataSource.uploadImage(file);
      setForm((current) => ({ ...current, mainImagePath: upload.fileUrl }));
      setUploadedImageName(upload.fileName);
      setMessage('主图已上传，提交产品时会自动保存到图片素材记录。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
    }
  }

  function validateForm() {
    const missing: string[] = [];
    if (!form.mainImagePath.trim()) missing.push('产品主图');
    if (!form.productName.trim()) missing.push('产品名称');
    if (form.selectedColors.length === 0) missing.push('至少 1 个颜色');
    const missingSkuColors = skuPreview.filter((item) => !item.skuCode.trim()).map((item) => item.color);
    if (missingSkuColors.length > 0) missing.push(`${missingSkuColors.join('、')} SKU 编号`);
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
      const productPayload: Partial<Alibaba1688ProductRecord> = {
        productName: form.productName.trim(),
        productCode: skuPreview[0]?.skuCode.trim() || '',
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
        ...toImageColumns(form.mainImagePath),
      };
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
              <span>支持本地 JPG、PNG、WEBP、GIF，单张不超过 8MB</span>
            </div>
            <label className="alibaba-local-image-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploadingImage || saving}
                onChange={(event) => void handleMainImageFileChange(event.target.files?.[0])}
              />
              {form.mainImagePath ? (
                <img src={form.mainImagePath} alt="产品主图预览" />
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
                {uploadingImage ? '上传中...' : form.mainImagePath ? '重新上传' : '上传图片'}
              </button>
              <span>{uploadedImageName || form.mainImagePath || '未上传主图'}</span>
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
            <table>
              <thead><tr><th>颜色</th><th>SKU 编号</th></tr></thead>
              <tbody>
                {skuPreview.map((item) => (
                  <tr key={item.color}>
                    <td>{item.color}</td>
                    <td>
                      <input
                        className="alibaba-sku-code-input"
                        value={item.skuCode}
                        placeholder={`请输入${item.color} SKU 编号`}
                        onChange={(event) => updateSkuCode(item.color, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {skuPreview.length === 0 && <tr><td colSpan={2}>请选择颜色后填写 SKU 编号。</td></tr>}
              </tbody>
            </table>
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
