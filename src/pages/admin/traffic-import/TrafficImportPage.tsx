import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useVisibleStores } from '../../../auth/useVisibleStores';
import { parseTrafficConversionExcelFile, trafficConversionDataSource } from '../../../data-source/trafficConversionDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { TrafficConversionRecord, TrafficConversionStore, TrafficImportBatch, TrafficImportStatus } from '../../../types/traffic';

const statusLabels: Record<TrafficImportStatus, string> = {
  success: '导入成功',
  covered: '已覆盖旧数据',
  abnormal: '数据异常',
  missing: '缺少字段',
};
const MISSING_IMPORT_LIMIT = 10;

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

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function TrafficImportPage({ currentUser }: { currentUser: CurrentUser }) {
  const uploadPanelRef = useRef<HTMLElement | null>(null);
  const [storeName, setStoreName] = useState('');
  const visibleStores = useVisibleStores(currentUser);
  const [store, setStore] = useState<TrafficConversionStore>({ records: [], batches: [] });
  const [message, setMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [importDateFilter, setImportDateFilter] = useState('');
  const [dataDateFilter, setDataDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmBatch, setConfirmBatch] = useState<TrafficImportBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAllMissingDates, setShowAllMissingDates] = useState(false);

  const refresh = () => setStore(trafficConversionDataSource.loadStore());

  useEffect(() => {
    refresh();
  }, []);

  const batches = useMemo(
    () => (store.batches ?? []).slice().sort((first, second) => second.importedAt.localeCompare(first.importedAt)),
    [store.batches],
  );

  const filteredBatches = useMemo(
    () => batches.filter((batch) =>
      (!storeFilter || batch.storeName === storeFilter) &&
      (!importDateFilter || batch.importedAt.slice(0, 10) === importDateFilter) &&
      (!dataDateFilter || (batch.dateStart <= dataDateFilter && batch.dateEnd >= dataDateFilter)) &&
      (!statusFilter || batch.status === statusFilter),
    ),
    [batches, dataDateFilter, importDateFilter, statusFilter, storeFilter],
  );

  const stores = useMemo(() => Array.from(new Set(batches.map((batch) => batch.storeName))).sort(), [batches]);
  const isAdmin = currentUser.role === 'admin';
  const visibleStoreNames = useMemo(
    () => visibleStores.stores.map((item) => item.storeName || item.id).filter(Boolean),
    [visibleStores.stores],
  );
  const unauthorizedStoreNames = useMemo(() => {
    if (isAdmin) {
      return [];
    }

    const authorized = new Set(visibleStoreNames);
    return store.records
      .map((record) => record.storeName)
      .filter((name, index, list) => name && !authorized.has(name) && list.indexOf(name) === index);
  }, [isAdmin, store.records, visibleStoreNames]);
  const canUpload = isAdmin || visibleStoreNames.length > 0;
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const detailRows = useMemo(
    () => store.records
      .filter((record) => record.batchId === selectedBatchId)
      .sort((first, second) => first.date.localeCompare(second.date)),
    [selectedBatchId, store.records],
  );
  const missingTrafficItems = useMemo(() => {
    const checkDates = getRecentCheckDates();
    const importedKeys = new Set(store.records.map((record) => `${record.storeName}|${record.date}`));
    const storeNames = visibleStoreNames.length > 0 ? visibleStoreNames : stores;

    return Array.from(new Set(storeNames)).flatMap((name) =>
      checkDates.filter((date) => !importedKeys.has(`${name}|${date}`)).map((date) => ({ storeName: name, date })),
    );
  }, [store.records, stores, visibleStoreNames]);
  const visibleMissingTrafficItems = showAllMissingDates ? missingTrafficItems : missingTrafficItems.slice(0, MISSING_IMPORT_LIMIT);
  const missingTrafficGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    visibleMissingTrafficItems.forEach((item) => groups.set(item.storeName, [...(groups.get(item.storeName) ?? []), item.date]));
    return Array.from(groups.entries());
  }, [visibleMissingTrafficItems]);

  function getInitialImportStoreName() {
    if (isAdmin) {
      return storeName;
    }

    if (visibleStoreNames.length === 0) {
      throw new Error('当前账号未配置可导入店铺，请联系管理员。');
    }

    return visibleStoreNames.length === 1 ? visibleStoreNames[0] : '';
  }

  function resolveImportStoreName(searchableText: string) {
    if (isAdmin) {
      return storeName;
    }

    if (visibleStoreNames.length === 1) {
      return visibleStoreNames[0];
    }

    const searchable = normalizeSearchText(searchableText);
    const matchedStores = visibleStoreNames.filter((name) => searchable.includes(normalizeSearchText(name)));

    if (matchedStores.length !== 1) {
      throw new Error('当前账号有多个可导入店铺，请确认文件名或表格内容包含明确店铺名称。');
    }

    return matchedStores[0];
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsParsing(true);
    setMessage('');

    try {
      if (!canUpload) {
        throw new Error('当前账号未配置可导入店铺，请联系管理员。');
      }

      let totalRows = 0;
      let coveredRows = 0;
      let newRows = 0;
      let lastBatchId = '';

      for (const file of files) {
        const result = await parseTrafficConversionExcelFile(file, getInitialImportStoreName());
        const blockedStores = unauthorizedStoreNames.filter((name) =>
          normalizeSearchText(result.searchableText).includes(normalizeSearchText(name)),
        );
        if (blockedStores.length > 0) {
          throw new Error(`导入失败：当前文件包含未授权店铺【${blockedStores.join('、')}】，请重新检查文件。`);
        }
        const importStoreName = resolveImportStoreName(result.searchableText);
        const records = result.records.map((record) => ({ ...record, storeName: importStoreName }));
        const saveResult = trafficConversionDataSource.save(records, { searchableText: result.searchableText });
        totalRows += result.records.length;
        coveredRows += saveResult.coveredCount;
        newRows += saveResult.newCount;
        lastBatchId = saveResult.batch.id;
      }

      refresh();
      setSelectedBatchId(lastBatchId);
      setMessage(`导入 ${totalRows} 条，新增 ${newRows} 条，覆盖 ${coveredRows} 条。${coveredRows > 0 ? '已覆盖旧数据。' : ''}`);
    } catch (error) {
      setMessage(error instanceof Error && (
        error.message.startsWith('导入失败：') ||
        ['当前账号无权导入该店铺数据', '当前账号未配置可导入店铺，请联系管理员。', '当前账号有多个可导入店铺，请确认文件名或表格内容包含明确店铺名称。'].includes(error.message)
      )
        ? error.message
        : '导入失败，请检查 Excel 字段。');
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!confirmBatch) {
      return;
    }

    setIsDeleting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const deleted = trafficConversionDataSource.deleteBatch(confirmBatch.id);
      refresh();
      if (selectedBatchId === confirmBatch.id) {
        setSelectedBatchId('');
      }
      setMessage(deleted ? '删除成功' : '删除失败，未找到该批次。');
    } catch (error) {
      setMessage(`删除失败：${error instanceof Error ? error.message : 'JSON 文件写入失败'}`);
    } finally {
      setConfirmBatch(null);
      setIsDeleting(false);
    }
  };

  const handleRegenerate = () => {
    try {
      trafficConversionDataSource.regenerateAnalysisResults();
      setMessage('分析结果已重新生成');
    } catch (error) {
      setMessage(`分析结果生成失败：${error instanceof Error ? error.message : 'JSON 文件写入失败'}`);
    }
  };

  return (
    <section className="excel-import-page">
      <article className={`import-missing-card ${missingTrafficItems.length > 0 ? 'has-missing' : ''}`}>
        <header>
          <div>
            <h2>流量数据缺失提醒</h2>
            <p>{missingTrafficItems.length > 0 ? '以下流量转化数据尚未导入：' : '最近流量转化数据完整。'}</p>
          </div>
          {missingTrafficItems.length > 0 && <span>{missingTrafficItems.length} 条</span>}
        </header>
        {missingTrafficGroups.map(([name, dates]) => (
          <section key={name}>
            <strong>{name}</strong>
            <div>{dates.map((date) => <span key={date}>{date}</span>)}</div>
          </section>
        ))}
        {missingTrafficItems.length > MISSING_IMPORT_LIMIT && (
          <button type="button" onClick={() => setShowAllMissingDates(!showAllMissingDates)}>
            {showAllMissingDates ? '收起' : '展开更多'}
          </button>
        )}
        {missingTrafficItems.length > 0 && (
          <button type="button" onClick={() => uploadPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            去上传
          </button>
        )}
      </article>

      <article className="excel-upload-panel traffic-upload-panel" ref={uploadPanelRef}>
        <div>
          <span className="admin-status">店铺流量转化数据导入</span>
          <h2>上传每日流量转化 Excel</h2>
          <p>{isAdmin ? '支持批量上传；如果 Excel 无店铺名称，可手动填写或从文件名识别。' : `将自动绑定当前账号可见店铺：${visibleStoreNames.join('、') || '未配置'}`}</p>
        </div>
        {isAdmin && (
          <label className="traffic-store-input">
            店铺名称
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="例如：K店" />
          </label>
        )}
        <label className="excel-upload-box traffic-upload-box">
          <input type="file" accept=".xlsx,.xls,.csv" multiple disabled={!canUpload || isParsing} onChange={handleFileChange} />
          <strong>{isParsing ? '解析中...' : '选择 Excel'}</strong>
          <span>{canUpload ? '支持批量上传' : '当前账号未配置可导入店铺，请联系管理员。'}</span>
        </label>
      </article>

      {message && <div className="excel-import-error traffic-import-message">{message}</div>}

      <div className="analysis-maintenance-bar">
        <button type="button" onClick={handleRegenerate}>重新生成分析结果</button>
      </div>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>导入批次汇总</h2>
            <p>默认按批次管理，每个店铺每次上传生成一条记录。</p>
          </div>
          <span>{filteredBatches.length} 个批次</span>
        </header>
        <section className="import-filter-bar traffic-batch-filter">
          <label>
            店铺
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">全部店铺</option>
              {stores.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            导入日期
            <input type="date" value={importDateFilter} onChange={(event) => setImportDateFilter(event.target.value)} />
          </label>
          <label>
            数据日期范围
            <input type="date" value={dataDateFilter} onChange={(event) => setDataDateFilter(event.target.value)} />
          </label>
          <label>
            导入状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </section>
        <div className="import-record-table-wrap">
          <table className="import-record-table traffic-batch-table">
            <thead>
              <tr>
                <th>导入时间</th>
                <th>店铺名称</th>
                <th>文件名</th>
                <th>日期范围</th>
                <th>覆盖天数</th>
                <th>明细行数</th>
                <th>商品访客数合计</th>
                <th>总支付买家数合计</th>
                <th>平均商详支付转化率</th>
                <th>导入状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => (
                <tr key={batch.id}>
                  <td>{formatTime(batch.importedAt)}</td>
                  <td><strong>{batch.storeName}</strong></td>
                  <td><span className="import-file-name">{batch.fileName || '-'}</span></td>
                  <td>{batch.dateStart || '-'} 至 {batch.dateEnd || '-'}</td>
                  <td>新增 {batch.newCount} 条，覆盖 {batch.coveredCount} 条</td>
                  <td>{batch.detailCount}</td>
                  <td>{batch.productVisitorsTotal}</td>
                  <td>{batch.totalPayBuyersTotal}</td>
                  <td>{formatPercent(batch.detailPayConversionRateAvg)}</td>
                  <td><span className={`import-status import-status-${batch.status}`}>{statusLabels[batch.status]}</span></td>
                  <td>
                    <div className="traffic-batch-actions">
                      <button type="button" className="batch-view-button" onClick={() => setSelectedBatchId(selectedBatchId === batch.id ? '' : batch.id)}>
                        {selectedBatchId === batch.id ? '收起明细' : '查看明细'}
                      </button>
                      {isAdmin ? (
                        <button type="button" className="batch-delete-button" onClick={() => setConfirmBatch(batch)}>
                          删除
                        </button>
                      ) : (
                        <span className="import-file-name">仅管理员可删除导入数据</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredBatches.length === 0 && <div className="import-record-empty">暂无导入批次</div>}
        </div>
      </article>

      <article className="excel-record-panel batch-detail-panel">
        <header>
          <div>
            <h2>明细数据查看</h2>
            <p>{selectedBatch ? `${selectedBatch.storeName}：${selectedBatch.dateStart} 至 ${selectedBatch.dateEnd}` : '请选择一个导入批次查看每日明细。'}</p>
          </div>
          <span>{detailRows.length} 条</span>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>店铺</th>
                <th>商品访客数</th>
                <th>商详支付转化率</th>
                <th>总支付买家数</th>
                <th>导入时间</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((record: TrafficConversionRecord) => (
                <tr key={`${record.batchId}-${record.storeName}-${record.date}`}>
                  <td>{record.date}</td>
                  <td><strong>{record.storeName}</strong></td>
                  <td>{record.productVisitors}</td>
                  <td>{formatPercent(record.detailPayConversionRate)}</td>
                  <td>{record.totalPayBuyers}</td>
                  <td>{formatTime(record.importedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detailRows.length === 0 && <div className="import-record-empty">未选择批次或该批次明细已被覆盖</div>}
        </div>
      </article>

      {confirmBatch && (
        <div className="delete-modal-backdrop" role="presentation">
          <section className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-batch-title">
            <h2 id="delete-batch-title">确认删除该批次数据？</h2>
            <p>删除后无法恢复。</p>
            <div className="delete-modal-info">
              <span>店铺：{confirmBatch.storeName}</span>
              <span>日期范围：{confirmBatch.dateStart} 至 {confirmBatch.dateEnd}</span>
              <span>数据条数：{confirmBatch.detailCount}</span>
            </div>
            <div className="delete-modal-actions">
              <button type="button" className="delete-cancel-button" autoFocus disabled={isDeleting} onClick={() => setConfirmBatch(null)}>
                取消
              </button>
              <button type="button" className="delete-confirm-button" disabled={isDeleting} onClick={handleDelete}>
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default TrafficImportPage;
