import { useEffect, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';

const fieldLabels: Record<string, string> = {
  storeName: '店铺',
  productName: '商品名称',
  temuProductId: '商品ID',
  temuSpuId: 'SPU ID',
  adSpend: '总花费',
  netAdSpend: '净总花费',
  promoSalesAmount: '申报价销售额（推广）',
  promoRoas: '投资回报率ROAS（推广）',
  targetRoas: '自然周目标ROAS（推广）',
  promoSubOrderCount: '子订单数（推广）',
  promoUnitCount: '件数（推广）',
  promoImpressions: '曝光（推广）',
  promoClicks: '点击（推广）',
  promoCtr: '点击率（推广）',
  promoCvr: '转化率（推广）',
  promoAddToCartCount: '加购（推广）',
  globalSalesAmount: '申报价销售额（全域）',
  globalRoas: '投资回报率ROAS（全域）',
  globalSubOrderCount: '子订单数（全域）',
  globalImpressions: '曝光（全域）',
  globalClicks: '点击（全域）',
  globalAddToCartCount: '加入购物车数（全域）',
};

const AD_RECORD_PAGE_SIZE = 50;

const AD_RECORD_COLUMNS = [
  '商品名称',
  '商品ID',
  'SPU ID',
  '总花费',
  '净总花费',
  '申报价销售额（全域）',
  '投资回报率ROAS（全域）',
  '费比（全域）',
  '每笔成交花费（全域）',
  '子订单数（全域）',
  '件数（全域）',
  '曝光（全域）',
  '点击（全域）',
  '点击率（全域）',
  '转化率（全域）',
  '加入购物车数（全域）',
  '申报价销售额（推广）',
  '投资回报率ROAS（推广）',
  '自然周投资回报率ROAS（推广）',
  '自然周目标ROAS（推广）',
  '费比（推广）',
  '每笔成交花费（推广）',
  '子订单数（推广）',
  '件数（推广）',
  '曝光（推广）',
  '点击（推广）',
  '点击率（推广）',
  '转化率（推广）',
  '加购（推广）',
  '净申报价销售额（推广）',
  '净投资回报率ROAS（推广）',
  '净费比（推广）',
  '净每笔成交花费（推广）',
  '净子订单数（推广）',
  '净件数（推广）',
];

const adRecordFallbackFields: Record<string, string> = {
  商品名称: 'productName',
  商品ID: 'temuProductId',
  'SPU ID': 'temuSpuId',
  总花费: 'adSpend',
  净总花费: 'netAdSpend',
  '申报价销售额（全域）': 'globalSalesAmount',
  '投资回报率ROAS（全域）': 'globalRoas',
  '费比（全域）': 'globalAcos',
  '每笔成交花费（全域）': 'globalCpa',
  '子订单数（全域）': 'globalSubOrderCount',
  '件数（全域）': 'globalUnitCount',
  '曝光（全域）': 'globalImpressions',
  '点击（全域）': 'globalClicks',
  '点击率（全域）': 'globalCtr',
  '转化率（全域）': 'globalCvr',
  '加入购物车数（全域）': 'globalAddToCartCount',
  '申报价销售额（推广）': 'promoSalesAmount',
  '投资回报率ROAS（推广）': 'promoRoas',
  '自然周投资回报率ROAS（推广）': 'promoWeekRoas',
  '自然周目标ROAS（推广）': 'targetRoas',
  '费比（推广）': 'promoAcos',
  '每笔成交花费（推广）': 'promoCpa',
  '子订单数（推广）': 'promoSubOrderCount',
  '件数（推广）': 'promoUnitCount',
  '曝光（推广）': 'promoImpressions',
  '点击（推广）': 'promoClicks',
  '点击率（推广）': 'promoCtr',
  '转化率（推广）': 'promoCvr',
  '加购（推广）': 'promoAddToCartCount',
  '净申报价销售额（推广）': 'netPromoSalesAmount',
  '净投资回报率ROAS（推广）': 'netPromoRoas',
  '净费比（推广）': 'netPromoAcos',
  '净每笔成交花费（推广）': 'netPromoCpa',
  '净子订单数（推广）': 'netPromoSubOrderCount',
  '净件数（推广）': 'netPromoUnitCount',
};

function normalizeAdRecordHeader(value: string) {
  return value.replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')').toLowerCase();
}

function getRawAdRecordValue(rawData: Record<string, any>, label: string) {
  if (rawData[label] !== undefined && rawData[label] !== null && String(rawData[label]) !== '') {
    return rawData[label];
  }
  const normalizedLabel = normalizeAdRecordHeader(label);
  const matchedKey = Object.keys(rawData).find((key) => normalizeAdRecordHeader(key) === normalizedLabel);
  return matchedKey ? rawData[matchedKey] : undefined;
}

