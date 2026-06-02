import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { AttendanceRecord, AttendanceRule, EmployeeRecord, EmployeeType, SalaryPeriodRecord } from '../../../types/salary';

const employeeTypeLabels: Record<EmployeeType, string> = {
  monthly: '月薪员工',
  hourly: '计时员工',
  piecework: '计件员工',
  operator: '运营',
  manager: '管理人员',
};

const statusLabels: Record<AttendanceRecord['status'], string> = {
  normal: '正常',
  unmatched_employee: '未匹配员工',
  missing_time: '缺少时间',
  invalid: '无效记录',
  missing_hourly_rate: '计时员工无时薪',
  missing_clock: '缺卡',
  no_punch: '无打卡',
  invalid_hours: '工时异常',
  absence: '缺勤',
};

const statusStyles: Partial<Record<AttendanceRecord['status'], React.CSSProperties>> = {
  normal: { borderColor: 'rgba(74, 222, 128, 0.6)', color: '#86efac' },
  unmatched_employee: { borderColor: 'rgba(248, 113, 113, 0.7)', color: '#fca5a5' },
  missing_hourly_rate: { borderColor: 'rgba(251, 191, 36, 0.7)', color: '#fde68a' },
  missing_clock: { borderColor: 'rgba(251, 146, 60, 0.7)', color: '#fdba74' },
  no_punch: { borderColor: 'rgba(148, 163, 184, 0.5)', color: '#cbd5e1' },
  invalid_hours: { borderColor: 'rgba(248, 113, 113, 0.7)', color: '#fca5a5' },
  absence: { borderColor: 'rgba(251, 191, 36, 0.7)', color: '#fde68a' },
};

const defaultMonthlyRestDaysByEmployeeType = {
  monthly: 2,
  hourly: 2,
  piecework: 0,
  manager: 2,
  operator: 2,
};

const attendanceSaveBatchSize = 100;

interface DateColumn {
  index: number;
  month: number;
  day: number;
  label: string;
  weekday: string;
}

interface EmployeeBlock {
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  rows: unknown[][];
}

function toText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeEmployeeType(value: unknown): EmployeeType {
  return ['hourly', 'piecework', 'operator', 'manager', 'monthly'].includes(String(value)) ? value as EmployeeType : 'monthly';
}

function formatTime(value: unknown) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${String(date.H).padStart(2, '0')}:${String(date.M).padStart(2, '0')}:${String(date.S).padStart(2, '0')}`;
    }
  }

  const text = toText(value);
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}` : '';
}

function hoursBetween(start: string, end: string) {
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  if (startParts.length < 2 || endParts.length < 2) return undefined;

  const startMinutes = startParts[0] * 60 + startParts[1] + (startParts[2] || 0) / 60;
  let endMinutes = endParts[0] * 60 + endParts[1] + (endParts[2] || 0) / 60;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const hours = (endMinutes - startMinutes) / 60;

  return Number.isFinite(hours) && hours >= 0 ? Number(hours.toFixed(2)) : undefined;
}

function timeToMinutes(value: string) {
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return undefined;
  return parts[0] * 60 + parts[1];
}

function durationHours(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === undefined || endMinutes === undefined) return 0;
  return Math.max(0, Number(((endMinutes - startMinutes) / 60).toFixed(2)));
}

function overlapHours(start: string, end: string, rangeStart: string, rangeEnd: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const rangeStartMinutes = timeToMinutes(rangeStart);
  const rangeEndMinutes = timeToMinutes(rangeEnd);
  if (
    startMinutes === undefined ||
    endMinutes === undefined ||
    rangeStartMinutes === undefined ||
    rangeEndMinutes === undefined
  ) return 0;

  return Math.max(0, Number(((Math.min(endMinutes, rangeEndMinutes) - Math.max(startMinutes, rangeStartMinutes)) / 60).toFixed(2)));
}

function normalizeAttendanceRule(rule: AttendanceRule): AttendanceRule {
  const morningStartTime = rule.morningStartTime || '08:00';
  const morningEndTime = rule.morningEndTime || '12:00';
  const afternoonStartTime = rule.afternoonStartTime || '13:00';
  const afternoonEndTime = rule.afternoonEndTime || rule.normalOffTime || '18:00';
  const attendanceGraceMinutes = Number(rule.attendanceGraceMinutes ?? rule.graceMinutes ?? 10);

  return {
    ...rule,
    morningStartTime,
    morningEndTime,
    afternoonStartTime,
    afternoonEndTime,
    attendanceGraceMinutes,
    monthlyRestDaysByEmployeeType: Object.assign({}, defaultMonthlyRestDaysByEmployeeType, rule.monthlyRestDaysByEmployeeType || {}),
    expectedWorkHours: durationHours(morningStartTime, morningEndTime) + durationHours(afternoonStartTime, afternoonEndTime),
    normalOffTime: rule.normalOffTime || afternoonEndTime,
    graceMinutes: Number(rule.graceMinutes ?? attendanceGraceMinutes),
  };
}

