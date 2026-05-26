import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { EmployeeRecord, PieceworkRecord, SalaryItem, SalaryPeriodRecord, SalaryRecord } from '../../../types/salary';

const statusLabels: Record<PieceworkRecord['status'], string> = {
  normal: '正常',
  unmatched_employee: '未匹配员工',
  invalid_quantity: '数量异常',
  invalid_price: '单价异常',
};

const statusStyles: Partial<Record<PieceworkRecord['status'], React.CSSProperties>> = {
  normal: { borderColor: 'rgba(74, 222, 128, 0.6)', color: '#86efac' },
  unmatched_employee: { borderColor: 'rgba(248, 113, 113, 0.7)', color: '#fca5a5' },
  invalid_quantity: { borderColor: 'rgba(251, 146, 60, 0.7)', color: '#fdba74' },
  invalid_price: { borderColor: 'rgba(251, 191, 36, 0.7)', color: '#fde68a' },
};

const headerAliases: Record<string, string[]> = {
  employeeName: ['姓名', '员工姓名', 'employeeName', 'employee_name'],
  workDate: ['日期', '工作日期', '计件日期', 'workDate', 'work_date'],
  unitPrice: ['单价', '计件单价', 'unitPrice', 'unit_price'],
  quantity: ['数量', '件数', '计件数量', 'quantity'],
  amount: ['金额', '合计', 'dailyAmount', 'amount'],
};

function toText(value: unknown) {
  return String(value ?? '').trim();
}

function toKey(value: unknown) {
  return toText(value).replace(/\s+/g, '').toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const normalized = toText(value).replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: unknown) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  const text = toText(value).replace(/\//g, '-').replace(/\./g, '-');
  const chineseMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chineseMatch) return `${chineseMatch[1]}-${chineseMatch[2].padStart(2, '0')}-${chineseMatch[3].padStart(2, '0')}`;

  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return text;
}

function findHeaderRow(rows: unknown[][]) {
  return rows.slice(0, 10).findIndex((row) => {
    const keys = row.map(toKey);
    return keys.some((key) => headerAliases.quantity.map(toKey).includes(key))
      && keys.some((key) => headerAliases.unitPrice.map(toKey).includes(key));
  });
}

function buildColumnMap(headerRow: unknown[]) {
  const columnMap: Record<string, number> = {};
  const normalizedHeaders = headerRow.map(toKey);

  Object.entries(headerAliases).forEach(([field, aliases]) => {
    const index = normalizedHeaders.findIndex((header) => aliases.map(toKey).includes(header));
    if (index >= 0) columnMap[field] = index;
  });

  return columnMap;
}

function getCell(row: unknown[], columnMap: Record<string, number>, field: string) {
  const index = columnMap[field];
  return index === undefined ? '' : row[index];
}

function getAmount(record: PieceworkRecord) {
  return record.amount ?? record.dailyAmount ?? 0;
}

function recordKey(record: Pick<PieceworkRecord, 'employeeName' | 'workDate' | 'unitPrice' | 'quantity' | 'amount'>) {
  return [record.employeeName, record.workDate, record.unitPrice, record.quantity, getAmount(record as PieceworkRecord)].join('|');
}

function buildRecordStatus(employee: EmployeeRecord | undefined, quantity: number, unitPrice: number): PieceworkRecord['status'] {
  if (!employee) return 'unmatched_employee';
  if (!(quantity > 0)) return 'invalid_quantity';
  if (!(unitPrice > 0)) return 'invalid_price';
  return 'normal';
}

function parseWorkbook(file: File, rows: unknown[][], employees: EmployeeRecord[], period?: SalaryPeriodRecord, sheetName?: string) {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) {
    return { records: [] as PieceworkRecord[], headerRowIndex, headers: [] as string[], rowCount: 0 };
  }

  const columnMap = buildColumnMap(rows[headerRowIndex] ?? []);
  const employeesByName = new Map(employees.filter((item) => item.employeeName).map((item) => [item.employeeName, item]));
  const batchId = `piecework-${period?.id || 'no-period'}-${Date.now()}`;
  const now = new Date().toISOString();

  const records = rows.slice(headerRowIndex + 1).reduce<PieceworkRecord[]>((next, row, index) => {
    const employeeName = toText(getCell(row, columnMap, 'employeeName'));
    const workDate = formatDate(getCell(row, columnMap, 'workDate'));
    const unitPrice = toNumber(getCell(row, columnMap, 'unitPrice'));
    const quantity = toNumber(getCell(row, columnMap, 'quantity'));
    const amount = toNumber(getCell(row, columnMap, 'amount')) || Number((quantity * unitPrice).toFixed(2));

    if (!employeeName) return next;

    const employee = employeesByName.get(employeeName);
    next.push({
      id: `piecework-${Date.now()}-${index}`,
      batchId,
      payrollPeriodId: period?.id,
      employeeId: employee?.id,
      employeeName: employee?.employeeName || employeeName,
      workDate,
      unitPrice,
      quantity,
      amount,
      employeeCode: employee?.employeeCode,
      status: buildRecordStatus(employee, quantity, unitPrice),
      createdAt: now,
    });
    return next;
  }, []);

  return {
    records,
    headerRowIndex,
    headers: Object.keys(columnMap),
    rowCount: records.length,
    sheetName,
  };
}

