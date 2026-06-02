import * as XLSX from 'xlsx';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { salaryFinancialDataSource } from '../../../data-source/salaryFinancialDataSource';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import { storeDataSource } from '../../../data-source/storeDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { EmployeeRecord, OperatorSalaryStatisticRow, OperatorSalaryStoreDetail, SalaryPeriodRecord } from '../../../types/salary';
import type { StoreRecord } from '../../../types/store';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function ratioText(amount: number, inflowAmount: number) {
  if (inflowAmount === 0) {
    return '无流入金额';
  }

  return `${((amount / inflowAmount) * 100).toFixed(2)}%`;
}

function ratioFormula(amount: number, inflowAmount: number) {
  return `¥ ${formatMoney(amount)} ÷ ¥ ${formatMoney(inflowAmount)}`;
}

function promotionFeeRatioText(inflowAmount: number, promotionServiceFee: number) {
  return ratioText(promotionServiceFee, inflowAmount);
}

function shortDataStatus(warnings: string[], fallback: string) {
  if (warnings.some((warning) => warning.includes('基本工资'))) return '缺底薪';
  if (warnings.some((warning) => warning.includes('未绑定'))) return '未绑定';
  if (warnings.some((warning) => warning.includes('部分店铺'))) return '部分缺失';
  if (warnings.some((warning) => warning.includes('暂无财务数据'))) return '无数据';
  if (warnings.some((warning) => warning.includes('无结算金额'))) return '无结算';
  if (warnings.some((warning) => warning.includes('未识别支出') || warning.includes('其他支出'))) return '含其他';
  return fallback && fallback !== '已计算' ? fallback : '正常';
}

function fullDataStatus(warnings: string[], fallback: string) {
  return warnings.length > 0 ? warnings.join('；') : fallback || '已计算';
}

