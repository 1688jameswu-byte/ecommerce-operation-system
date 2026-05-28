import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useVisibleStores } from '../../../auth/useVisibleStores';
import { parseExcelFile, parseTemuOrderExcelFile } from '../../../data-source/excelDataSource';
import { orderImportStorageDataSource } from '../../../data-source/orderImportStorageDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { ExcelImportPreview } from '../../../types/import';
import type { TemuOrderDetail, TemuOrderImportBatch } from '../../../types/order';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

type ImportStatus = 'normal' | 'missing' | 'duplicate' | 'abnormal';

interface ImportTableRow {
  id: string;
  batchId: string;
  date: string;
  storeName: string;
  detailCount: number;
  salesAmount: number;
  firstOrderCount: number;
  status: ImportStatus;
  importedAt: string;
  fileName: string;
}

interface DeleteScopeSummary {
  date?: string;
  storeName?: string;
  dateCount: number;
  storeCount: number;
  batchCount: number;
  detailCount: number;
  salesAmount: number;
}

const statusLabels: Record<ImportStatus, string> = {
  normal: '正常',
  missing: '缺失数据',
  duplicate: '重复导入',
  abnormal: '数据异常',
};
const IMPORT_RECORD_RENDER_LIMIT = 20;
const MISSING_IMPORT_LIMIT = 10;

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRecentCheckDates(days = 7) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(yesterday);
    date.setDate(yesterday.getDate() - (days - 1 - index));
    return toDateKey(date);
  });
}

function normalizeStoreName(value: unknown) {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .trim();

  if (!name) {
    return '未知店铺';
  }

  if (name.includes('�')) {
    const fallbackName = name.replace(/�+/g, '').trim();

    if (/^[a-z0-9]+$/i.test(fallbackName)) {
      return `${fallbackName}店`;
    }
  }

  return name;
}

function getStatus(batch: TemuOrderImportBatch, orders: TemuOrderDetail[], storeName: string, date: string): ImportStatus {
  if (!storeName || !date || orders.length === 0) {
    return 'missing';
  }

  if (orders.some((order) => order.salesAmount < 0 || Number.isNaN(order.salesAmount))) {
    return 'abnormal';
  }

  if (batch.duplicateRows > 0) {
    return 'duplicate';
  }

  return 'normal';
}

function buildRows(batches: TemuOrderImportBatch[]): ImportTableRow[] {
  return batches
    .flatMap((batch) => {
      const groups = new Map<string, TemuOrderDetail[]>();

      for (const order of batch.orders) {
        const date = order.orderDate || '-';
        const storeName = normalizeStoreName(order.storeName);
        const key = `${date}|${storeName}`;
        groups.set(key, [...(groups.get(key) ?? []), order]);
      }

      return Array.from(groups.entries()).map(([key, orders]) => {
        const [date, storeName] = key.split('|');

        return {
          id: `${batch.batchId}-${key}`,
          batchId: batch.batchId,
          date,
          storeName,
          detailCount: orders.length,
          salesAmount: orderImportStorageDataSource.sumSales(orders),
          firstOrderCount: orders.filter((order) => order.isFirstOrder).length,
          status: getStatus(batch, orders, storeName, date),
          importedAt: batch.importedAt,
          fileName: batch.fileName,
        };
      });
    })
    .sort((first, second) => `${second.date} ${second.importedAt}`.localeCompare(`${first.date} ${first.importedAt}`));
}

function groupRowsByDate(rows: ImportTableRow[]) {
  return rows.reduce<Array<[string, ImportTableRow[]]>>((groups, row) => {
    const latest = groups.at(-1);

    if (latest?.[0] === row.date) {
      latest[1].push(row);
      return groups;
    }

    return [...groups, [row.date, [row]]];
  }, []);
}

function summarizeRows(rows: ImportTableRow[], scope: { date?: string; storeName?: string }): DeleteScopeSummary {
  return {
    ...scope,
    dateCount: new Set(rows.map((row) => row.date)).size,
    storeCount: new Set(rows.map((row) => row.storeName)).size,
    batchCount: new Set(rows.map((row) => row.batchId)).size,
    detailCount: rows.reduce((total, row) => total + row.detailCount, 0),
    salesAmount: rows.reduce((total, row) => total + row.salesAmount, 0),
  };
}

