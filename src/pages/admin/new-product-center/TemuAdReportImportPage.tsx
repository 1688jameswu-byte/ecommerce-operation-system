import { useEffect, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const fieldLabels: Record<string, string> = {
  productName: '商品名称',
  temuProductId: '商品ID',
  temuSpuId: 'SPU ID',
  adSpend: '总花费',
  netAdSpend: '净总花费',
  globalSalesAmount: '申报价销售额（全域）',
  globalRoas: '投资回报率(ROAS)（全域）',
  globalAcos: '费比（全域）',
  globalCpa: '每笔成交花费（全域）',
  globalSubOrderCount: '子订单数（全域）',
  globalUnitCount: '件数（全域）',
  globalImpressions: '曝光（全域）',
  globalClicks: '点击（全域）',
  globalCtr: '点击率（全域）',
  globalCvr: '转化率（全域）',
  globalAddToCartCount: '加入购物车数（全域）',
  netPromoSalesAmount: '净申报价销售额（全域）',
  netPromoRoas: '净投资回报率(ROAS)（全域）',
  netPromoAcos: '净费比（全域）',
  netPromoCpa: '净每笔成交花费（全域）',
  netPromoSubOrderCount: '净子订单数（全域）',
  netPromoUnitCount: '净件数（全域）',
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
  '净申报价销售额（全域）',
  '净投资回报率(ROAS)（全域）',
  '净费比（全域）',
  '净每笔成交花费（全域）',
  '净子订单数（全域）',
  '净件数（全域）',
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
  '净申报价销售额（全域）': 'netPromoSalesAmount',
  '净投资回报率(ROAS)（全域）': 'netPromoRoas',
  '净费比（全域）': 'netPromoAcos',
  '净每笔成交花费（全域）': 'netPromoCpa',
  '净子订单数（全域）': 'netPromoSubOrderCount',
  '净件数（全域）': 'netPromoUnitCount',
};

const AD_RECORD_ID_COLUMNS = new Set(['商品名称', '商品ID', 'SPU ID']);

function pickVisibleAdMapping(mapping: Record<string, string>) {
  return Object.fromEntries(Object.keys(fieldLabels).map((field) => [field, mapping[field] || '']));
}

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

function getImportStatusLabel(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (value === 'success') return '全部成功';
  if (value === 'partial_success') return '部分成功';
  if (value === 'failed' || value === 'error') return '导入失败';
  if (value === 'processing') return '处理中';
  if (value === 'cancelled' || value === 'deleted') return '已作废';
  return status ? String(status) : '-';
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
  const initialParams = new URLSearchParams(window.location.search);
  const [reportDate, setReportDate] = useState(initialParams.get('reportDate') || '');
  const [importReportDate, setImportReportDate] = useState('');
  const [storeName, setStoreName] = useState(initialParams.get('storeName') || '');
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
    if ((!storeName && !isAdmin) || !reportDate) {
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
      let defaultStoreName = isAdmin ? '' : (temuStores[0]?.storeName || '');
      let defaultReportDate = reportDate;
      try {
        const recent = await newProductCenterDataSource.getAdImportRecords(1, 1, {});
        const recentStoreName = String(recent.batches?.[0]?.storeName || recent.records?.[0]?.storeName || '');
        if (!isAdmin && recentStoreName && temuStores.some((store) => store.storeName === recentStoreName)) {
          defaultStoreName = recentStoreName;
        }
        defaultReportDate = String(recent.reportDates?.[0] || recent.batches?.[0]?.reportDate || defaultReportDate || '').slice(0, 10);
      } catch {
        // Keep the first visible store; a later effect will try to load its latest report date.
      }
      setStoreName((current) => current || defaultStoreName);
      setImportStoreName((current) => current || temuStores[0]?.storeName || '');
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
      const visibleMapping = pickVisibleAdMapping(next.mapping);
      const nextStoreName = importStoreName || storeName || inferStoreNameFromFileName(file.name);
      setPreview(next);
      setMapping(visibleMapping);
      setImportStoreName(nextStoreName);
      setStoreName(nextStoreName);
      setReportDate(importReportDate);
      setMessage('预览完成，正在自动导入 PostgreSQL...');
      await importAdPreview(next, visibleMapping, nextStoreName);
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
      setMessage(`导入完成：${next.tableType || '广告推广'}，成功 ${next.successRows} 行，跳过 ${next.skippedRows ?? 0} 行，失败 ${next.errorRows} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirmLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setMessage('正在按当前字段映射重新导入 PostgreSQL...');
    await importAdPreview(preview, pickVisibleAdMapping(mapping), importStoreName || storeName);
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
            <small>{storeName || (isAdmin ? '全部店铺' : '请选择店铺')}</small>
          </article>
          <article>
            <span>总花费</span>
            <strong>{String(summary.adSpend ?? 0)}</strong>
            <small>全域销售额 {String(summary.globalSalesAmount ?? summary.promoSalesAmount ?? 0)}</small>
          </article>
          <article>
            <span>未匹配SPU</span>
            <strong>{summary.unmatchedCount ?? 0}</strong>
            <small>ROAS {summary.globalRoas == null && summary.promoRoas == null ? '-' : Number(summary.globalRoas ?? summary.promoRoas).toFixed(2)} / 订单 {String(summary.globalSubOrderCount ?? summary.promoSubOrderCount ?? 0)}</small>
          </article>
        </div>
      </section>

      <article className="excel-record-panel npc-panel temu-import-context-panel">
        <header className="npc-panel-header">
          <h2>当前展示：{reportDate ? `${storeName || '全部店铺'} ${reportDate} 广告数据` : '请选择广告日期后查看数据'}</h2>
          <span>{latestBatch?.fileName ? `最近批次：${latestBatch.fileName}` : '暂无导入批次'}</span>
        </header>
        <div className="npc-mapping-grid temu-import-filter-grid">
          <label>查看店铺
            <select value={storeName} onChange={(event) => { setStoreName(event.target.value); setRecordsPage(1); }}>
              <option value="">{isAdmin ? '全部店铺' : '请选择店铺'}</option>
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
              <p>本次导入店铺：{importStoreName || '-'}，广告日期：{importReportDate || '-'}，表格类型：{preview.tableType || '自动识别'}，跳过汇总行：{preview.skippedRows ?? 0} 行。</p>
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

      {result && (
        <article className="excel-record-panel npc-panel temu-import-preview-panel">
          <header className="npc-panel-header">
            <div>
              <span className="temu-import-step-label">导入结果</span>
              <h2>广告数据导入摘要</h2>
              <p>
                导入店铺：{importStoreName || storeName || '-'}，导入日期：{importReportDate || reportDate || '-'}，
                表格类型：{result.tableType || '自动识别'}。
              </p>
            </div>
          </header>
          <div className="npc-ad-import-result-grid">
            <article><span>总行数</span><strong>{result.totalRows}</strong></article>
            <article><span>成功行数</span><strong>{result.successRows}</strong></article>
            <article><span>跳过行数</span><strong>{result.skippedRows ?? 0}</strong></article>
            <article><span>异常行数</span><strong>{result.errorRows}</strong></article>
            <article><span>SPU匹配率</span><strong>{result.spuMatchRate == null ? '-' : `${(result.spuMatchRate * 100).toFixed(2)}%`}</strong></article>
            <article><span>未匹配SPU</span><strong>{result.unmatchedSpuCount ?? 0}</strong></article>
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
              {overview.records.length === 0 && <tr><td colSpan={AD_RECORD_COLUMNS.length}>{reportDate ? '暂无当前范围的广告记录' : '请选择广告日期后查看数据'}</td></tr>}
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
            <thead><tr><th>批次</th><th>店铺 / 日期 / 文件</th><th>导入结果</th><th>匹配结果</th><th>导入人 / 时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    <strong>{String(row.id || '-').slice(0, 8)}</strong>
                    <small>{String(row.importType || 'ad_product_daily')}</small>
                  </td>
                  <td>
                    <strong>{String(row.storeName || storeName || '-')} / {String(row.reportDate || reportDate || '-').slice(0, 10)}</strong>
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
                      {getImportStatusLabel(row.status)}
                    </span>
                  </td>
                  <td>
                    <div className="temu-import-batch-actions">
                      <button type="button" onClick={() => window.alert(`批次 ${String(row.id)}\\n文件：${String(row.fileName || '-')}`)}>明细</button>
                      <button type="button" onClick={() => window.alert(row.errorRows ? '未匹配/失败数据已在上方区域展示。' : '该批次无失败行。')}>查看失败行</button>
                      <button type="button" disabled={!reportDate} onClick={() => void newProductCenterDataSource.rebuildSnapshot(reportDate).then(() => refreshOverview(recordsPage))}>重建快照</button>
                      {isAdmin && <button type="button" className="batch-delete-button" onClick={() => setDeleteBatch(row)}>删除</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={7}>暂无广告导入批次</td></tr>}
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