function getActualWorkHours(checkInTime: string, checkOutTime: string, rule: AttendanceRule) {
  if (!checkInTime || !checkOutTime) return 0;
  return Number((
    overlapHours(checkInTime, checkOutTime, rule.morningStartTime, rule.morningEndTime) +
    overlapHours(checkInTime, checkOutTime, rule.afternoonStartTime, rule.afternoonEndTime)
  ).toFixed(2));
}

function resolveAttendanceRule(workDate: string, rules: AttendanceRule[]) {
  const matched = rules.find((rule) => (
    rule.status === 'active' &&
    rule.effectiveFrom <= workDate &&
    workDate <= rule.effectiveTo
  ));

  return normalizeAttendanceRule(matched ?? {
    id: '',
    ruleName: '默认加班规则',
    season: 'summer' as const,
    effectiveFrom: '',
    effectiveTo: '',
    morningStartTime: '08:00',
    morningEndTime: '12:00',
    afternoonStartTime: '13:00',
    afternoonEndTime: '18:00',
    attendanceGraceMinutes: 10,
    monthlyRestDaysByEmployeeType: defaultMonthlyRestDaysByEmployeeType,
    expectedWorkHours: 9,
    normalOffTime: '18:00',
    graceMinutes: 10,
    status: 'active' as const,
  });
}

function calculateOvertimeHours(checkOutTime: string, normalOffTime: string, graceMinutes: number) {
  const checkOutMinutes = timeToMinutes(checkOutTime);
  const normalOffMinutes = timeToMinutes(normalOffTime);
  if (checkOutMinutes === undefined || normalOffMinutes === undefined) return 0;

  const overtimeMinutes = checkOutMinutes - normalOffMinutes;
  if (overtimeMinutes <= graceMinutes) return 0;
  return Number((overtimeMinutes / 60).toFixed(2));
}

function parseAttendanceMonth(rows: unknown[][]) {
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      const match = toText(cell).match(/(\d{1,2})月\s*\d{1,2}日/);
      if (match) return Number(match[1]);
    }
  }

  return undefined;
}

function parseDateHeader(value: unknown, fallbackMonth?: number): Omit<DateColumn, 'index'> | null {
  const text = toText(value);
  const match = text.match(/^(\d{1,2})\s+([一二三四五六日天])$/);
  if (!match) return null;

  return {
    month: fallbackMonth || new Date().getMonth() + 1,
    day: Number(match[1]),
    label: text,
    weekday: match[2] || '',
  };
}

function findDateHeaderRow(rows: unknown[][], fallbackMonth?: number) {
  let selected = -1;

  rows.slice(0, 12).forEach((row, index) => {
    const dateCount = row.slice(2).filter((cell) => parseDateHeader(cell, fallbackMonth)).length;
    const firstCell = toText(row[0]);
    if (dateCount >= 5 && (firstCell.includes('姓名') || firstCell.includes('部门') || selected < 0)) selected = index;
  });

  return selected;
}

function getDateColumns(row: unknown[], fallbackMonth?: number) {
  return row.reduce<DateColumn[]>((columns, cell, index) => {
    if (index < 2) return columns;
    const parsed = parseDateHeader(cell, fallbackMonth);
    return parsed ? [...columns, { ...parsed, index }] : columns;
  }, []);
}

function parseEmployeeCell(value: unknown, codeCell: unknown) {
  const lines = toText(value).split(/\s+/).filter(Boolean);
  const code = toText(codeCell) || lines.find((line) => /^\d+$/.test(line)) || '';
  const name = lines.find((line) => line !== code && !/部门|工号|姓名/.test(line)) || '';
  const department = lines.slice().reverse().find((line) => line !== name && line !== code && !/部门|工号|姓名/.test(line)) || '';

  return { employeeName: name, employeeCode: code, departmentName: department };
}

