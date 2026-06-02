import * as XLSX from 'xlsx';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { salaryFinancialDataSource } from '../../../data-source/salaryFinancialDataSource';
import { storeDataSource } from '../../../data-source/storeDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { StorePlatform, StoreRecord } from '../../../types/store';
import type { FinancialExpenseCategory, SalaryFinancialDetail, SalaryFinancialDetailPage, SalaryFinancialImportBatch } from '../../../types/salary';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const platforms: StorePlatform[] = ['TEMU', 'Amazon', 'TikTok', 'Shopify', '1688', 'Other'];
const requiredHeaders = ['账务时间', '账务类型', '币种', '收支金额', '备注'];
const pageSize = 20;
const detailPageSize = 50;
const filterStorageKey = 'salary-finance-import-filters';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toNumber(value: unknown) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function detectCategory(remark: string): FinancialExpenseCategory {
  if (remark.includes('推广服务费')) return '推广服务费';
  if (remark.includes('消费者及履约保障-售后问题')) return '消费者及履约保障-售后问题';
  if (remark.includes('仓储综合服务费')) return '仓储综合服务费';
  if (remark.includes('合规EPR')) return '合规EPR物流包装环保费';
  if (remark.includes('提现')) return '提现';
  return '其他支出';
}

function formatExcelDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')} ${String(parsed.H).padStart(2, '0')}:${String(parsed.M).padStart(2, '0')}:${String(parsed.S).padStart(2, '0')}`;
    }
  }

  return String(value ?? '').trim();
}

function findHeaderRow(rows: unknown[][]) {
  return rows.findIndex((row) => requiredHeaders.every((header) => row.map((cell) => String(cell ?? '').trim()).includes(header)));
}

function loadSavedFilters() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(filterStorageKey) || '{}') as { platform?: StorePlatform; storeId?: string; period?: string };
    return {
      platform: platforms.includes(saved.platform as StorePlatform) ? saved.platform as StorePlatform : 'TEMU',
      storeId: saved.storeId || '',
      period: saved.period || currentMonth(),
    };
  } catch {
    return { platform: 'TEMU' as StorePlatform, storeId: '', period: currentMonth() };
  }
}

async function parseFinancialExcel(file: File, form: { platform: StorePlatform; storeId: string; storeName: string; period: string }) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex < 0) {
    throw new Error(`缺少必要字段：${requiredHeaders.join('、')}`);
  }

  const headers = rows[headerRowIndex].map((cell) => String(cell ?? '').trim());
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`缺少必要字段：${missingHeaders.join('、')}`);
  }

  const indexOf = (header: string) => headers.indexOf(header);
  const details: Array<Omit<SalaryFinancialDetail, 'id' | 'importBatchId' | 'createdAt'>> = [];
  let failedRows = 0;

  rows.slice(headerRowIndex + 1).forEach((row) => {
    if (!row.some((cell) => String(cell ?? '').trim())) {
      return;
    }

    const amount = toNumber(row[indexOf('收支金额')]);
    if (!Number.isFinite(amount)) {
      failedRows += 1;
      return;
    }

    const remark = String(row[indexOf('备注')] ?? '').trim();
    details.push({
      platform: form.platform,
      storeId: form.storeId,
      storeName: form.storeName,
      period: form.period,
      transactionTime: formatExcelDate(row[indexOf('账务时间')]),
      transactionType: String(row[indexOf('账务类型')] ?? '').trim(),
      currency: String(row[indexOf('币种')] ?? '').trim().toUpperCase(),
      amount,
      remark,
      category: detectCategory(remark),
      sourceFileName: file.name,
    });
  });

  return {
    fileName: file.name,
    totalRows: rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => String(cell ?? '').trim())).length,
    failedRows,
    details,
  };
}

