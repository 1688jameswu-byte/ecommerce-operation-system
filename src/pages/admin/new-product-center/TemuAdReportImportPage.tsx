import { useEffect, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const fieldLabels: Record<string, string> = {
  storeName: '店铺',
  productName: '商品名称',
  temuProductId: '商品ID',
  temuSpuId: 'SPU ID',
  adSpend: '总花费',
  netAdSpend: '净总花费',
  promoSalesAmount: '申报价销售额（推广）',
  promoRoas: '投资回报率(ROAS)（推广）',
  targetRoas: '自然周目标ROAS（推广）',
  promoSubOrderCount: '子订单数（推广）',
  promoUnitCount: '件数（推广）',
  promoImpressions: '曝光（推广）',
  promoClicks: '点击（推广）',
  promoCtr: '点击率（推广）',
  promoCvr: '转化率（推广）',
  promoAddToCartCount: '加购（推广）',
  globalSalesAmount: '申报价销售额（全域）',
  globalRoas: '投资回报率(ROAS)（全域）',
  globalSubOrderCount: '子订单数（全域）',
  globalImpressions: '曝光（全域）',
  globalClicks: '点击（全域）',
  globalAddToCartCount: '加入购物车数（全域）',
};

const AD_RECORD_PAGE_SIZE = 50;
type StoreOption = { id?: string; storeName?: string; platform?: string; status?: string };
type ImportBatchRow = Record<string, any>;

const AD_RECORD_COLUMNS = [
  '商品名称',
  '商品ID',
  'SPU ID',
  '总花费',
  '净总花费',
  '申报价销售额（全域）',
  '投资回报率(ROAS)（全域）',
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
  '投资回报率(ROAS)（推广）',
  '自然周投资回报率(ROAS)（推广）',
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
  '净投资回报率(ROAS)（推广）',
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
  '投资回报率(ROAS)（全域）': 'globalRoas',
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
  '投资回报率(ROAS)（推广）': 'promoRoas',
  '自然周投资回报率(ROAS)（推广）': 'promoWeekRoas',
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
  '净投资回报率(ROAS)（推广）': 'netPromoRoas',
  '净费比（推广）': 'netPromoAcos',
  '净每笔成交花费（推广）': 'netPromoCpa',
  '净子订单数（推广）': 'netPromoSubOrderCount',
  '净件数（推广）': 'netPromoUnitCount',
};

const AD_RECORD_ID_COLUMNS = new Set(['商品名称', '商品ID', 'SPU ID']);

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

function getMissingAdMappings(mapping: Record<string, string>) {
  const missing = [
    ['productName', '商品名称'],
    ['temuProductId', '商品ID'],
    ['temuSpuId', 'SPU ID'],
    ['adSpend', '总花费'],
  ].filter(([field]) => !mapping[field]).map(([, label]) => label);
  if (!mapping.promoSalesAmount && !mapping.globalSalesAmount) {
    missing.push('销售额（推广或全域）');
  }
  if (!mapping.promoImpressions && !mapping.globalImpressions && !mapping.promoClicks && !mapping.globalClicks) {
    missing.push('曝光或点击（推广或全域）');
  }
  return missing;
}

export default function TemuAdReportImportPage({ currentUser }: { currentUser: CurrentUser }) {
  const [reportDate, setReportDate] = useState('');
  const [importReportDate, setImportReportDate] = useState('');
  const [storeName, setStoreName] = useState('');
  const [importStoreName, setImportStoreName] = useState('');
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
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState('adSpend');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deleteBatch, setDeleteBatch] = useState<ImportBatchRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const refreshOverview = async (page = recordsPage) => {
    if (!storeName || !reportDate) {
      setOverview({ batches: [], records: [] });
      return;
    }
    try {
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getAdImportRecords(page, AD_RECORD_PAGE_SIZE, {
          storeName,
          reportDate,
          ...filters,
          sortField,
          sortDirection,
        }),
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
    void refreshStorageStatus();
  }, []);

  useEffect(() => {
    newProductCenterDataSource.getVisibleStores().then(async (data) => {
      const temuStores = (data.stores || []).filter((store) => store.platform === 'TEMU' && store.status !== 'inactive');
      setStores(temuStores);
      if (storeName && reportDate) return;
      let defaultStoreName = temuStores[0]?.storeName || '';
      let defaultReportDate = reportDate;
      try {
        const recent = await newProductCenterDataSource.getAdImportRecords(1, 1, {});
        const recentStoreName = String(recent.batches?.[0]?.storeName || recent.records?.[0]?.storeName || '');
        if (recentStoreName && temuStores.some((store) => store.storeName === recentStoreName)) {
          defaultStoreName = recentStoreName;
        }
        defaultReportDate = String(recent.reportDates?.[0] || recent.batches?.[0]?.reportDate || defaultReportDate || '').slice(0, 10);
      } catch {
        // Keep the first visible store; a later effect will try to load its latest report date.
      }
      setStoreName((current) => current || defaultStoreName);
      setImportStoreName((current) => current || defaultStoreName);
      if (defaultReportDate) setReportDate((current) => current || defaultReportDate);
      if (defaultReportDate) setImportReportDate((current) => current || defaultReportDate);
    }).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    void refreshOverview(1);
  }, [storeName, reportDate, filters, sortField, sortDirection]);

  useEffect(() => {
    const selectedStore = stores.find((store) => store.storeName === storeName);
    if (!selectedStore || reportDate) return;
    newProductCenterDataSource.getAdImportRecords(1, 1, { storeName })
      .then((data) => {
        if (data.reportDates?.[0]) setReportDate(data.reportDates[0]);
      })
      .catch(() => undefined);
  }, [stores, storeName, reportDate]);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!importStoreName) {
      setMessage('请先选择导入店铺。');
      return;
    }
    if (!importReportDate) {
      setMessage('请先选择广告日期。');
      return;
    }
    setPreviewLoading(true);
    setMessage('');
    setResult(null);
    try {
      const next = await newProductCenterDataSource.previewAdFile(file);
      const nextStoreName = importStoreName || storeName || inferStoreNameFromFileName(file.name);
      setPreview(next);
      setMapping(next.mapping);
      setImportStoreName(nextStoreName);
      setStoreName(nextStoreName);
      setReportDate(importReportDate);
      setMessage('预览完成，正在自动导入 PostgreSQL...');
      await importAdPreview(next, next.mapping, nextStoreName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const importAdPreview = async (nextPreview: ImportPreview, nextMapping: Record<string, string>, nextStoreName: string) => {
    const missingAdMappings = getMissingAdMappings(nextMapping);
    if (missingAdMappings.length) {
      setMessage(`当前广告报表字段映射不完整，请检查：${missingAdMappings.join('、')}。如果这是商品基础资料表，再使用“商品信息导入”。`);
      return;
    }
    if (!nextMapping.storeName && !nextStoreName.trim()) {
      setMessage('广告报表没有店铺列时，请先填写默认店铺，例如 A店。');
      return;
    }
    setConfirmLoading(true);
    try {
      const next = await newProductCenterDataSource.confirmAdImport({
        previewId: nextPreview.previewId,
        fileName: nextPreview.fileName,
        rows: nextPreview.rows || [],
        mapping: nextMapping,
        reportDate: importReportDate || reportDate,
        storeName: nextStoreName,
      });
      setResult(next);
      setRecordsPage(1);
      const effectiveReportDate = importReportDate || reportDate;
      setStoreName(nextStoreName);
      setReportDate(effectiveReportDate);
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getAdImportRecords(1, AD_RECORD_PAGE_SIZE, {
          storeName: nextStoreName,
          reportDate: effectiveReportDate,
          ...filters,
          sortField,
          sortDirection,
        }),
      ]);
      setStorageStatus(status);
      setStorageError(status.ok ? '' : (status.message || 'PostgreSQL 未连接'));
      setOverview(records);
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
    await importAdPreview(preview, mapping, importStoreName || storeName);
  };

  const deleteSelectedBatch = async () => {
    if (!deleteBatch) return;
    setIsDeleting(true);
    try {
      const result = await newProductCenterDataSource.deleteAdImportBatch(String(deleteBatch.id));
      setMessage(result.message || `删除完成：广告日报 ${result.deletedAds ?? 0} 条。`);
      setDeleteBatch(null);
      setRecordsPage(1);
      await refreshOverview(1);
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
  const totalPages = Math.max(Math.ceil(totalRecords / AD_RECORD_PAGE_SIZE), 1);
  const summary = overview.summary || {};
  const changeSort = (column: string) => {
    const nextField = adRecordFallbackFields[column] || '';
    if (!nextField || AD_RECORD_ID_COLUMNS.has(column)) return;
    setRecordsPage(1);
    if (sortField === nextField) {
      setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(nextField);
      setSortDirection('desc');
    }
  };

  return (
    <section className="npc-page temu-ad-import-page">
      <section className="temu-import-hero">
        <div className="temu-import-hero-copy">
          <div className="temu-import-hero-upload temu-ad-hero-upload">
            <label className="excel-upload-box temu-import-upload-box">
              <input type="file" accept=".xlsx,.xls,.csv" disabled={previewLoading || confirmLoading || !importReportDate || !importStoreName} onChange={(event) => void onFile(event.target.files?.[0])} />
              <strong>{previewLoading ? '处理中...' : confirmLoading ? '导入中...' : '选择或拖入 Excel 文件'}</strong>
              <span>支持 .xlsx / .xls / .csv</span>
            </label>
            <div className="npc-import-controls temu-import-store-control">
              <label>报表日期<input type="date" value={importReportDate} onChange={(event) => setImportReportDate(event.target.value)} /></label>
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
            <span>广告商品数</span>
            <strong>{summary.adProductCount ?? 0}</strong>
            <small>{storeName || '请选择店铺'}</small>
          </article>
          <article>
            <span>总花费</span>
            <strong>{String(summary.adSpend ?? 0)}</strong>
            <small>推广销售额 {String(summary.promoSalesAmount ?? 0)}</small>
          </article>
          <article>
            <span>未匹配SPU</span>
            <strong>{summary.unmatchedCount ?? 0}</strong>
            <small>ROAS {summary.promoRoas == null ? '-' : Number(summary.promoRoas).toFixed(2)} / 订单 {String(summary.promoSubOrderCount ?? 0)}</small>
          </article>
        </div>
      </section>

      <article className="excel-record-panel npc-panel temu-import-context-panel">
        <header className="npc-panel-header">
          <h2>当前展示：{storeName && reportDate ? `${storeName} ${reportDate} 广告数据` : '请选择店铺和广告日期后查看数据'}</h2>
          <span>{latestBatch?.fileName ? `最近批次：${latestBatch.fileName}` : '暂无导入批次'}</span>
        </header>
        <div className="npc-mapping-grid temu-import-filter-grid">
          <label>查看店铺
            <select value={storeName} onChange={(event) => { setStoreName(event.target.value); setRecordsPage(1); }}>
              <option value="">请选择店铺</option>
              {stores.map((store) => <option key={store.id || store.storeName} value={store.storeName || ''}>{store.storeName}</option>)}
            </select>
          </label>
          <label>查看日期<input type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value); setRecordsPage(1); }} /></label>
          <label>SPU ID<input value={filters.spuId || ''} onChange={(event) => setFilters({ ...filters, spuId: event.target.value })} /></label>
          <label>商品名称<input value={filters.productName || ''} onChange={(event) => setFilters({ ...filters, productName: event.target.value })} /></label>
          <label>是否匹配商品<select value={filters.matched || ''} onChange={(event) => setFilters({ ...filters, matched: event.target.value })}><option value="">全部</option><option value="true">已匹配</option><option value="false">未匹配</option></select></label>
          <label>ROAS是否达标<select value={filters.roasMet || ''} onChange={(event) => setFilters({ ...filters, roasMet: event.target.value })}><option value="">全部</option><option value="true">达标</option><option value="false">未达标</option></select></label>
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
                切换查看店铺或查看日期不会改变这里的内容。
              </p>
              <p>本次导入店铺：{importStoreName || '-'}，广告日期：{importReportDate || '-'}</p>
            </div>
            <button type="button" disabled={confirmLoading || !reportDate} onClick={confirm}>{confirmLoading ? '导入中...' : '按当前映射重新导入'}</button>
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
        <div className="npc-table-wrap temu-ad-record-table">
          <table>
            <thead>
              <tr>
                {AD_RECORD_COLUMNS.map((column) => {
                  const field = adRecordFallbackFields[column];
                  const isSortable = Boolean(field && !AD_RECORD_ID_COLUMNS.has(column));
                  const isActive = isSortable && sortField === field;
                  return (
                    <th key={column}>
                      <span className="temu-ad-sort-header">
                        <span>{column}</span>
                        {isSortable && (
                          <button
                            type="button"
                            className={`temu-ad-sort-button${isActive ? ' is-active' : ''}`}
                            title={`${column}${isActive && sortDirection === 'asc' ? '从小到大' : '从大到小'}排序`}
                            aria-label={`${column}${isActive && sortDirection === 'asc' ? '从小到大' : '从大到小'}排序`}
                            onClick={() => changeSort(column)}
                          >
                            {isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                          </button>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {overview.records.map((row) => (
                <tr key={String(row.id)}>
                  {AD_RECORD_COLUMNS.map((column) => (
                    <td key={column} title={displayAdRecordCell(row, column)}>{displayAdRecordCell(row, column)}</td>
                  ))}
                </tr>
              ))}
              {overview.records.length === 0 && <tr><td colSpan={AD_RECORD_COLUMNS.length}>{storeName && reportDate ? '暂无当前店铺和日期的广告记录' : '请选择店铺和广告日期后查看数据'}</td></tr>}
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

      {overview.unmatched && overview.unmatched.length > 0 && (
        <article className="excel-record-panel npc-panel">
          <h2>SPU未匹配数据</h2>
          <div className="npc-table-wrap">
            <table>
              <thead><tr><th>商品名称</th><th>商品ID</th><th>SPU ID</th><th>失败原因</th></tr></thead>
              <tbody>
                {overview.unmatched.map((row, index) => (
                  <tr key={`${row.temuSpuId}-${index}`}>
                    <td>{String(row.productName || '-')}</td>
                    <td>{String(row.temuProductId || '-')}</td>
                    <td>{String(row.temuSpuId || '-')}</td>
                    <td>{String(row.errorReason || 'SPU未匹配商品信息')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <article className="excel-record-panel npc-panel temu-import-batch-panel">
        <h2>最近广告导入批次</h2>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>批次ID</th><th>导入类型</th><th>店铺</th><th>数据日期</th><th>文件名</th><th>总行数</th><th>成功行数</th><th>失败行数</th><th>匹配成功数</th><th>未匹配数</th><th>导入人</th><th>导入时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.id || '-').slice(0, 8)}</td>
                  <td>{String(row.importType || '-')}</td>
                  <td>{String(row.storeName || storeName || '-')}</td>
                  <td>{String(row.reportDate || reportDate || '-').slice(0, 10)}</td>
                  <td>{String(row.fileName || '-')}</td>
                  <td>{String(row.totalRows ?? 0)}</td>
                  <td>{String(row.successRows ?? 0)}</td>
                  <td>{String(row.errorRows ?? 0)}</td>
                  <td>{String(row.successRows ?? 0)}</td>
                  <td>{String(row.errorRows ?? 0)}</td>
                  <td>{String(row.uploadedByName || row.uploadedBy || '-')}</td>
                  <td>{formatShanghaiTime(row.finishedAt || row.createdAt)}</td>
                  <td>{String(row.status || '-')}</td>
                  <td>
                    <div className="temu-import-batch-actions">
                      <button type="button" onClick={() => window.alert(`批次 ${String(row.id)}\\n文件：${String(row.fileName || '-')}`)}>查看明细</button>
                      <button type="button" onClick={() => window.alert(row.errorRows ? '未匹配/失败数据已在上方区域展示。' : '该批次无失败行。')}>查看失败行</button>
                      <button type="button" disabled={!reportDate} onClick={() => void newProductCenterDataSource.rebuildSnapshot(reportDate).then(() => refreshOverview(recordsPage))}>重建快照</button>
                      {isAdmin && <button type="button" className="batch-delete-button" onClick={() => setDeleteBatch(row)}>删除</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={14}>暂无广告导入批次</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {deleteBatch && (
        <ConfirmDeleteModal
          title="确认删除该广告数据导入批次吗？"
          description="删除后，该批次对应的广告日报会从 PostgreSQL 删除，并重新计算相关新品快照。"
          isBusy={isDeleting}
          onCancel={() => setDeleteBatch(null)}
          onConfirm={deleteSelectedBatch}
        >
          <span>文件名：{String(deleteBatch.fileName || '-')}</span>
          <span>店铺：{String(deleteBatch.storeName || storeName || '-')}</span>
          <span>广告日期：{String(deleteBatch.reportDate || reportDate || '-').slice(0, 10)}</span>
          <span>成功行数：{String(deleteBatch.successRows ?? 0)}</span>
          <span>导入时间：{formatShanghaiTime(deleteBatch.finishedAt || deleteBatch.createdAt)}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}