function buildBlocks(rows: unknown[][], startIndex: number) {
  const blocks: EmployeeBlock[] = [];
  let index = startIndex;

  while (index < rows.length) {
    const row = rows[index] ?? [];
    const firstCell = toText(row[0]);
    const codeCell = toText(row[1]);

    if (!firstCell && !codeCell) {
      index += 1;
      continue;
    }

    const employee = parseEmployeeCell(firstCell, codeCell);
    if (!employee.employeeName && !employee.employeeCode) {
      index += 1;
      continue;
    }

    const blockRows = [row];
    let nextIndex = index + 1;
    while (nextIndex < rows.length && !toText(rows[nextIndex]?.[0]) && !toText(rows[nextIndex]?.[1])) {
      blockRows.push(rows[nextIndex]);
      nextIndex += 1;
    }

    blocks.push({ ...employee, rows: blockRows });
    index = nextIndex;
  }

  return blocks;
}

function yearFromPeriod(period?: SalaryPeriodRecord) {
  return Number(period?.startDate?.slice(0, 4)) || new Date().getFullYear();
}

function makePeriodKey(period: SalaryPeriodRecord | undefined, month: number) {
  return `${yearFromPeriod(period)}-${String(month).padStart(2, '0')}`;
}

function makeWorkDate(period: SalaryPeriodRecord | undefined, column: DateColumn) {
  return `${yearFromPeriod(period)}-${String(column.month).padStart(2, '0')}-${String(column.day).padStart(2, '0')}`;
}

function displaySheetName(name: string) {
  return !name || /^worksheet$/i.test(name) ? '工作表1' : name;
}

function recordKey(record: Pick<AttendanceRecord, 'periodId' | 'periodKey' | 'employeeCode' | 'employeeName' | 'workDate'>) {
  return [record.periodId || record.periodKey || '', record.employeeCode || record.employeeName, record.workDate].join('|');
}

function buildRecordStatus(employee: EmployeeRecord | undefined, punchTimes: string[], rawWorkHours: number | undefined, absenceHours = 0): AttendanceRecord['status'] {
  if (!employee) return 'unmatched_employee';
  if (punchTimes.length === 0) return 'no_punch';
  if (punchTimes.length < 2) return 'missing_clock';
  if (rawWorkHours === undefined || rawWorkHours <= 0 || rawWorkHours > 24) return 'invalid_hours';
  if (normalizeEmployeeType(employee.employeeType) === 'hourly' && !(Number(employee.hourlyRate) > 0)) return 'missing_hourly_rate';
  if (absenceHours > 0) return 'absence';
  return 'normal';
}

function recalculateAttendanceRecord(record: AttendanceRecord, rules: AttendanceRule[], employee?: EmployeeRecord): AttendanceRecord {
  const attendanceRule = resolveAttendanceRule(record.workDate, rules);
  const checkInTime = record.checkInTime || '';
  const checkOutTime = record.checkOutTime || '';
  const rawWorkHours = checkInTime && checkOutTime && checkInTime !== checkOutTime ? hoursBetween(checkInTime, checkOutTime) : record.rawWorkHours;
  const expectedWorkHours = attendanceRule.expectedWorkHours ?? 0;
  const actualWorkHours = getActualWorkHours(checkInTime, checkOutTime, attendanceRule);
  const absenceHours = Math.max(0, Number((expectedWorkHours - actualWorkHours).toFixed(2)));
  const overtimeHours = calculateOvertimeHours(checkOutTime, attendanceRule.afternoonEndTime, attendanceRule.attendanceGraceMinutes);
  const punchTimes = record.punchTimes ?? [];

  return {
    ...record,
    rawWorkHours,
    expectedWorkHours,
    actualWorkHours,
    absenceHours,
    effectiveWorkHours: actualWorkHours,
    overtimeHours,
    normalOffTime: attendanceRule.afternoonEndTime,
    attendanceRuleId: attendanceRule.id || undefined,
    attendanceGraceMinutes: attendanceRule.attendanceGraceMinutes,
    ruleStatus: attendanceRule.id ? 'matched' : 'default_rule_used',
    status: buildRecordStatus(employee, punchTimes, rawWorkHours, absenceHours),
  };
}