function formatUnique(values: string[]) {
  return Array.from(new Set(values)).join('、');
}

function ExcelImportPage({ currentUser }: { currentUser: CurrentUser }) {
  const uploadPanelRef = useRef<HTMLElement | null>(null);
  const visibleStores = useVisibleStores(currentUser);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [batches, setBatches] = useState<TemuOrderImportBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteBatchRow, setDeleteBatchRow] = useState<ImportTableRow | null>(null);
  const [deleteScope, setDeleteScope] = useState<DeleteScopeSummary | null>(null);
  const [showAllMissingDates, setShowAllMissingDates] = useState(false);

  const rows = useMemo(() => buildRows(batches), [batches]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    return (
      (!dateFilter || row.date === dateFilter) &&
      (!storeFilter || row.storeName === storeFilter) &&
      (!statusFilter || row.status === statusFilter)
    );
  }), [dateFilter, rows, statusFilter, storeFilter]);
  const visibleRows = useMemo(() => filteredRows.slice(0, IMPORT_RECORD_RENDER_LIMIT), [filteredRows]);
  const groupedRows = useMemo(() => groupRowsByDate(visibleRows), [visibleRows]);
  const dateOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.date))), [rows]);
  const storeOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.storeName))).sort(), [rows]);
  const today = useMemo(() => toDateKey(new Date()), []);
  const todayRows = useMemo(() => rows.filter((row) => row.importedAt.slice(0, 10) === today), [rows, today]);
  const overview = useMemo(() => ({
    todayStoreCount: new Set(todayRows.map((row) => row.storeName)).size,
    todaySalesAmount: todayRows.reduce((total, row) => total + row.salesAmount, 0),
    todayFirstOrderCount: todayRows.reduce((total, row) => total + row.firstOrderCount, 0),
    batchCount: batches.length,
    abnormalStoreCount: rows.filter((row) => row.status === 'abnormal').length,
  }), [batches.length, rows, todayRows]);
  const scopeDeleteLabel =
    dateFilter && storeFilter
      ? '删除当前日期 + 店铺数据'
      : dateFilter
        ? '删除当前日期数据'
        : storeFilter
          ? '删除当前店铺数据'
          : '';
  const deleteBatchRows = useMemo(() => deleteBatchRow ? rows.filter((row) => row.batchId === deleteBatchRow.batchId) : [], [deleteBatchRow, rows]);
  const deleteBatchSummary = useMemo(() => deleteBatchRows.length > 0 ? summarizeRows(deleteBatchRows, {}) : null, [deleteBatchRows]);
  const isAdmin = currentUser.role === 'admin';
  const visibleStoreNames = useMemo(
    () => visibleStores.stores.map((store) => store.storeName || store.id).filter(Boolean),
    [visibleStores.stores],
  );
  const missingOrderItems = useMemo(() => {
    const checkDates = getRecentCheckDates();
    const importedKeys = new Set(rows.map((row) => `${normalizeStoreName(row.storeName)}|${row.date}`));
    const storeNames = (visibleStoreNames.length > 0 ? visibleStoreNames : storeOptions).map(normalizeStoreName);

    return Array.from(new Set(storeNames)).flatMap((storeName) =>
      checkDates.filter((date) => !importedKeys.has(`${storeName}|${date}`)).map((date) => ({ storeName, date })),
    );
  }, [rows, storeOptions, visibleStoreNames]);
  const visibleMissingOrderItems = showAllMissingDates ? missingOrderItems : missingOrderItems.slice(0, MISSING_IMPORT_LIMIT);
  const missingOrderGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    visibleMissingOrderItems.forEach((item) => groups.set(item.storeName, [...(groups.get(item.storeName) ?? []), item.date]));
    return Array.from(groups.entries());
  }, [visibleMissingOrderItems]);

  const refreshSavedData = async (full = false) => {
    const store = full
      ? orderImportStorageDataSource.loadStore()
      : await orderImportStorageDataSource.loadRecentStore({ recentDays: 30, limit: 500 });
    setBatches(store.batches);
  };

  useEffect(() => {
    void refreshSavedData();
  }, []);

  const importFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setError(null);
    setIsParsing(true);

    try {
      for (const file of files) {
        const [previewResult, orderImportResult] = await Promise.all([
          parseExcelFile(file),
          parseTemuOrderExcelFile(file),
        ]);
        await orderImportStorageDataSource.saveAsync(orderImportResult);
        setPreview(previewResult);
      }
      await refreshSavedData(true);
    } catch (error) {
      setPreview(null);
      const message = error instanceof Error ? error.message : '';
      setError(message || 'Excel 解析失败，请检查文件格式和订单表头。');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await importFiles(Array.from(event.dataTransfer.files));
  };

  const handleDeleteBatch = (batchId: string) => {
    orderImportStorageDataSource.deleteBatch(batchId);
    setDeleteBatchRow(null);
    void refreshSavedData();
    setError(null);
  };

  const openDeleteScopeConfirm = () => {
    const scope = { date: dateFilter || undefined, storeName: storeFilter || undefined };

    if (!scope.date && !scope.storeName) {
      setError('请先选择具体日期或具体店铺后再删除。');
      return;
    }

    const matchedRows = rows.filter((row) => {
      return (!scope.date || row.date === scope.date) && (!scope.storeName || row.storeName === scope.storeName);
    });

    if (matchedRows.length === 0) {
      setError('当前范围内没有可删除的导入数据。');
      return;
    }

    setError(null);
    setDeleteScope(summarizeRows(matchedRows, scope));
  };

  const handleDeleteScope = () => {
    if (!deleteScope || deleteScope.detailCount === 0 || (!deleteScope.date && !deleteScope.storeName)) {
      setError('当前范围内没有可删除的导入数据。');
      setDeleteScope(null);
      return;
    }

    orderImportStorageDataSource.deleteByScope({
      date: deleteScope.date,
      storeName: deleteScope.storeName,
    });
    setDeleteScope(null);
    void refreshSavedData();
    setError(null);
  };

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article>
          <span>今日已导入店铺</span>
          <strong>{overview.todayStoreCount}</strong>
        </article>
        <article>
          <span>今日总销售额</span>
          <strong>¥ {formatMoney(overview.todaySalesAmount)}</strong>
        </article>
        <article>
          <span>今日总首单</span>
          <strong>{overview.todayFirstOrderCount}</strong>
        </article>
        <article>
          <span>导入批次数量</span>
          <strong>{overview.batchCount}</strong>
        </article>
        <article>
          <span>异常店铺数量</span>
          <strong>{overview.abnormalStoreCount}</strong>
        </article>
      </section>

      <article className={`import-missing-card ${missingOrderItems.length > 0 ? 'has-missing' : ''}`}>
        <header>
          <div>
            <h2>订单数据缺失提醒</h2>
            <p>{missingOrderItems.length > 0 ? '以下订单销售数据尚未导入：' : '最近订单销售数据完整。'}</p>
          </div>
          {missingOrderItems.length > 0 && <span>{missingOrderItems.length} 条</span>}
        </header>
        {missingOrderGroups.map(([storeName, dates]) => (
          <section key={storeName}>
            <strong>{storeName}</strong>
            <div>{dates.map((date) => <span key={date}>{date}</span>)}</div>
          </section>
        ))}
        {missingOrderItems.length > MISSING_IMPORT_LIMIT && (
          <button type="button" onClick={() => setShowAllMissingDates(!showAllMissingDates)}>
            {showAllMissingDates ? '收起' : '展开更多'}
          </button>
        )}
        {missingOrderItems.length > 0 && (
          <button type="button" onClick={() => uploadPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            去上传
          </button>
        )}
      </article>

      <article className="excel-upload-panel" ref={uploadPanelRef}>
        <div>
          <span className="admin-status">订单销售数据导入</span>
          <h2>上传店铺订单 Excel</h2>
          <p>按店铺和日期沉淀经营数据，同店铺同日期重新导入时会替换原数据。</p>
        </div>
        <label className="excel-upload-box" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleFileChange} />
          <strong>{isParsing ? '解析中...' : '选择或拖入 Excel 文件'}</strong>
          <span>支持批量上传 .xlsx / .xls / .csv</span>
        </label>
        {error && <div className="excel-import-error">{error}</div>}
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>导入记录</h2>
            <p>按日期分组展示店铺经营数据，文件名作为辅助信息保留。</p>
          </div>
          <span>{filteredRows.length > IMPORT_RECORD_RENDER_LIMIT ? `${filteredRows.length} 条，显示最近 ${IMPORT_RECORD_RENDER_LIMIT} 条` : `${filteredRows.length} 条`}</span>
        </header>

        <section className="import-filter-bar">
          <label>
            日期
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="">全部日期</option>
              {dateOptions.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <label>
            店铺
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">全部店铺</option>
              {storeOptions.map((storeName) => (
                <option key={storeName} value={storeName}>
                  {storeName}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && scopeDeleteLabel && (
            <div className="import-filter-actions">
              <button className="excel-clear-button danger-action-button" type="button" onClick={openDeleteScopeConfirm}>
                {scopeDeleteLabel}
              </button>
            </div>
          )}
        </section>

        <div className="import-record-table-wrap">
          {groupedRows.map(([date, group], index) => (
            <details key={date} className="import-date-group" open={index === 0}>
              <summary>
                <strong>{date}</strong>
                <span>{group.length} 个店铺记录</span>
              </summary>
              <table className="import-record-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>店铺名称</th>
                    <th>Excel明细数</th>
                    <th>销售额</th>
                    <th>首单数量</th>
                    <th>数据状态</th>
                    <th>导入时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>
                        <strong>{row.storeName}</strong>
                        <span className="import-file-name">{row.fileName}</span>
                      </td>
                      <td>{row.detailCount}</td>
                      <td>¥ {formatMoney(row.salesAmount)}</td>
                      <td>{row.firstOrderCount}</td>
                      <td>
                        <span className={`import-status import-status-${row.status}`}>{statusLabels[row.status]}</span>
                      </td>
                      <td>{row.importedAt.replace('T', ' ').slice(0, 19)}</td>
                      <td>
                        {isAdmin ? (
                          <button type="button" className="danger-action-button" onClick={() => setDeleteBatchRow(row)}>
                            删除批次
                          </button>
                        ) : (
                          <span className="import-file-name">仅管理员可删除导入数据</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          {filteredRows.length === 0 && <div className="import-record-empty">暂无符合条件的导入记录</div>}
        </div>
      </article>

      {preview && (
        <article className="excel-preview-card compact-preview">
          <header>
            <div>
              <h2>最近上传表头预览</h2>
              <p>{preview.fileName}</p>
            </div>
            <span>{preview.sheets.length} 个工作表</span>
          </header>
          <div className="excel-header-tags">
            {preview.sheets.flatMap((sheet) => sheet.headers.slice(0, 8)).map((header) => (
              <span key={header}>{header}</span>
            ))}
          </div>
        </article>
      )}
      {deleteBatchRow && deleteBatchSummary && (
        <ConfirmDeleteModal
          title="确认删除该批次数据吗？"
          description="删除后不可恢复。"
          onCancel={() => setDeleteBatchRow(null)}
          onConfirm={() => handleDeleteBatch(deleteBatchRow.batchId)}
        >
          <span>日期：{formatUnique(deleteBatchRows.map((row) => row.date))}</span>
          <span>店铺名称：{formatUnique(deleteBatchRows.map((row) => row.storeName))}</span>
          <span>文件名：{deleteBatchRow.fileName}</span>
          <span>销售额：¥ {formatMoney(deleteBatchSummary.salesAmount)}</span>
          <span>明细数：{deleteBatchSummary.detailCount}</span>
        </ConfirmDeleteModal>
      )}
      {deleteScope && (
        <ConfirmDeleteModal
          title={`确认${scopeDeleteLabel}吗？`}
          description="删除后不可恢复。"
          onCancel={() => setDeleteScope(null)}
          onConfirm={handleDeleteScope}
        >
          {deleteScope.date && <span>将删除的日期：{deleteScope.date}</span>}
          {deleteScope.storeName && <span>店铺名称：{deleteScope.storeName}</span>}
          {!deleteScope.storeName && <span>影响的店铺数：{deleteScope.storeCount}</span>}
          {!deleteScope.date && <span>影响的日期数：{deleteScope.dateCount}</span>}
          <span>影响的批次数：{deleteScope.batchCount}</span>
          <span>影响的明细数：{deleteScope.detailCount}</span>
          <span>销售额合计：¥ {formatMoney(deleteScope.salesAmount)}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}

export default ExcelImportPage;