function displaySheetName(name: string) {
  return !name || /^worksheet$/i.test(name) ? '工作表1' : name;
}

function PieceworkImportPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [records, setRecords] = useState<PieceworkRecord[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [previewRecords, setPreviewRecords] = useState<PieceworkRecord[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState('请先选择工资周期，再上传计件工资 Excel。');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = () => {
    salaryDataSource.loadEmployees().then(setEmployees);
    salaryDataSource.loadPeriods().then((next) => {
      setPeriods(next);
      setPeriodId((current) => current || next[0]?.id || '');
    });
    salaryDataSource.loadPieceworkRecords().then(setRecords);
    salaryDataSource.loadSalaryItems().then(setSalaryItems);
    salaryDataSource.loadSalaryRecords().then(setSalaryRecords);
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPeriod = periods.find((period) => period.id === periodId);
  const existingKeys = useMemo(() => new Set(records.map(recordKey)), [records]);
  const duplicateCount = previewRecords.filter((record) => existingKeys.has(recordKey(record))).length;
  const abnormalCount = previewRecords.filter((record) => record.status !== 'normal').length;
  const previewAmount = previewRecords.reduce((total, record) => total + getAmount(record), 0);
  const designPieceworkItem = salaryItems.find((item) => item.code === 'DESIGN_PIECEWORK') ?? salaryItems.find((item) => item.itemType === 'piecework');
  const salaryRecordSourceIds = useMemo(() => new Set(salaryRecords.map((record) => record.sourceId).filter(Boolean)), [salaryRecords]);

  const filteredPreview = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return previewRecords.filter((record) => {
      const matchesKeyword = !keyword || [
        record.employeeName,
        record.workDate,
      ].some((value) => toText(value).toLowerCase().includes(keyword));

      return matchesKeyword && (!statusFilter || record.status === statusFilter);
    });
  }, [previewRecords, searchText, statusFilter]);

  const importPiecework = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const nextSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[nextSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const parsed = parseWorkbook(file, rows, employees, selectedPeriod, nextSheetName);

    setSheetName(displaySheetName(nextSheetName));
    setDetectedHeaders(parsed.headers);
    setPreviewRecords(parsed.records);
    setMessage(`识别${displaySheetName(nextSheetName)}，表头行 ${parsed.headerRowIndex + 1 || '-'}，生成 ${parsed.rowCount} 条计件记录预览。`);
  };

  const savePreview = () => {
    if (previewRecords.length === 0) {
      setMessage('暂无可保存的计件记录。');
      return;
    }

    const previewKeys = new Set(previewRecords.map(recordKey));
    const nextRecords = [
      ...records.filter((record) => !previewKeys.has(recordKey(record))),
      ...previewRecords,
    ];

    salaryDataSource.savePieceworkRecords(nextRecords);
    setRecords(nextRecords);
    setMessage(`已保存 ${previewRecords.length} 条计件记录，覆盖同日期同姓名同单价同数量记录 ${duplicateCount} 条。本页不生成工资单。`);
  };

  const createSalaryRecords = () => {
    if (!selectedPeriod) {
      setMessage('请先选择工资周期，再生成工资记录。');
      return;
    }

    if (!designPieceworkItem) {
      setMessage('未找到产品设计计件工资项目，请先确认 salary-items.json。');
      return;
    }

    const now = new Date().toISOString();
    const nextSalaryRecords = records
      .filter((record) => record.status === 'normal' && record.employeeId && !salaryRecordSourceIds.has(record.id))
      .map<SalaryRecord>((record) => ({
        id: `salary-record-design-piecework-${Date.now()}-${record.id}`,
        employeeId: record.employeeId || '',
        payrollPeriodId: record.payrollPeriodId || selectedPeriod.id,
        salaryItemId: designPieceworkItem.id,
        sourceType: 'design_piecework',
        sourceId: record.id,
        amount: getAmount(record),
        quantity: record.quantity,
        unitPrice: record.unitPrice,
        status: 'draft',
        remark: '由设计计件导入记录生成',
        createdAt: now,
        updatedAt: now,
      }));

    if (nextSalaryRecords.length === 0) {
      setMessage('没有可生成的工资记录：仅转换正常、已匹配员工且未生成过的计件记录。');
      return;
    }

    const nextRecords = [...salaryRecords, ...nextSalaryRecords];
    salaryDataSource.saveSalaryRecords(nextRecords);
    setSalaryRecords(nextRecords);
    setMessage(`已生成 ${nextSalaryRecords.length} 条工资记录，进入 SalaryRecord 主表。`);
  };

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>预览记录</span><strong>{previewRecords.length}</strong></article>
        <article><span>异常记录</span><strong>{abnormalCount}</strong></article>
        <article><span>重复覆盖</span><strong>{duplicateCount}</strong></article>
        <article><span>预览金额</span><strong>{previewAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>计件工资导入 V1</h2>
            <p>按上传表格字段导入：日期、姓名、单价、数量、金额；暂不生成工资记录主表或工资单。</p>
          </div>
          <label className="excel-clear-button primary-action">
            上传计件 Excel
            <input type="file" accept=".xlsx,.xls" onChange={importPiecework} style={{ display: 'none' }} />
          </label>
        </header>

        <div className="operator-form-grid">
          <label>
            工资周期
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">不绑定周期</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>{period.periodKey}（{period.startDate} 至 {period.endDate}）</option>
              ))}
            </select>
          </label>
          <label>
            工作表
            <input value={sheetName || '-'} readOnly />
          </label>
          <label className="operator-form-wide">
            识别字段
            <input value={detectedHeaders.length ? detectedHeaders.join(' / ') : '上传后显示识别字段'} readOnly />
          </label>
          <button className="excel-clear-button primary-action" type="button" onClick={savePreview}>保存计件记录</button>
        </div>
        <div className="import-record-empty" style={{ textAlign: 'left' }}>{message}</div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>字段识别规则</h2>
            <p>V1 按设计计件表读取，员工优先按姓名匹配，空姓名行会自动跳过。</p>
          </div>
        </header>
        <section className="salary-plan-grid">
          <article><strong>必填字段</strong><span>日期 / 姓名 / 单价 / 数量 / 金额。</span></article>
          <article><strong>员工匹配</strong><span>按姓名匹配员工档案，匹配不到标记异常。</span></article>
          <article><strong>金额口径</strong><span>优先读取金额列，缺失时按数量 × 单价兜底。</span></article>
          <article><strong>异常标记</strong><span>未匹配员工、数量异常、单价异常。</span></article>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>计件记录预览</h2>
            <p>保存后写入 piecework-records.json，后续再由工资汇总生成 SalaryRecord。</p>
          </div>
          <span>{filteredPreview.length} 条</span>
        </header>

        <section className="import-filter-bar">
          <input placeholder="搜索姓名 / 日期" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </section>

        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>日期</th>
                <th>姓名</th>
                <th style={{ textAlign: 'right' }}>单价</th>
                <th style={{ textAlign: 'right' }}>数量</th>
                <th style={{ textAlign: 'right' }}>金额</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredPreview.slice(0, 300).map((record) => (
                <tr key={record.id}>
                  <td>{record.workDate || '-'}</td>
                  <td><strong>{record.employeeName || '-'}</strong></td>
                  <td style={{ textAlign: 'right' }}>{record.unitPrice}</td>
                  <td style={{ textAlign: 'right' }}>{record.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{getAmount(record)}</td>
                  <td><span className="admin-status" style={statusStyles[record.status]}>{statusLabels[record.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPreview.length > 300 && <div className="import-record-empty">仅展示前 300 条，保存时会保存全部预览记录。</div>}
          {filteredPreview.length === 0 && <div className="import-record-empty">暂无计件记录预览。</div>}
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>已保存计件记录</h2>
            <p>展示已写入 piecework-records.json 的最近记录，便于确认导入结果。</p>
          </div>
          <button className="excel-clear-button primary-action" type="button" onClick={createSalaryRecords}>
            生成工资记录
          </button>
        </header>

        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>日期</th>
                <th>姓名</th>
                <th style={{ textAlign: 'right' }}>单价</th>
                <th style={{ textAlign: 'right' }}>数量</th>
                <th style={{ textAlign: 'right' }}>金额</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(-300).reverse().map((record) => (
                <tr key={record.id}>
                  <td>{record.workDate || '-'}</td>
                  <td><strong>{record.employeeName || '-'}</strong></td>
                  <td style={{ textAlign: 'right' }}>{record.unitPrice}</td>
                  <td style={{ textAlign: 'right' }}>{record.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{getAmount(record)}</td>
                  <td><span className="admin-status" style={statusStyles[record.status]}>{statusLabels[record.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length > 300 && <div className="import-record-empty">仅展示最近 300 条已保存记录。</div>}
          {records.length === 0 && <div className="import-record-empty">暂无已保存计件记录。</div>}
        </div>
      </article>
    </section>
  );
}

export default PieceworkImportPage;