function parseWorkbook(file: File, rows: unknown[][], employees: EmployeeRecord[], rules: AttendanceRule[], period?: SalaryPeriodRecord, sheetName?: string) {
  const attendanceMonth = parseAttendanceMonth(rows);
  const headerRowIndex = findDateHeaderRow(rows, attendanceMonth);
  if (headerRowIndex < 0) {
    return { records: [] as AttendanceRecord[], headerRowIndex, dateColumns: [] as DateColumn[], employeeCount: 0, attendanceMonth, periodKey: '' };
  }

  const dateColumns = getDateColumns(rows[headerRowIndex] ?? [], attendanceMonth);
  const blocks = buildBlocks(rows, headerRowIndex + 1);
  const employeesByCode = new Map(employees.filter((item) => item.employeeCode).map((item) => [item.employeeCode, item]));
  const employeesByName = new Map(employees.filter((item) => item.employeeName).map((item) => [item.employeeName, item]));
  const now = new Date().toISOString();
  const records: AttendanceRecord[] = [];

  blocks.forEach((block) => {
    const employee = employeesByCode.get(block.employeeCode) ?? employeesByName.get(block.employeeName);

    dateColumns.forEach((column) => {
      const punchTimes = block.rows.map((row) => formatTime(row[column.index])).filter(Boolean).sort();
      const checkInTime = punchTimes[0] || '';
      const checkOutTime = punchTimes[punchTimes.length - 1] || '';
      const rawWorkHours = checkInTime && checkOutTime && checkInTime !== checkOutTime ? hoursBetween(checkInTime, checkOutTime) : undefined;
      const employeeType = normalizeEmployeeType(employee?.employeeType);
      const payrollMode = employeeType === 'hourly' ? 'hourly_wage' : 'attendance_only';
      const workDate = makeWorkDate(period, column);
      const periodKey = makePeriodKey(period, column.month);
      const attendanceRule = resolveAttendanceRule(workDate, rules);
      const expectedWorkHours = attendanceRule.expectedWorkHours ?? 0;
      const actualWorkHours = getActualWorkHours(checkInTime, checkOutTime, attendanceRule);
      const absenceHours = Math.max(0, Number((expectedWorkHours - actualWorkHours).toFixed(2)));
      const overtimeHours = calculateOvertimeHours(checkOutTime, attendanceRule.afternoonEndTime, attendanceRule.attendanceGraceMinutes);

      records.push({
        id: `attendance-${workDate}-${employee?.id || block.employeeCode || block.employeeName}-${Date.now()}-${column.index}`,
        periodId: period?.id,
        periodKey,
        employeeId: employee?.id,
        employeeCode: employee?.employeeCode || block.employeeCode,
        employeeName: employee?.employeeName || block.employeeName,
        departmentName: employee?.departmentName || block.departmentName,
        workDate,
        dateLabel: column.label,
        weekday: column.weekday,
        punchTimes,
        checkInTime,
        checkOutTime,
        rawWorkHours,
        expectedWorkHours,
        actualWorkHours,
        absenceHours,
        effectiveWorkHours: actualWorkHours,
        overtimeHours,
        normalOffTime: attendanceRule.afternoonEndTime,
        attendanceRuleId: attendanceRule.id || undefined,
        attendanceGraceMinutes: attendanceRule.attendanceGraceMinutes,
        ruleStatus: attendanceRule.id ? 'matched' : 'default_rule_used',
        hourlyRate: employeeType === 'hourly' ? employee?.hourlyRate ?? 0 : undefined,
        payrollMode,
        status: buildRecordStatus(employee, punchTimes, rawWorkHours, absenceHours),
        sourceFileName: file.name,
        sourceSheetName: sheetName,
        remark: punchTimes.length > 0 ? '' : '当天无打卡时间',
        createdAt: now,
      });
    });
  });

  return { records, headerRowIndex, dateColumns, employeeCount: blocks.length, attendanceMonth, periodKey: records[0]?.periodKey || '' };
}

function AttendanceImportPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRule[]>([]);
  const [previewRecords, setPreviewRecords] = useState<AttendanceRecord[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [attendancePeriodKey, setAttendancePeriodKey] = useState('');
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState('请先选择工资周期，再上传真实打卡 Excel。');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = () => {
    salaryDataSource.loadEmployees().then(setEmployees);
    salaryDataSource.loadPeriods().then((next) => {
      setPeriods(next);
      setPeriodId((current) => current || next[0]?.id || '');
    });
    salaryDataSource.loadAttendanceRecords().then(setRecords);
    salaryDataSource.loadAttendanceRules().then(setAttendanceRules);
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPeriod = periods.find((period) => period.id === periodId);
  const existingKeys = useMemo(() => new Set(records.map(recordKey)), [records]);
  const duplicateCount = previewRecords.filter((record) => existingKeys.has(recordKey(record))).length;
  const abnormalCount = previewRecords.filter((record) => record.status !== 'normal').length;
  const tableRecords = previewRecords.length > 0 ? previewRecords : records;
  const tableTitle = previewRecords.length > 0 ? '打卡记录预览' : '已保存打卡记录';
  const tableDescription = previewRecords.length > 0
    ? '当前只保存考勤事实，不生成工资金额。'
    : '刷新后显示已保存到 attendance-records.json 的打卡记录。';

  const filteredRecords = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const employeeByCode = new Map(employees.filter((employee) => employee.employeeCode).map((employee) => [employee.employeeCode, employee]));
    const employeeByName = new Map(employees.filter((employee) => employee.employeeName).map((employee) => [employee.employeeName, employee]));

    const matchedRecords = tableRecords.filter((record) => {
      const matchesKeyword = !keyword || [
        record.employeeName,
        record.employeeCode,
        record.departmentName,
        record.workDate,
      ].some((value) => toText(value).toLowerCase().includes(keyword));

      return matchesKeyword;
    });
    const nextRecords: AttendanceRecord[] = [];

    for (const record of matchedRecords) {
      const employee = (record.employeeId ? employeeById.get(record.employeeId) : undefined) ??
        (record.employeeCode ? employeeByCode.get(record.employeeCode) : undefined) ??
        employeeByName.get(record.employeeName);
      const recalculatedRecord = recalculateAttendanceRecord(record, attendanceRules, employee);

      if (!statusFilter || recalculatedRecord.status === statusFilter) {
        nextRecords.push(recalculatedRecord);
      }

      if (nextRecords.length >= 300) break;
    }

    return nextRecords;
  }, [attendanceRules, employees, tableRecords, searchText, statusFilter]);

  const importAttendance = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const nextSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[nextSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const parsed = parseWorkbook(file, rows, employees, attendanceRules, selectedPeriod, nextSheetName);

    setSheetName(displaySheetName(nextSheetName));
    setAttendancePeriodKey(parsed.periodKey);
    setDetectedHeaders(parsed.dateColumns.map((column) => column.label));
    setPreviewRecords(parsed.records);
    setMessage(`识别${displaySheetName(nextSheetName)}，表格月份 ${parsed.periodKey || '-'}，员工块 ${parsed.employeeCount} 个，日期列 ${parsed.dateColumns.length} 个，生成 ${parsed.records.length} 条打卡记录预览。`);
  };

  const savePreview = async () => {
    if (previewRecords.length === 0) {
      setMessage('暂无可保存的打卡记录。');
      return;
    }

    const totalBatchCount = Math.ceil(previewRecords.length / attendanceSaveBatchSize);
    let savedBatchCount = 0;

    try {
      for (let index = 0; index < previewRecords.length; index += attendanceSaveBatchSize) {
        const batch = previewRecords.slice(index, index + attendanceSaveBatchSize);
        salaryDataSource.mergeAttendanceRecords(batch);
        savedBatchCount += 1;
      }

      const savedRecords = await salaryDataSource.loadAttendanceRecords();
      const previewKeys = new Set(previewRecords.map(recordKey));
      const savedKeys = new Set(savedRecords.map(recordKey));
      const savedPreviewCount = Array.from(previewKeys).filter((key) => savedKeys.has(key)).length;

      setRecords(savedRecords);

      if (savedPreviewCount < previewKeys.size) {
        setMessage(`保存接口已返回，但只读回 ${savedPreviewCount}/${previewKeys.size} 条本次导入记录，请检查 attendance-records.json 或 DATA_DIR 配置。`);
        return;
      }

      setPreviewRecords([]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败';
      setMessage(`${errorMessage.startsWith('保存失败') ? errorMessage : `打卡记录未能持久保存：${errorMessage}`} 已完成 ${savedBatchCount}/${totalBatchCount} 批。`);
      return;
    }
    setMessage(`已保存 ${previewRecords.length} 条打卡记录，归属月份 ${attendancePeriodKey || selectedPeriod?.periodKey || '-'}，已完成 ${savedBatchCount}/${totalBatchCount} 批，覆盖同周期同员工同日期记录 ${duplicateCount} 条。`);
  };

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>预览记录</span><strong>{previewRecords.length}</strong></article>
        <article><span>异常记录</span><strong>{abnormalCount}</strong></article>
        <article><span>重复覆盖</span><strong>{duplicateCount}</strong></article>
        <article><span>已保存记录</span><strong>{records.length}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>打卡记录导入</h2>
            <p>工资工时基于考勤规则中的上下班时间、员工类型休息天数和加班规则计算，不再以全天打卡时长作为工资依据。</p>
          </div>
          <label className="excel-clear-button primary-action">
            上传打卡 Excel
            <input type="file" accept=".xlsx,.xls" onChange={importAttendance} style={{ display: 'none' }} />
          </label>
        </header>

        <div className="operator-form-grid">
          <label>
            工资周期
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">按表格月份导入</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>{period.periodKey}（{period.startDate} 至 {period.endDate}）</option>
              ))}
            </select>
          </label>
          <label>
            工作表
            <input value={sheetName || '-'} readOnly />
          </label>
          <label>
            表格月份
            <input value={attendancePeriodKey || '上传后按 Excel 标题识别'} readOnly />
          </label>
          <label className="operator-form-wide">
            识别日期列
            <input value={detectedHeaders.length ? detectedHeaders.join(' / ') : '上传后显示识别到的日期列'} readOnly />
          </label>
          <button className="excel-clear-button primary-action" type="button" onClick={savePreview}>保存打卡记录</button>
        </div>
        <div className="import-record-empty" style={{ textAlign: 'left' }}>{message}</div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>字段识别规则</h2>
            <p>真实打卡表按“员工信息块 + 日期列 + 多行打卡时间”解析，不依赖颜色。</p>
          </div>
        </header>
        <div className="salary-plan-grid">
          <article>
            <strong>员工匹配</strong>
            <span>优先工号，其次姓名；未匹配员工标记异常。</span>
          </article>
          <article>
            <strong>打卡时间</strong>
            <span>同一员工同一天收集多行时间，生成 punchTimes、上班时间和下班时间。</span>
          </article>
          <article>
            <strong>工资模式</strong>
            <span>计时员工为 hourly_wage，其他员工保存为 attendance_only。</span>
          </article>
          <article>
            <strong>异常标记</strong>
            <span>无打卡、缺卡、工时异常、未匹配员工、计时员工无时薪。</span>
          </article>
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>{tableTitle}</h2>
            <p>{tableDescription}</p>
          </div>
          <span>{filteredRecords.length} 条</span>
        </header>

        <section className="import-filter-bar">
          <input placeholder="搜索姓名 / 工号 / 部门 / 日期" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </section>

        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>姓名</th>
                <th>工号</th>
                <th>部门</th>
                <th>类型</th>
                <th>打卡次数</th>
                <th>上班</th>
                <th>下班</th>
                <th>应出勤</th>
                <th>实际出勤</th>
                <th>缺勤</th>
                <th>加班工时</th>
                <th>下班规则</th>
                <th>工资模式</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 300).map((record) => {
                const employee = employees.find((item) => item.id === record.employeeId);
                return (
                  <tr key={record.id}>
                    <td>{record.workDate}</td>
                    <td><strong>{record.employeeName || '-'}</strong></td>
                    <td>{record.employeeCode || '-'}</td>
                    <td>{record.departmentName || '-'}</td>
                    <td>{employee ? employeeTypeLabels[normalizeEmployeeType(employee.employeeType)] : '-'}</td>
                    <td>{record.punchTimes?.length ?? 0}</td>
                    <td>{record.checkInTime || '-'}</td>
                    <td>{record.checkOutTime || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{record.expectedWorkHours ?? '-'}</td>
                    <td style={{ textAlign: 'right' }}>{record.actualWorkHours ?? record.effectiveWorkHours ?? '-'}</td>
                    <td style={{ textAlign: 'right' }}>{record.absenceHours ?? '-'}</td>
                    <td style={{ textAlign: 'right' }}>{record.overtimeHours ?? '-'}</td>
                    <td>{record.normalOffTime || '18:00'} / {record.attendanceGraceMinutes ?? 10}分钟</td>
                    <td>{record.payrollMode === 'hourly_wage' ? '计时工资' : '仅考勤'}</td>
                    <td><span className="admin-status" style={statusStyles[record.status]}>{statusLabels[record.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredRecords.length > 300 && <div className="import-record-empty">仅展示前 300 条，筛选和保存记录仍保留全部数据。</div>}
          {filteredRecords.length === 0 && <div className="import-record-empty">暂无打卡记录。上传并保存后，刷新页面也会继续显示。</div>}
        </div>
      </article>
    </section>
  );
}

export default AttendanceImportPage;
