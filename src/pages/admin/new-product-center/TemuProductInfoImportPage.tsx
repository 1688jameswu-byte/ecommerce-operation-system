import { useEffect, useRef, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

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
type StoreOption = { id?: string; storeName?: string; platform?: string; status?: string };
type ImportBatchRow = Record<string, any>;

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

function getMissingProductMappings(mapping: Record<string, string>) {
  return [
    ['productTitle', '商品标题'],
    ['spuId', 'SPU ID'],
    ['skcId', 'SKC ID'],
    ['skuId', 'SKU ID'],
    ['skcCode', 'SKC货号'],
    ['skuCode', 'SKU货号'],
    ['createdTime', '创建时间'],
  ].filter(([field]) => !mapping[field]).map(([, label]) => label);
}

export default function TemuProductInfoImportPage({ currentUser }: { currentUser: CurrentUser }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [overview, setOverview] = useState<ImportOverview>({ batches: [], records: [] });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [storeName, setStoreName] = useState('');
  const [importStoreName, setImportStoreName] = useState('');
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [storageError, setStorageError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [deleteBatch, setDeleteBatch] = useState<ImportBatchRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const overviewRequestSeq = useRef(0);
  const isAdmin = currentUser.role === 'admin';

  const refreshStorageStatus = async () => {
    try {
      const status = await newProductCenterDataSource.getTemuStorageStatus();
      setStorageStatus(status);
      setStorageError(status.ok ? '' : (status.message || 'PostgreSQL 未连接'));
    } catch (error) {
      setStorageStatus(null);
      setStorageError(error instanceof Error ? error.message : String(error));
    }
  };

  const refreshOverview = async (page = recordsPage, nextStoreName = storeName, nextFilters = filters) => {
    const requestSeq = ++overviewRequestSeq.current;
    if (!nextStoreName && !isAdmin) {
      if (requestSeq !== overviewRequestSeq.current) return;
      setOverview({ batches: [], records: [] });
      return;
    }
    try {
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getProductImportRecords(page, PRODUCT_RECORD_PAGE_SIZE, {
          storeName: nextStoreName,
          ...nextFilters,
        }),
      ]);
      if (requestSeq !== overviewRequestSeq.current) return;
      setStorageStatus(status);
      setStorageError(status.ok ? '' : (status.message || 'PostgreSQL 未连接'));
      setOverview(records);
      setRecordsPage(records.page || page);
    } catch (error) {
      if (requestSeq !== overviewRequestSeq.current) return;
      setStorageStatus(null);
      setStorageError(error instanceof Error ? error.message : String(error));
      setOverview({ batches: [], records: [] });
    }
  };

  useEffect(() => {
    void refreshStorageStatus();
  }, []);

  useEffect(() => {
    newProductCenterDataSource.getVisibleStores().then(async (data) => {
      const temuStores = (data.stores || []).filter((store) => store.platform === 'TEMU' && store.status !== 'inactive');
      setStores(temuStores);
      if (storeName) return;
      let defaultStoreName = isAdmin ? '' : (temuStores[0]?.storeName || '');
      try {
        const recent = await newProductCenterDataSource.getProductImportRecords(1, 1, {});
        const recentStoreName = String(recent.batches?.[0]?.storeName || recent.records?.[0]?.storeName || '');
        if (!isAdmin && recentStoreName && temuStores.some((store) => store.storeName === recentStoreName)) {
          defaultStoreName = recentStoreName;
        }
      } catch {
        // Keep the first visible store when recent import lookup is unavailable.
      }
      setStoreName(defaultStoreName);
      setImportStoreName((current) => current || temuStores[0]?.storeName || '');
    }).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    void refreshOverview(1, storeName, filters);
  }, [storeName, filters]);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!importStoreName) {
      setMessage('请先选择导入店铺。');
      return;
    }
    setPreviewLoading(true);
    setMessage('');
    setResult(null);
    try {
      const next = await newProductCenterDataSource.previewProductFile(file);
      const nextStoreName = importStoreName || storeName || inferStoreNameFromFileName(file.name);
      setPreview(next);
      setMapping(next.mapping);
      setImportStoreName(nextStoreName);
      setStoreName(nextStoreName);
      setMessage('预览完成，正在自动导入 PostgreSQL...');
      await importProductPreview(next, next.mapping, nextStoreName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const importProductPreview = async (nextPreview: ImportPreview, nextMapping: Record<string, string>, nextStoreName: string) => {
    const missingProductMappings = getMissingProductMappings(nextMapping);
    if (missingProductMappings.length) {
      setMessage('当前文件不像商品信息表：必须映射 SKC ID 和创建时间。广告报表请使用“广告数据导入”。');
      return;
    }
    setConfirmLoading(true);
    try {
      const next = await newProductCenterDataSource.confirmProductImport({
        previewId: nextPreview.previewId,
        fileName: nextPreview.fileName,
        rows: nextPreview.rows || [],
        mapping: nextMapping,
        storeName: nextStoreName,
      });
      setResult(next);
      setRecordsPage(1);
      setStoreName(nextStoreName);
      await refreshOverview(1, nextStoreName, filters);
      setMessage(`导入完成：成功 ${next.successRows} 行，失败 ${next.errorRows} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirmLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setMessage('正在按当前字段映射重新导入 PostgreSQL...');
    await importProductPreview(preview, mapping, importStoreName || storeName);
  };

  const deleteSelectedBatch = async () => {
    if (!deleteBatch) return;
    setIsDeleting(true);
    try {
      const result = await newProductCenterDataSource.deleteProductImportBatch(String(deleteBatch.id));
      setMessage(result.message || `删除完成：商品 ${result.deletedProducts ?? 0} 个，SKU ${result.deletedSkus ?? 0} 个。`);
      setDeleteBatch(null);
      setRecordsPage(1);
      await refreshOverview(1, storeName, filters);
      await refreshStorageStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const isStorageReady = Boolean(storageStatus?.ok && !storageError);
  const latestBatch = overview.batches[0];
  const totalRecords = overview.total ?? overview.records.length;
  const totalPages = Math.max(Math.ceil(totalRecords / PRODUCT_RECORD_PAGE_SIZE), 1);
  const summary = overview.summary || {};

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
              <label>导入店铺
                <select value={importStoreName} onChange={(event) => setImportStoreName(event.target.value)}>
                  <option value="">请选择店铺</option>
                  {stores.map((store) => <option key={store.id || store.storeName} value={store.storeName || ''}>{store.storeName}</option>)}
                </select>
              </label>
            </div>
          </div>
          {message && <div className="excel-import-error temu-import-inline-message">{message}</div>}
        </div>
        <div className="temu-import-metrics">
          <article className={isStorageReady ? 'is-ok' : 'is-warning'}>
            <span>数据库</span>
            <strong>{isStorageReady ? '已连接' : '待确认'}</strong>
            <small>{storageStatus?.databaseName || storageError || 'PostgreSQL'}</small>
          </article>
          <article>
            <span>当前店铺商品数</span>
            <strong>{summary.productCount ?? 0}</strong>
            <small>{storeName || (isAdmin ? '全部店铺' : '请选择店铺')}</small>
          </article>
          <article>
            <span>当前店铺SKU数</span>
            <strong>{summary.skuCount ?? 0}</strong>
            <small>最近50条按页读取</small>
          </article>
          <article>
            <span>失败行数</span>
            <strong>{latestBatch?.errorRows ?? 0}</strong>
            <small>{latestBatch?.finishedAt ? `最近导入：${formatShanghaiTime(latestBatch.finishedAt)}` : '暂无批次'}</small>
          </article>
        </div>
      </section>

      <article className="excel-record-panel npc-panel temu-import-context-panel">
        <header className="npc-panel-header">
          <h2>当前展示：{storeName ? `${storeName} 商品信息` : isAdmin ? '全部店铺 商品信息' : '请选择店铺后查看数据'}</h2>
          <span>{latestBatch?.fileName ? `最近批次：${latestBatch.fileName}` : '暂无导入批次'}</span>
        </header>
        <div className="npc-mapping-grid temu-import-filter-grid">
          <label>查看店铺
            <select value={storeName} onChange={(event) => {
              const nextStoreName = event.target.value;
              setStoreName(nextStoreName);
              setRecordsPage(1);
            }}>
              <option value="">{isAdmin ? '全部店铺' : '请选择店铺'}</option>
              {stores.map((store) => <option key={store.id || store.storeName} value={store.storeName || ''}>{store.storeName}</option>)}
            </select>
          </label>
          <label>创建开始<input type="date" value={filters.createdDateStart || ''} onChange={(event) => setFilters({ ...filters, createdDateStart: event.target.value })} /></label>
          <label>创建结束<input type="date" value={filters.createdDateEnd || ''} onChange={(event) => setFilters({ ...filters, createdDateEnd: event.target.value })} /></label>
          <label>商品状态<input value={filters.productStatus || ''} onChange={(event) => setFilters({ ...filters, productStatus: event.target.value })} placeholder="在售中" /></label>
          <label>叶子类目
            <select value={filters.categoryName || ''} onChange={(event) => setFilters({ ...filters, categoryName: event.target.value })}>
              <option value="">全部类目</option>
              {(overview.categoryOptions || []).map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>SPU ID<input value={filters.spuId || ''} onChange={(event) => setFilters({ ...filters, spuId: event.target.value })} /></label>
          <label>SKU ID<input value={filters.skuId || ''} onChange={(event) => setFilters({ ...filters, skuId: event.target.value })} /></label>
          <label>SKU货号<input value={filters.skuCode || ''} onChange={(event) => setFilters({ ...filters, skuCode: event.target.value })} /></label>
        </div>
      </article>

      {preview && (
        <article className="excel-record-panel npc-panel temu-import-preview-panel">
          <header className="npc-panel-header">
            <div>
              <span className="temu-import-step-label">步骤 3</span>
              <h2>当前上传文件预览</h2>
              <p>
                {preview.fileName}，共 {preview.totalRows} 行，预览前 20 行。字段映射只用于本次导入，
                切换查看店铺不会改变这里的内容。
              </p>
              <p>本次导入店铺：{importStoreName || '-'}</p>
            </div>
            <button type="button" disabled={confirmLoading} onClick={confirm}>{confirmLoading ? '导入中...' : '按当前映射重新导入'}</button>
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
              {overview.records.length === 0 && <tr><td colSpan={13}>{storeName || isAdmin ? '暂无当前范围商品记录' : '请选择店铺后查看数据'}</td></tr>}
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
            <thead><tr><th>批次</th><th>店铺 / 文件</th><th>导入结果</th><th>匹配结果</th><th>导入人 / 时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    <strong>{String(row.id || '-').slice(0, 8)}</strong>
                    <small>{String(row.importType || 'product_info')}</small>
                  </td>
                  <td>
                    <strong>{String(row.storeName || storeName || '-')}</strong>
                    <small title={String(row.fileName || '-')}>{String(row.fileName || '-')}</small>
                  </td>
                  <td>
                    <strong>{String(row.successRows ?? 0)} / {String(row.totalRows ?? 0)}</strong>
                    <small>失败 {String(row.errorRows ?? 0)} 行</small>
                  </td>
                  <td>
                    <strong>{String(row.successRows ?? 0)} 匹配</strong>
                    <small>未匹配 {String(row.errorRows ?? 0)}</small>
                  </td>
                  <td>
                    <strong>{String(row.uploadedByName || row.uploadedBy || '-')}</strong>
                    <small>{formatShanghaiTime(row.finishedAt || row.createdAt)}</small>
                  </td>
                  <td>
                    <span className={`temu-import-status-badge status-${String(row.status || '').toLowerCase()}`}>
                      {String(row.status || '-')}
                    </span>
                  </td>
                  <td>
                    <div className="temu-import-batch-actions">
                      <button type="button" onClick={() => window.alert(`批次 ${String(row.id)}\\n文件：${String(row.fileName || '-')}`)}>明细</button>
                      <button type="button" onClick={() => window.alert(row.errorRows ? '失败行已在上方失败行区域展示最近一次导入结果。' : '该批次无失败行。')}>失败行</button>
                      <button type="button" onClick={() => void newProductCenterDataSource.rebuildSnapshot(new Date().toISOString().slice(0, 10)).then(() => refreshOverview(recordsPage))}>重建快照</button>
                      {isAdmin && <button type="button" className="batch-delete-button" onClick={() => setDeleteBatch(row)}>删除</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={7}>暂无商品导入批次</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {deleteBatch && (
        <ConfirmDeleteModal
          title="确认删除该商品信息导入批次吗？"
          description="删除后，该批次导入或更新的商品信息和 SKU 会从 PostgreSQL 删除，相关商品快照也会同步失效。"
          isBusy={isDeleting}
          onCancel={() => setDeleteBatch(null)}
          onConfirm={deleteSelectedBatch}
        >
          <span>文件名：{String(deleteBatch.fileName || '-')}</span>
          <span>店铺：{String(deleteBatch.storeName || storeName || '-')}</span>
          <span>成功行数：{String(deleteBatch.successRows ?? 0)}</span>
          <span>导入时间：{formatShanghaiTime(deleteBatch.finishedAt || deleteBatch.createdAt)}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}