function isTemuOperatorEmployee(employee: EmployeeRecord) {
  const departmentName = String(employee.departmentName ?? '').trim().toUpperCase();
  const sourceFields = employee.sourceFields as Record<string, unknown> | undefined;
  const platformText = String(sourceFields?.平台 ?? sourceFields?.店铺平台 ?? '').trim().toUpperCase();
  return departmentName.includes('TEMU') || platformText === 'TEMU';
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function OperatorSalaryStatisticsPage({ currentUser }: { currentUser: CurrentUser }) {
  const [period, setPeriod] = useState(currentMonth());
  const [operatorId, setOperatorId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [rows, setRows] = useState<OperatorSalaryStatisticRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [expandedStoreDetailIds, setExpandedStoreDetailIds] = useState<string[]>([]);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<{ row: OperatorSalaryStatisticRow; detail: OperatorSalaryStoreDetail } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const isAdmin = currentUser.role === 'admin';

  async function refresh() {
    setLoading(true);
    try {
      const data = await salaryFinancialDataSource.loadOperatorSalaryStatistics({ period, operatorId, storeId });
      setRows(data.records);
      setExpandedIds([]);
      setExpandedStoreDetailIds([]);
      setSelectedStoreDetail(null);
      setMessage(data.records.some((row) => row.warnings.includes('当前核算仅统计 CNY。')) ? '当前核算仅统计 CNY。' : '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '运营工资统计读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    salaryDataSource.loadEmployees().then((next) => setEmployees(next.filter((employee) => employee.employeeType === 'operator' && employee.status !== 'inactive' && isTemuOperatorEmployee(employee))));
    salaryDataSource.loadPeriods().then(setPeriods);
    setStores(storeDataSource.load());
  }, []);

  useEffect(() => {
    void refresh();
  }, [period, operatorId, storeId]);

  const periodOptions = useMemo(() => unique([currentMonth(), ...periods.map((item) => item.periodKey).filter(Boolean)]).sort().reverse(), [periods]);

  const summary = useMemo(() => rows.reduce((total, row) => ({
    inflowAmount: total.inflowAmount + row.inflowAmount,
    expenseAmount: total.expenseAmount + row.expenseAmount,
    operationExpenseAmount: total.operationExpenseAmount + row.operationExpenseAmount,
    netSalesAmount: total.netSalesAmount + row.netSalesAmount,
    commissionAmount: total.commissionAmount + row.commissionAmount,
    payableSalary: total.payableSalary + row.payableSalary,
  }), {
    inflowAmount: 0,
    expenseAmount: 0,
    operationExpenseAmount: 0,
    netSalesAmount: 0,
    commissionAmount: 0,
    payableSalary: 0,
  }), [rows]);

  function toggleExpanded(rowId: string) {
    setExpandedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  }

  function toggleStoreDetail(detailId: string) {
    setExpandedStoreDetailIds((current) => current.includes(detailId) ? current.filter((id) => id !== detailId) : [...current, detailId]);
  }

  function exportExcel() {
    const summarySheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      工资周期: row.period,
      运营姓名: row.operatorName,
      负责店铺: row.storeNames.join('、') || '-',
      基本工资: row.baseSalary,
      流入金额: row.inflowAmount,
      流出金额: row.expenseAmount,
      推广服务费: row.promotionServiceFee,
      售后问题: row.afterSalesProtectionFee,
      仓储服务费: row.storageServiceFee,
      合规EPR: row.eprFee,
      其他支出: row.otherExpense,
      提现金额: row.withdrawAmount,
      运营支出: row.operationExpenseAmount,
      净销售额: row.netSalesAmount,
      运营提成: row.commissionAmount,
      应发工资: row.payableSalary,
      数据状态: row.dataStatus,
    })));
    const storeSheet = XLSX.utils.json_to_sheet(rows.flatMap((row) => row.storeDetails.map((detail) => ({
      工资周期: row.period,
      运营姓名: row.operatorName,
      店铺名称: detail.storeName || detail.storeId,
      平台: detail.platform,
      流入金额: detail.inflowAmount,
      流出金额: detail.expenseAmount,
      推广服务费: detail.promotionServiceFee,
      售后问题: detail.afterSalesProtectionFee,
      仓储服务费: detail.storageServiceFee,
      合规EPR: detail.eprFee,
      其他支出: detail.otherExpense,
      提现金额: detail.withdrawAmount,
      运营支出: detail.operationExpenseAmount,
      店铺净销售额: detail.netSalesAmount,
      推广服务费占比: promotionFeeRatioText(detail.inflowAmount, detail.promotionServiceFee),
      售后费用占比: ratioText(detail.afterSalesProtectionFee, detail.inflowAmount),
      仓储费用占比: ratioText(detail.storageServiceFee, detail.inflowAmount),
      运营支出占比: ratioText(detail.operationExpenseAmount, detail.inflowAmount),
      店铺提成比例: formatRate(detail.commissionRate),
      店铺提成金额: detail.commissionAmount,
      数据状态: detail.dataStatus,
    }))));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summarySheet, '运营工资汇总');
    XLSX.utils.book_append_sheet(workbook, storeSheet, '店铺提成明细');
    XLSX.writeFile(workbook, `运营工资统计-${period || '全部'}.xlsx`);
  }

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>流入金额</span><strong>¥ {formatMoney(summary.inflowAmount)}</strong></article>
        <article><span>流出金额</span><strong>¥ {formatMoney(summary.expenseAmount)}</strong></article>
        <article><span>运营支出</span><strong>¥ {formatMoney(summary.operationExpenseAmount)}</strong></article>
        <article><span>净销售额</span><strong>¥ {formatMoney(summary.netSalesAmount)}</strong></article>
        <article><span>运营提成</span><strong>¥ {formatMoney(summary.commissionAmount)}</strong></article>
        <article><span>应发工资</span><strong>¥ {formatMoney(summary.payableSalary)}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>运营工资统计</h2>
            <p>每个店铺按自己的净销售额匹配阶梯比例，运营提成为负责店铺提成金额合计。</p>
          </div>
          <span>{loading ? '计算中...' : `${rows.length} 位运营`}</span>
        </header>
        <section className="operator-form-grid salary-stat-filter-grid">
          <label>
            工资周期
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {periodOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            运营
            <select value={operatorId} disabled={!isAdmin} onChange={(event) => setOperatorId(event.target.value)}>
              <option value="">{isAdmin ? '全部运营' : '仅本人'}</option>
              {employees.map((employee) => <option key={employee.id} value={employee.operatorId || employee.id}>{employee.employeeName}</option>)}
            </select>
          </label>
          <label>
            店铺
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">全部店铺</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}
            </select>
          </label>
          <button type="button" onClick={refresh}>手动刷新统计</button>
          <button type="button" onClick={exportExcel} disabled={rows.length === 0}>导出 Excel</button>
        </section>
        {message && <div className="salary-stat-message">{message}</div>}
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>运营汇总</h2>
            <p>主表按运营展示；店铺提成比例和提成金额在展开明细中查看。</p>
          </div>
        </header>
        <div className="import-record-table-wrap salary-stat-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>工资周期</th>
                <th>运营姓名</th>
                <th>负责店铺</th>
                <th>基本工资</th>
                <th>流入金额</th>
                <th>流出金额</th>
                <th>推广服务费</th>
                <th>售后问题</th>
                <th>仓储服务费</th>
                <th>合规EPR</th>
                <th>其他支出</th>
                <th>提现金额</th>
                <th>运营支出</th>
                <th>净销售额</th>
                <th>运营提成</th>
                <th>应发工资</th>
                <th>数据状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedIds.includes(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.period || period}</td>
                      <td><strong>{row.operatorName}</strong></td>
                      <td>
                        {row.storeDetails.length > 0 ? (
                          <div className="salary-store-tag-list">
                            {row.storeDetails.map((detail) => (
                              <button
                                className="salary-store-tag"
                                key={`${row.id}-${detail.storeId}`}
                                type="button"
                                title={fullDataStatus(detail.warnings, detail.dataStatus)}
                                onClick={() => setSelectedStoreDetail({ row, detail })}
                              >
                                {detail.storeName || detail.storeId}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="salary-store-unbound">未绑定店铺</span>
                        )}
                      </td>
                      <td>¥ {formatMoney(row.baseSalary)}</td>
                      <td>¥ {formatMoney(row.inflowAmount)}</td>
                      <td>¥ {formatMoney(row.expenseAmount)}</td>
                      <td>¥ {formatMoney(row.promotionServiceFee)}</td>
                      <td>¥ {formatMoney(row.afterSalesProtectionFee)}</td>
                      <td>¥ {formatMoney(row.storageServiceFee)}</td>
                      <td>¥ {formatMoney(row.eprFee)}</td>
                      <td>¥ {formatMoney(row.otherExpense)}</td>
                      <td><strong>¥ {formatMoney(row.withdrawAmount)}</strong><span className="import-file-name">不计入运营支出</span></td>
                      <td>¥ {formatMoney(row.operationExpenseAmount)}</td>
                      <td>¥ {formatMoney(row.netSalesAmount)}</td>
                      <td>¥ {formatMoney(row.commissionAmount)}</td>
                      <td><strong>¥ {formatMoney(row.payableSalary)}</strong></td>
                      <td><span className={`admin-status ${row.warnings.length > 0 ? 'salary-status-warning' : 'salary-status-ok'}`} title={fullDataStatus(row.warnings, row.dataStatus)}>{shortDataStatus(row.warnings, row.dataStatus)}</span></td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={18}>
                          <div className="import-detail-panel salary-store-detail-panel">
                            <div className="import-detail-toolbar">
                              <strong>店铺财务统计模块</strong>
                              <span>{row.storeDetails.length} 个店铺</span>
                            </div>
                            <div className="salary-store-module-grid">
                              {row.storeDetails.map((detail) => {
                                const storeDetailKey = `${row.id}-${detail.storeId}`;
                                const expenseDetailExpanded = expandedStoreDetailIds.includes(storeDetailKey);
                                return (
                                <section className="salary-store-module" key={storeDetailKey}>
                                  <header>
                                    <div>
                                      <strong>{detail.storeName || detail.storeId}</strong>
                                      <span>{detail.platform} / {detail.period || row.period || period}</span>
                                    </div>
                                    <div className="salary-store-header-actions">
                                      <span className={`admin-status ${detail.warnings.length > 0 ? 'salary-status-warning' : 'salary-status-ok'}`} title={fullDataStatus(detail.warnings, detail.dataStatus)}>{shortDataStatus(detail.warnings, detail.dataStatus)}</span>
                                      <button type="button" onClick={() => toggleStoreDetail(storeDetailKey)}>{expenseDetailExpanded ? '收起支出明细' : '展开支出明细'}</button>
                                    </div>
                                  </header>
                                  <p className="salary-store-note">店铺提成按单店净销售额匹配阶梯比例；提现仅展示，不计入运营支出。</p>
                                  <div className="salary-calc-chain" aria-label="店铺工资计算链路">
                                    <div className="salary-calc-node">
                                      <span>流入金额</span>
                                      <strong>¥ {formatMoney(detail.inflowAmount)}</strong>
                                      <em>结算金额合计</em>
                                    </div>
                                    <b>减</b>
                                    <div className="salary-calc-node">
                                      <span>运营支出</span>
                                      <strong>¥ {formatMoney(detail.operationExpenseAmount)}</strong>
                                      <em>不含提现</em>
                                    </div>
                                    <b>等于</b>
                                    <div className="salary-calc-node salary-calc-node-highlight">
                                      <span>店铺净销售额</span>
                                      <strong>¥ {formatMoney(detail.netSalesAmount)}</strong>
                                      <em>流入金额 - 运营支出</em>
                                    </div>
                                    <b>乘以</b>
                                    <div className="salary-calc-node">
                                      <span>店铺提成比例</span>
                                      <strong>{formatRate(detail.commissionRate)}</strong>
                                      <em>按单店净销售额匹配阶梯</em>
                                    </div>
                                    <b>等于</b>
                                    <div className="salary-calc-node salary-calc-node-highlight">
                                      <span>店铺提成金额</span>
                                      <strong>¥ {formatMoney(detail.commissionAmount)}</strong>
                                      <em>净销售额 × 提成比例</em>
                                    </div>
                                  </div>
                                  {expenseDetailExpanded && <section className="salary-store-section">
                                    <h4>运营支出明细</h4>
                                    <div className="salary-expense-table-wrap">
                                      <table className="salary-expense-table">
                                        <thead>
                                          <tr>
                                            <th>支出项目</th>
                                            <th>金额</th>
                                            <th>是否计入运营支出</th>
                                            <th>说明</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {[
                                            { name: '推广服务费', amount: detail.promotionServiceFee, included: true, note: '推广相关费用，计入运营支出' },
                                            { name: '售后问题费用', amount: detail.afterSalesProtectionFee, included: true, note: '消费者及履约保障-售后问题' },
                                            { name: '仓储服务费', amount: detail.storageServiceFee, included: true, note: '仓储综合服务费' },
                                            { name: '合规EPR费用', amount: detail.eprFee, included: true, note: '合规EPR物流包装环保费' },
                                            { name: '其他支出', amount: detail.otherExpense, included: true, note: '未识别支出，已计入其他支出' },
                                            { name: '提现金额', amount: detail.withdrawAmount, included: false, note: '提现仅展示，不计入运营支出，不影响提成。' },
                                          ].map((item) => (
                                            <tr key={item.name} className={item.included ? undefined : 'salary-expense-muted-row'}>
                                              <td>{item.name}</td>
                                              <td>¥ {formatMoney(item.amount)}</td>
                                              <td><span className={item.included ? 'salary-expense-included' : 'salary-expense-excluded'}>{item.included ? '计入' : '不计入'}</span></td>
                                              <td>{item.note}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </section>}
                                  <section className="salary-store-section">
                                    <h4>费用占比分析</h4>
                                    <div className="salary-ratio-list">
                                      {[
                                        { name: '推广费占比', amount: detail.promotionServiceFee, result: ratioText(detail.promotionServiceFee, detail.inflowAmount), highlight: true },
                                        { name: '售后费用占比', amount: detail.afterSalesProtectionFee, result: ratioText(detail.afterSalesProtectionFee, detail.inflowAmount), highlight: false },
                                        { name: '仓储费用占比', amount: detail.storageServiceFee, result: ratioText(detail.storageServiceFee, detail.inflowAmount), highlight: false },
                                        { name: '运营支出占比', amount: detail.operationExpenseAmount, result: ratioText(detail.operationExpenseAmount, detail.inflowAmount), highlight: true },
                                      ].map((item) => (
                                        <div className={item.highlight ? 'salary-ratio-item salary-ratio-item-highlight' : 'salary-ratio-item'} key={item.name}>
                                          <span>{item.name}</span>
                                          <strong>{ratioFormula(item.amount, detail.inflowAmount)} = {item.result}</strong>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                </section>
                              )})}
                            </div>
                            {row.storeDetails.length === 0 && <div className="import-record-empty">该运营未绑定负责店铺。</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="import-record-empty">暂无运营工资统计数据。</div>}
        </div>
      </article>

      {selectedStoreDetail && (
        <div className="salary-store-modal-backdrop" role="presentation" onClick={() => setSelectedStoreDetail(null)}>
          <section className="salary-store-modal" role="dialog" aria-modal="true" aria-label={`店铺明细：${selectedStoreDetail.detail.storeName || selectedStoreDetail.detail.storeId}`} onClick={(event) => event.stopPropagation()}>
            <header className="salary-store-modal-header">
              <div>
                <h2>店铺明细：{selectedStoreDetail.detail.storeName || selectedStoreDetail.detail.storeId}</h2>
                <p>{selectedStoreDetail.detail.platform} / {selectedStoreDetail.detail.period || selectedStoreDetail.row.period || period} / 负责人：{selectedStoreDetail.row.operatorName}</p>
              </div>
              <button type="button" aria-label="关闭店铺明细" onClick={() => setSelectedStoreDetail(null)}>×</button>
            </header>
            <div className="salary-store-modal-body">
              <section className="salary-store-basic-grid">
                <span>店铺名称<strong>{selectedStoreDetail.detail.storeName || selectedStoreDetail.detail.storeId}</strong></span>
                <span>平台<strong>{selectedStoreDetail.detail.platform}</strong></span>
                <span>工资周期<strong>{selectedStoreDetail.detail.period || selectedStoreDetail.row.period || period}</strong></span>
                <span>负责人<strong>{selectedStoreDetail.row.operatorName}</strong></span>
                <span>数据状态<strong className={selectedStoreDetail.detail.warnings.length > 0 ? 'salary-modal-warning' : 'salary-modal-ok'} title={fullDataStatus(selectedStoreDetail.detail.warnings, selectedStoreDetail.detail.dataStatus)}>{shortDataStatus(selectedStoreDetail.detail.warnings, selectedStoreDetail.detail.dataStatus)}</strong></span>
              </section>
              {selectedStoreDetail.detail.warnings.length > 0 && (
                <div className="salary-store-modal-alert">
                  {selectedStoreDetail.detail.warnings.map((warning) => <span key={warning}>{warning}</span>)}
                </div>
              )}
              <p className="salary-store-note">店铺提成按单店净销售额匹配阶梯比例；提现仅展示，不计入运营支出。</p>
              <div className="salary-calc-chain" aria-label="店铺工资计算链路">
                <div className="salary-calc-node">
                  <span>流入金额</span>
                  <strong>¥ {formatMoney(selectedStoreDetail.detail.inflowAmount)}</strong>
                  <em>结算金额合计</em>
                </div>
                <b>减</b>
                <div className="salary-calc-node">
                  <span>运营支出</span>
                  <strong>¥ {formatMoney(selectedStoreDetail.detail.operationExpenseAmount)}</strong>
                  <em>不含提现</em>
                </div>
                <b>等于</b>
                <div className="salary-calc-node salary-calc-node-highlight">
                  <span>店铺净销售额</span>
                  <strong>¥ {formatMoney(selectedStoreDetail.detail.netSalesAmount)}</strong>
                  <em>流入金额 - 运营支出</em>
                </div>
                <b>乘以</b>
                <div className="salary-calc-node">
                  <span>店铺提成比例</span>
                  <strong>{formatRate(selectedStoreDetail.detail.commissionRate)}</strong>
                  <em>按单店净销售额匹配阶梯</em>
                </div>
                <b>等于</b>
                <div className="salary-calc-node salary-calc-node-highlight">
                  <span>店铺提成金额</span>
                  <strong>¥ {formatMoney(selectedStoreDetail.detail.commissionAmount)}</strong>
                  <em>净销售额 × 提成比例</em>
                </div>
              </div>
              <section className="salary-store-section">
                <h4>运营支出明细</h4>
                <div className="salary-expense-table-wrap">
                  <table className="salary-expense-table">
                    <thead>
                      <tr>
                        <th>支出项目</th>
                        <th>金额</th>
                        <th>是否计入运营支出</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: '推广服务费', amount: selectedStoreDetail.detail.promotionServiceFee, included: true, note: '推广相关费用，计入运营支出' },
                        { name: '售后问题费用', amount: selectedStoreDetail.detail.afterSalesProtectionFee, included: true, note: '消费者及履约保障-售后问题' },
                        { name: '仓储服务费', amount: selectedStoreDetail.detail.storageServiceFee, included: true, note: '仓储综合服务费' },
                        { name: '合规EPR费用', amount: selectedStoreDetail.detail.eprFee, included: true, note: '合规EPR物流包装环保费' },
                        { name: '其他支出', amount: selectedStoreDetail.detail.otherExpense, included: true, note: '未识别支出，已计入其他支出' },
                        { name: '提现金额', amount: selectedStoreDetail.detail.withdrawAmount, included: false, note: '提现仅展示，不计入运营支出，不影响提成。' },
                      ].map((item) => (
                        <tr key={item.name} className={item.included ? undefined : 'salary-expense-muted-row'}>
                          <td>{item.name}</td>
                          <td>¥ {formatMoney(item.amount)}</td>
                          <td><span className={item.included ? 'salary-expense-included' : 'salary-expense-excluded'}>{item.included ? '计入' : '不计入'}</span></td>
                          <td>{item.note}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="salary-expense-total-outflow-row">
                        <td>流出金额总计</td>
                        <td>¥ {formatMoney(selectedStoreDetail.detail.expenseAmount)}</td>
                        <td>-</td>
                        <td>包含各项支出和提现；提现仅展示，不计入运营支出。</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
              <section className="salary-store-section">
                <h4>费用占比分析</h4>
                <div className="salary-ratio-list">
                  {[
                    { name: '推广费占比', amount: selectedStoreDetail.detail.promotionServiceFee, result: ratioText(selectedStoreDetail.detail.promotionServiceFee, selectedStoreDetail.detail.inflowAmount), highlight: true },
                    { name: '售后费用占比', amount: selectedStoreDetail.detail.afterSalesProtectionFee, result: ratioText(selectedStoreDetail.detail.afterSalesProtectionFee, selectedStoreDetail.detail.inflowAmount), highlight: false },
                    { name: '仓储费用占比', amount: selectedStoreDetail.detail.storageServiceFee, result: ratioText(selectedStoreDetail.detail.storageServiceFee, selectedStoreDetail.detail.inflowAmount), highlight: false },
                    { name: '运营支出占比', amount: selectedStoreDetail.detail.operationExpenseAmount, result: ratioText(selectedStoreDetail.detail.operationExpenseAmount, selectedStoreDetail.detail.inflowAmount), highlight: true },
                  ].map((item) => (
                    <div className={item.highlight ? 'salary-ratio-item salary-ratio-item-highlight' : 'salary-ratio-item'} key={item.name}>
                      <span>{item.name}</span>
                      <strong>{ratioFormula(item.amount, selectedStoreDetail.detail.inflowAmount)} = {item.result}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default OperatorSalaryStatisticsPage;
