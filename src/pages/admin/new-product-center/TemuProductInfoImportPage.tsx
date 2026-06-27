import { useEffect, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';

const fieldLabels: Record<string, string> = {
  productTitle: '商品标题',
  spuId: 'SPU ID',
  skcId: 'SKC ID',
  skuId: 'SKU ID',
  skcCode: 'SKC货号',
  skuCode: 'SKU货号',
  leafCategoryName: '叶子类目名称',
  productStatus: '商品状态',
  spec1Name: '规格1名称',
  spec2Name: '规格2名称',
  declaredPriceCny: '申报价格(CNY)',
  declaredPriceStatus: '申报价格状态',
  createdTime: '创建时间',
};

const PRODUCT_RECORD_PAGE_SIZE = 50;

function formatShanghaiTime(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
}

function ImportMapping({ preview, mapping, setMapping }: { preview: ImportPreview; mapping: Record<string, string>; setMapping: (mapping: Record<string, string>) => void }) {
  return (
    <div className="npc-mapping-grid">
      {Object.entries(fieldLabels).map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <select value={mapping[field] || ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
            <option value="">不导入</option>
            {preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function inferStoreNameFromFileName(fileName: string) {
  return fileName.match(/([A-Za-z0-9]+店|[\u4e00-\u9fa5]+店)/)?.[1] || '';
}

export default function TemuProductInfoImportPage() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [overview, setOverview] = useState<ImportOverview>({ batches: [], records: [] });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [storageError, setStorageError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);

  const refreshOverview = async (page = recordsPage) => {
    try {
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getProductImportRecords(page, PRODUCT_RECORD_PAGE_SIZE),
      ]);
      setStorageStatus(status);
      setStorageError(status.ok ? '' : (status.message || 'PostgreSQL 未连接'));
      setOverview(records);
      setRecordsPage(records.page || page);
    } catch (error) {
      setStorageStatus(null);
      setStorageError(error instanceof Error ? error.message : String(error));
      setOverview({ batches: [], records: [] });
    }
  };

  useEffect(() => {
    void refreshOverview(1);
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setPreviewLoading(true);
    setMessage('');
    setResult(null);
    try {
      const next = await newProductCenterDataSource.previewProductFile(file);
      setPreview(next);
      setMapping(next.mapping);
      setStoreName((current) => current || inferStoreNameFromFileName(file.name));
      setMessage('预览完成，尚未入库；请点击“确认导入 PostgreSQL”。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    if ((!mapping.skcId && !mapping.temuProductId) || (!mapping.createdTime && !mapping.firstOnlineAt)) {
      setMessage('当前文件不像商品信息表：必须映射 SKC ID 和创建时间。广告报表请使用“广告数据导入”。');
      return;
    }
    setConfirmLoading(true);
    setMessage('');
    try {
      const next = await newProductCenterDataSource.confirmProductImport({
        previewId: preview.previewId,
        fileName: preview.fileName,
        rows: preview.rows || [],
        mapping,
        storeName,
      });
      setResult(next);
      setRecordsPage(1);
      await refreshOverview(1);
      setMessage(`导入完成：成功 ${next.successRows} 行，失败 ${next.errorRows} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirmLoading(false);
    }
  };

  const statusCounts = storageStatus?.counts;
  const isStorageReady = Boolean(storageStatus?.ok && !storageError);
  const latestBatch = overview.batches[0];
  const totalRecords = overview.total ?? overview.records.length;
  const totalPages = Math.max(Math.ceil(totalRecords / PRODUCT_RECORD_PAGE_SIZE), 1);

  return (
    <section className="npc-page temu-product-import-page">
      <section className="temu-import-hero">
        <div className="temu-import-hero-copy">
          <div className="temu-import-hero-upload">
            <label className="excel-upload-box temu-import-upload-box">
              <input type="file" accept=".xlsx,.xls,.csv" disabled={previewLoading || confirmLoading} onChange={(event) => void onFile(event.target.files?.[0])} />
              <strong>{previewLoading ? '处理中...' : confirmLoading ? '导入中...' : '选择或拖入 Excel 文件'}</strong>
              <span>支持 .xlsx / .xls / .csv</span>
            </label>
            <div className="npc-import-controls temu-import-store-control">
              <label>默认店铺
                <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="文件无店铺列时填写，如 A店" />
              </label>
            </div>
          </div>
        </div>
        <div className="temu-import-metrics">
          <article className={isStorageReady ? 'is-ok' : 'is-warning'}>
            <span>数据库</span>
            <strong>{isStorageReady ? '已连接' : '待确认'}</strong>
            <small>{storageStatus?.databaseName || storageError || 'PostgreSQL'}</small>
          </article>
          <article>
            <span>商品</span>
            <strong>{statusCounts?.products ?? 0}</strong>
            <small>temu_products</small>
          </article>
          <article>
            <span>SKU</span>
            <strong>{statusCounts?.skus ?? 0}</strong>
            <small>temu_product_skus</small>
          </article>
          <article>
            <span>导入批次</span>
            <strong>{statusCounts?.importBatches ?? 0}</strong>
            <small>{latestBatch?.fileName ? `最近：${latestBatch.fileName}` : '暂无批次'}</small>
          </article>
        </div>
      </section>

      {message && <div className="excel-import-error">{message}</div>}

      {preview && (
        <article className="excel-record-panel npc-panel temu-import-preview-panel">
          <header className="npc-panel-header">
            <div>
              <span className="temu-import-step-label">步骤 3</span>
              <h2>字段映射与预览</h2>
              <p>{preview.fileName}，共 {preview.totalRows} 行，预览前 20 行。</p>
            </div>
            <button type="button" disabled={confirmLoading} onClick={confirm}>{confirmLoading ? '导入中...' : '确认导入 PostgreSQL'}</button>
          </header>
          <ImportMapping preview={preview} mapping={mapping} setMapping={setMapping} />
          <div className="npc-table-wrap">
            <table>
              <thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {preview.previewRows.map((row, index) => (
                  <tr key={index}>{preview.headers.map((header) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {result && result.errors.length > 0 && (
        <article className="excel-record-panel npc-panel">
          <h2>失败行</h2>
          <div className="npc-table-wrap">
            <table>
              <thead><tr><th>行号</th><th>原因</th></tr></thead>
              <tbody>{result.errors.map((error) => <tr key={error.rowNumber}><td>{error.rowNumber}</td><td>{error.errorReason}</td></tr>)}</tbody>
            </table>
          </div>
        </article>
      )}

      <article className="excel-record-panel npc-panel temu-product-record-panel">
        <header className="npc-panel-header">
          <div>
            <h2>PostgreSQL 商品记录</h2>
            <p>刷新页面后从 temu_products / temu_product_skus 读取，最多显示最近 50 条。</p>
          </div>
          <button type="button" onClick={() => void refreshOverview(recordsPage)}>刷新</button>
        </header>
        <div className="npc-table-wrap temu-product-record-table">
          <table>
            <thead><tr><th>商品标题</th><th>SPU ID</th><th>SKC ID</th><th>SKU ID</th><th>SKC货号</th><th>SKU货号</th><th>叶子类目名称</th><th>商品状态</th><th>规格1名称</th><th>规格2名称</th><th>申报价格(CNY)</th><th>申报价格状态</th><th>创建时间</th></tr></thead>
            <tbody>
              {overview.records.map((row) => (
                <tr key={String(row.id)}>
                  <td className="temu-product-title-cell" title={String(row.productTitle || '-')}>{String(row.productTitle || '-')}</td>
                  <td>{String(row.spuId || '-')}</td>
                  <td>{String(row.skcId || '-')}</td>
                  <td>{String(row.skuId || '-')}</td>
                  <td>{String(row.skcCode || '-')}</td>
                  <td>{String(row.skuCode || '-')}</td>
                  <td>{String(row.leafCategoryName || '-')}</td>
                  <td>{String(row.productStatus || '-')}</td>
                  <td>{String(row.spec1Name || '-')}</td>
                  <td>{String(row.spec2Name || '-')}</td>
                  <td>{String(row.declaredPriceCny ?? '-')}</td>
                  <td>{String(row.declaredPriceStatus || '-')}</td>
                  <td>{String(row.createdTime || '-').slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))}
              {overview.records.length === 0 && <tr><td colSpan={13}>暂无 PostgreSQL 商品记录</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="temu-product-record-pagination">
          <span>共 {totalRecords} 条，第 {recordsPage}/{totalPages} 页</span>
          <div>
            <button type="button" disabled={recordsPage <= 1} onClick={() => {
              const nextPage = Math.max(recordsPage - 1, 1);
              setRecordsPage(nextPage);
              void refreshOverview(nextPage);
            }}>上一页</button>
            <button type="button" disabled={recordsPage >= totalPages} onClick={() => {
              const nextPage = Math.min(recordsPage + 1, totalPages);
              setRecordsPage(nextPage);
              void refreshOverview(nextPage);
            }}>下一页</button>
          </div>
        </div>
      </article>

      <article className="excel-record-panel npc-panel temu-import-batch-panel">
        <h2>最近商品导入批次</h2>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>文件名</th><th>总行数</th><th>成功</th><th>失败</th><th>状态</th><th>导入时间</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.fileName || '-')}</td>
                  <td>{String(row.totalRows ?? 0)}</td>
                  <td>{String(row.successRows ?? 0)}</td>
                  <td>{String(row.errorRows ?? 0)}</td>
                  <td>{String(row.status || '-')}</td>
                  <td>{formatShanghaiTime(row.finishedAt || row.createdAt)}</td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={6}>暂无商品导入批次</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