function FinancialDetailImportPage({ currentUser }: { currentUser: CurrentUser }) {
  const savedFilters = useMemo(loadSavedFilters, []);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [platform, setPlatform] = useState<StorePlatform>(savedFilters.platform);
  const [storeId, setStoreId] = useState(savedFilters.storeId);
  const [period, setPeriod] = useState(savedFilters.period);
  const [batches, setBatches] = useState<SalaryFinancialImportBatch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteBatch, setDeleteBatch] = useState<SalaryFinancialImportBatch | null>(null);
  const [detailState, setDetailState] = useState<{ batchId: string; loading: boolean; data: SalaryFinancialDetailPage | null } | null>(null);
  const isAdmin = currentUser.role === 'admin';
  const selectedStore = stores.find((store) => store.id === storeId);
  const filteredStores = useMemo(() => stores.filter((store) => !platform || store.platform === platform), [platform, stores]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function refresh(nextPage = page) {
    setLoading(true);
    try {
      const data = await salaryFinancialDataSource.loadImportBatches({ platform, storeId, period, page: nextPage, pageSize });
      setBatches(data.records);
      setPage(data.page);
      setTotal(data.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入批次读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setStores(storeDataSource.load());
  }, []);

  useEffect(() => {
    void refresh(1);
  }, [platform, storeId, period]);

  useEffect(() => {
    window.localStorage.setItem(filterStorageKey, JSON.stringify({ platform, storeId, period }));
  }, [period, platform, storeId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedStore) return;
    if (!isAdmin) {
      setMessage('普通运营账号不能导入财务明细。');
      return;
    }

    try {
      setMessage('正在解析 Excel...');
      const existing = await salaryFinancialDataSource.loadImportBatches({ platform, storeId, period, page: 1, pageSize: 1 });
      if (existing.total > 0 && !window.confirm('当前店铺当前月份已有财务明细，重新导入将覆盖原数据，是否继续？')) {
        setMessage('已取消重新导入。');
        return;
      }

      const parsed = await parseFinancialExcel(file, {
        platform,
        storeId,
        storeName: selectedStore.storeName,
        period,
      });
      const successRows = parsed.details.length;
      const hasNonCny = parsed.details.some((detail) => detail.currency !== 'CNY');
      const hasOtherExpense = parsed.details.some((detail) => detail.category === '其他支出');

      const result = await salaryFinancialDataSource.saveImportBatch({
        batch: {
          platform,
          storeId,
          storeName: selectedStore.storeName,
          period,
          fileName: parsed.fileName,
          totalRows: parsed.totalRows,
          successRows,
          failedRows: parsed.failedRows,
          inflowAmount: 0,
          expenseAmount: 0,
          withdrawAmount: 0,
          operationExpenseAmount: 0,
          hasNonCny,
          hasOtherExpense,
        },
        details: parsed.details,
      });

      setMessage(`导入完成：成功 ${result.batch.successRows} 行，失败 ${result.batch.failedRows} 行。${result.batch.hasNonCny ? '当前核算仅统计 CNY。' : ''}`);
      await refresh(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '财务明细导入失败');
    }
  }

  async function deleteSelectedBatch() {
    if (!deleteBatch) return;
    try {
      await salaryFinancialDataSource.deleteImportBatch(deleteBatch.id);
      setDeleteBatch(null);
      setDetailState(null);
      setMessage('导入批次已删除。');
      await refresh(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function toggleDetail(batch: SalaryFinancialImportBatch, nextPage = 1) {
    if (detailState?.batchId === batch.id && nextPage === detailState.data?.page) {
      setDetailState(null);
      return;
    }

    setDetailState({ batchId: batch.id, loading: true, data: detailState?.batchId === batch.id ? detailState.data : null });
    const data = await salaryFinancialDataSource.loadBatchDetails(batch.id, { page: nextPage, pageSize: detailPageSize });
    setDetailState({ batchId: batch.id, loading: false, data });
  }

  return (
    <section className="excel-import-page">
      <article className="excel-upload-panel salary-finance-upload-panel">
        <div>
          <span className="admin-status">财务明细导入</span>
          <h2>上传财务明细 Excel</h2>
          <p>同平台、店铺、月份重新导入时会覆盖旧数据，避免工资重复统计。</p>
        </div>
        <section className="salary-finance-import-form">
          <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value as StorePlatform)}>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>店铺<select value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">请选择店铺</option>{filteredStores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}</select></label>
          <label>财务月份<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        </section>
        <label className={`excel-upload-box ${!isAdmin ? 'disabled-upload-box' : ''}`}>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!isAdmin || !storeId} onChange={handleFileChange} />
          <strong>{isAdmin ? '选择 Excel 文件' : '仅管理员可导入'}</strong>
          <span>字段：账务时间 / 账务类型 / 币种 / 收支金额 / 备注</span>
        </label>
      </article>

      {message && <div className="excel-import-error salary-finance-message">{message}</div>}

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>导入批次</h2>
            <p>仅展示批次汇总；明细点击后分页加载。</p>
          </div>
          <span>{loading ? '加载中...' : `${total} 条，第 ${page}/${totalPages} 页`}</span>
        </header>
        <section className="import-filter-bar salary-finance-filter-bar">
          <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value as StorePlatform)}>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>店铺<select value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">全部店铺</option>{filteredStores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}</select></label>
          <label>月份<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        </section>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>平台</th>
                <th>店铺</th>
                <th>财务月份</th>
                <th>总行数</th>
                <th>成功</th>
                <th>失败</th>
                <th>流入金额</th>
                <th>支出金额</th>
                <th>提现金额</th>
                <th>运营支出</th>
                <th>导入时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const detailOpen = detailState?.batchId === batch.id;
                const detail = detailOpen ? detailState.data : null;
                const detailPages = Math.max(1, Math.ceil((detail?.total ?? 0) / detailPageSize));
                return (
                  <Fragment key={batch.id}>
                    <tr>
                      <td><strong>{batch.fileName}</strong>{batch.hasNonCny && <span className="import-file-name">当前核算仅统计 CNY</span>}{batch.hasOtherExpense && <span className="import-file-name">含其他支出</span>}</td>
                      <td>{batch.platform}</td>
                      <td>{batch.storeName || batch.storeId}</td>
                      <td>{batch.period}</td>
                      <td>{batch.totalRows}</td>
                      <td>{batch.successRows}</td>
                      <td>{batch.failedRows}</td>
                      <td>¥ {formatMoney(batch.inflowAmount)}</td>
                      <td>¥ {formatMoney(batch.expenseAmount)}</td>
                      <td>¥ {formatMoney(batch.withdrawAmount)}</td>
                      <td>¥ {formatMoney(batch.operationExpenseAmount)}</td>
                      <td>{batch.importedAt.replace('T', ' ').slice(0, 19)}</td>
                      <td>
                        <button type="button" onClick={() => toggleDetail(batch)}>{detailOpen ? '收起明细' : '查看明细'}</button>
                        {isAdmin && <button type="button" className="danger-action-button" onClick={() => setDeleteBatch(batch)}>删除批次</button>}
                      </td>
                    </tr>
                    {detailOpen && (
                      <tr>
                        <td colSpan={13}>
                          <div className="import-detail-panel">
                            {detailState.loading && <div className="import-record-empty">明细加载中...</div>}
                            {!detailState.loading && detail && (
                              <>
                                <div className="import-detail-toolbar">
                                  <strong>财务明细</strong>
                                  <span>{detail.total} 条，第 {detail.page}/{detailPages} 页</span>
                                  <button type="button" disabled={detail.page <= 1} onClick={() => toggleDetail(batch, detail.page - 1)}>上一页</button>
                                  <button type="button" disabled={detail.page >= detailPages} onClick={() => toggleDetail(batch, detail.page + 1)}>下一页</button>
                                </div>
                                <table className="import-record-table">
                                  <thead><tr><th>账务时间</th><th>账务类型</th><th>币种</th><th>收支金额</th><th>类别</th><th>备注</th></tr></thead>
                                  <tbody>{detail.records.map((item) => <tr key={item.id}><td>{item.transactionTime}</td><td>{item.transactionType}</td><td>{item.currency}</td><td>¥ {formatMoney(item.amount)}</td><td>{item.category}</td><td>{item.remark || '-'}</td></tr>)}</tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {batches.length === 0 && <div className="import-record-empty">暂无符合条件的财务导入批次。</div>}
        </div>
        <footer className="import-pagination">
          <button type="button" disabled={page <= 1 || loading} onClick={() => refresh(page - 1)}>上一页</button>
          <span>共 {total} 条</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => refresh(page + 1)}>下一页</button>
        </footer>
      </article>

      {deleteBatch && (
        <ConfirmDeleteModal title="确认删除该财务导入批次吗？" description="删除后该批次明细不会再参与运营工资统计。" onCancel={() => setDeleteBatch(null)} onConfirm={deleteSelectedBatch}>
          <span>文件名：{deleteBatch.fileName}</span>
          <span>平台：{deleteBatch.platform}</span>
          <span>店铺：{deleteBatch.storeName || deleteBatch.storeId}</span>
          <span>月份：{deleteBatch.period}</span>
          <span>明细数：{deleteBatch.successRows}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}

export default FinancialDetailImportPage;