function displayAdRecordCell(row: Record<string, any>, label: string) {
  const rawData = row.rawData && typeof row.rawData === 'object' ? row.rawData : {};
  const rawValue = getRawAdRecordValue(rawData, label);
  if (rawValue !== undefined && rawValue !== null && String(rawValue) !== '') {
    return String(rawValue);
  }
  const fallbackKey = adRecordFallbackFields[label];
  const fallbackValue = fallbackKey ? row[fallbackKey] : undefined;
  return fallbackValue === undefined || fallbackValue === null || String(fallbackValue) === '' ? '-' : String(fallbackValue);
}

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

function inferStoreNameFromFileName(fileName: string) {
  return fileName.match(/([A-Za-z0-9]+店|[\u4e00-\u9fa5]+店)/)?.[1] || '';
}

export default function TemuAdReportImportPage() {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [storeName, setStoreName] = useState('');
  const [overview, setOverview] = useState<ImportOverview>({ batches: [], records: [] });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [storageError, setStorageError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);

  const refreshOverview = async (page = recordsPage) => {
    try {
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getAdImportRecords(page, AD_RECORD_PAGE_SIZE),
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
      const next = await newProductCenterDataSource.previewAdFile(file);
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
    if (!mapping.temuProductId) {
      setMessage('当前文件不像 TEMU 广告报表：必须映射商品ID。商品基础信息请使用“商品信息导入”。');
      return;
    }
    if (!mapping.storeName && !storeName.trim()) {
      setMessage('广告报表没有店铺列时，请先填写默认店铺，例如 A店。');
      return;
    }
    setConfirmLoading(true);
    setMessage('');
    try {
      const next = await newProductCenterDataSource.confirmAdImport({
        previewId: preview.previewId,
        fileName: preview.fileName,
        rows: preview.rows || [],
        mapping,
        reportDate,
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
  const totalPages = Math.max(Math.ceil(totalRecords / AD_RECORD_PAGE_SIZE), 1);

  return (
    <section className="npc-page temu-ad-import-page">
      <section className="temu-import-hero">
        <div className="temu-import-hero-copy">
          <div className="temu-import-hero-upload temu-ad-hero-upload">
            <label className="excel-upload-box temu-import-upload-box">
              <input type="file" accept=".xlsx,.xls,.csv" disabled={previewLoading || confirmLoading || !reportDate} onChange={(event) => void onFile(event.target.files?.[0])} />
              <strong>{previewLoading ? '处理中...' : confirmLoading ? '导入中...' : '选择或拖入 Excel 文件'}</strong>
              <span>支持 .xlsx / .xls / .csv</span>
            </label>
            <div className="npc-import-controls temu-import-store-control">
              <label>报表日期<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
              <label>默认店铺
                <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="报表内有店铺字段可留空" />
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
            <span>广告</span>
            <strong>{statusCounts?.ads ?? 0}</strong>
            <small>temu_ad_product_daily</small>
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
            <button type="button" disabled={confirmLoading || !reportDate} onClick={confirm}>{confirmLoading ? '导入中...' : '确认导入 PostgreSQL'}</button>
          </header>
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

      <article className="excel-record-panel npc-panel temu-ad-record-panel">
        <header className="npc-panel-header">
          <div>
            <h2>PostgreSQL 广告记录</h2>
            <p>刷新页面后从 temu_ad_product_daily 按页读取，每页 50 条。</p>
          </div>
          <button type="button" onClick={() => void refreshOverview(recordsPage)}>刷新</button>
        </header>
        <div className="npc-table-wrap temu-ad-record-table">
          <table>
            <thead><tr>{AD_RECORD_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {overview.records.map((row) => (
                <tr key={String(row.id)}>
                  {AD_RECORD_COLUMNS.map((column) => (
                    <td key={column} title={displayAdRecordCell(row, column)}>{displayAdRecordCell(row, column)}</td>
                  ))}
                </tr>
              ))}
              {overview.records.length === 0 && <tr><td colSpan={AD_RECORD_COLUMNS.length}>暂无 PostgreSQL 广告记录</td></tr>}
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
        <h2>最近广告导入批次</h2>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>文件名</th><th>报表日期</th><th>店铺</th><th>总行数</th><th>成功</th><th>失败</th><th>状态</th><th>导入时间</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.fileName || '-')}</td>
                  <td>{String(row.reportDate || '-').slice(0, 10)}</td>
                  <td>{String(row.storeName || '-')}</td>
                  <td>{String(row.totalRows ?? 0)}</td>
                  <td>{String(row.successRows ?? 0)}</td>
                  <td>{String(row.errorRows ?? 0)}</td>
                  <td>{String(row.status || '-')}</td>
                  <td>{formatShanghaiTime(row.finishedAt || row.createdAt)}</td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={8}>暂无广告导入批次</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
