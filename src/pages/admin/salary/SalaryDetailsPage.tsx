import { useEffect, useMemo, useState } from 'react';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { AttendanceRecord, AttendanceRule, EmployeeRecord, EmployeeType, PieceworkRecord, SalaryPeriodRecord } from '../../../types/salary';

interface SalaryDetailRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  baseSalary: number;
  lunchAllowance: number;
  housingAllowance: number;
  attendanceBonus: number;
  effectiveWorkHours: number;
  hourlyRate: number;
  hourlyAmount: number;
  overtimeHours: number;
  overtimeAmount: number;
  absenceHours: number;
  absenceDeduction: number;
  pieceworkQuantity: number;
  pieceworkAmount: number;
  totalAmount: number;
  compositionLabel: string;
  status: 'calculated' | 'not_calculated';
}

interface PeriodOption {
  value: string;
  periodKey: string;
  startDate: string;
  endDate: string;
  label: string;
}

const employeeTypeLabels: Record<EmployeeType, string> = {
  monthly: '月薪员工',
  hourly: '计时员工',
  piecework: '计件员工',
  operator: '运营',
  manager: '管理人员',
};

const statusLabels: Record<SalaryDetailRow['status'], string> = {
  calculated: '已汇总',
  not_calculated: '未计算',
};

const statusStyles: Record<SalaryDetailRow['status'], React.CSSProperties> = {
  calculated: { borderColor: 'rgba(74, 222, 128, 0.6)', color: '#86efac' },
  not_calculated: { borderColor: 'rgba(148, 163, 184, 0.5)', color: '#cbd5e1' },
};

const defaultMonthlyRestDaysByEmployeeType = {
  monthly: 2,
  hourly: 2,
  piecework: 0,
  manager: 2,
  operator: 2,
};

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function amount(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function optionalQuantity(value: number) {
  return value > 0 ? amount(value) : '-';
}

function timeToMinutes(value: string | undefined) {
  const parts = String(value ?? '').split(':').map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return undefined;
  return parts[0] * 60 + parts[1];
}

function durationHours(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === undefined || endMinutes === undefined) return 0;
  return Math.max(0, Number(((endMinutes - startMinutes) / 60).toFixed(2)));
}

function overlapHours(start: string | undefined, end: string | undefined, rangeStart: string, rangeEnd: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const rangeStartMinutes = timeToMinutes(rangeStart);
  const rangeEndMinutes = timeToMinutes(rangeEnd);
  if (startMinutes === undefined || endMinutes === undefined || rangeStartMinutes === undefined || rangeEndMinutes === undefined) return 0;

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

function resolveAttendanceRule(workDate: string, rules: AttendanceRule[]) {
  const matched = rules.find((rule) => rule.status === 'active' && rule.effectiveFrom <= workDate && workDate <= rule.effectiveTo);

  return normalizeAttendanceRule(matched ?? {
    id: '',
    ruleName: '默认考勤规则',
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

function actualWorkHours(record: AttendanceRecord, rule: AttendanceRule) {
  if (!record.checkInTime || !record.checkOutTime) return 0;
  return Number((
    overlapHours(record.checkInTime, record.checkOutTime, rule.morningStartTime, rule.morningEndTime) +
    overlapHours(record.checkInTime, record.checkOutTime, rule.afternoonStartTime, rule.afternoonEndTime)
  ).toFixed(2));
}

function overtimeHours(checkOutTime: string | undefined, normalOffTime: string | undefined, graceMinutes: number | undefined) {
  const checkOutMinutes = timeToMinutes(checkOutTime);
  const normalOffMinutes = timeToMinutes(normalOffTime);
  if (checkOutMinutes === undefined || normalOffMinutes === undefined) return 0;

  const overtimeMinutes = checkOutMinutes - normalOffMinutes;
  if (overtimeMinutes <= Number(graceMinutes ?? 10)) return 0;
  return Number((overtimeMinutes / 60).toFixed(2));
}

function hasCompletePunch(record: AttendanceRecord) {
  return Boolean(record.checkInTime && record.checkOutTime && record.checkInTime !== record.checkOutTime);
}

function recalculateSalaryAttendanceRecord(record: AttendanceRecord, rules: AttendanceRule[]) {
  const rule = resolveAttendanceRule(record.workDate, rules);
  const expectedWorkHours = rule.expectedWorkHours ?? 0;
  const actualHours = actualWorkHours(record, rule);
  const absenceHours = hasCompletePunch(record) ? Math.max(0, Number((expectedWorkHours - actualHours).toFixed(2))) : 0;
  const nextStatus: AttendanceRecord['status'] = record.status === 'no_punch' || record.status === 'missing_clock'
    ? record.status
    : absenceHours > 0
      ? 'absence'
      : record.status;

  return {
    ...record,
    expectedWorkHours,
    actualWorkHours: actualHours,
    effectiveWorkHours: actualHours,
    absenceHours,
    overtimeHours: overtimeHours(record.checkOutTime, rule.afternoonEndTime, rule.attendanceGraceMinutes),
    normalOffTime: rule.afternoonEndTime,
    attendanceGraceMinutes: rule.attendanceGraceMinutes,
    status: nextStatus,
  };
}

function inPeriod(date: string | undefined, period: Pick<SalaryPeriodRecord, 'startDate' | 'endDate'> | undefined) {
  if (!period || !date) return true;
  return period.startDate <= date && date <= period.endDate;
}

function monthKey(date: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date!.slice(0, 7) : '';
}

function buildRecordPeriodOptions(attendanceRecords: AttendanceRecord[], pieceworkRecords: PieceworkRecord[]) {
  const byMonth = new Map<string, string[]>();

  [...attendanceRecords.map((record) => record.workDate), ...pieceworkRecords.map((record) => record.workDate)].forEach((date) => {
    const key = monthKey(date);
    if (!key || !date) return;
    byMonth.set(key, [...(byMonth.get(key) ?? []), date]);
  });

  return Array.from(byMonth.entries()).map<PeriodOption>(([key, dates]) => {
    const sortedDates = [...dates].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    return {
      value: `record-${key}`,
      periodKey: key,
      startDate,
      endDate,
      label: `${key}（${startDate} 至 ${endDate}，来自导入记录）`,
    };
  });
}

function isActive(employee: EmployeeRecord) {
  return employee.status !== 'inactive';
}

function attendanceAmount(record: AttendanceRecord, employee: EmployeeRecord) {
  if (record.status !== 'normal') return 0;
  return toNumber(record.overtimeHours) * toNumber(record.hourlyRate ?? employee.hourlyRate);
}

function absenceAmount(record: AttendanceRecord, employee: EmployeeRecord) {
  return toNumber(record.absenceHours) * toNumber(record.hourlyRate ?? employee.hourlyRate);
}

function pieceworkAmount(record: PieceworkRecord) {
  return toNumber(record.amount ?? record.dailyAmount);
}

function compositionLabel(employeeType: EmployeeType) {
  if (employeeType === 'hourly') return '基本工资 + 补贴 + 加班工资 - 缺勤扣款';
  if (employeeType === 'piecework') return '计件工资 + 补贴';
  if (employeeType === 'monthly') return '基本工资 + 补贴';
  if (employeeType === 'manager') return '基本工资 + 补贴';
  return '运营绩效暂缓';
}

function fixedItems(employee: EmployeeRecord, enabled: boolean) {
  return {
    baseSalary: enabled ? toNumber(employee.baseSalary) : 0,
    lunchAllowance: enabled ? toNumber(employee.lunchAllowance) : 0,
    housingAllowance: enabled ? toNumber(employee.housingAllowance) : 0,
    attendanceBonus: enabled ? toNumber(employee.attendanceBonus) : 0,
  };
}

function groupByEmployee<T>(records: T[], getEmployeeId: (record: T) => string | undefined) {
  return records.reduce<Map<string, T[]>>((map, record) => {
    const employeeId = getEmployeeId(record);
    if (!employeeId) return map;
    map.set(employeeId, [...(map.get(employeeId) ?? []), record]);
    return map;
  }, new Map());
}

function attendanceRecordKey(record: AttendanceRecord) {
  return [record.periodKey || monthKey(record.workDate), record.employeeCode || record.employeeName, record.workDate].join('|');
}

function dedupeAttendanceRecords(records: AttendanceRecord[]) {
  const merged = new Map<string, AttendanceRecord>();
  records.forEach((record) => {
    const key = attendanceRecordKey(record);
    if (key) merged.set(key, record);
  });
  return Array.from(merged.values());
}

function recordMatchesEmployee(record: AttendanceRecord | PieceworkRecord, employee: EmployeeRecord) {
  return record.employeeId === employee.id ||
    Boolean(record.employeeCode && record.employeeCode === employee.employeeCode) ||
    record.employeeName === employee.employeeName;
}

function resolveRecordEmployee(record: AttendanceRecord | PieceworkRecord, employees: EmployeeRecord[]) {
  return employees.find((employee) => recordMatchesEmployee(record, employee));
}

function uniqueDateCount(records: AttendanceRecord[]) {
  return new Set(records.map((record) => record.workDate).filter(Boolean)).size;
}

function buildAttendanceStats(records: AttendanceRecord[]) {
  const absenceRecords = records.filter((record) => record.status === 'absence' || (hasCompletePunch(record) && toNumber(record.absenceHours) > 0));
  const shortWorkRecords = records.filter((record) => hasCompletePunch(record) && toNumber(record.absenceHours) > 0);
  const missingClockCount = records.filter((record) => ['missing_clock', 'missing_time', 'no_punch'].includes(record.status)).length;
  const lateCount = 0;
  const earlyLeaveCount = 0;
  const absenceDays = uniqueDateCount(absenceRecords);
  const overtimeHours = records.reduce((total, record) => total + toNumber(record.overtimeHours), 0);
  const absenceHours = absenceRecords.reduce((total, record) => total + toNumber(record.absenceHours), 0);
  const isFullAttendance = absenceDays <= 2 && lateCount + earlyLeaveCount <= 3;
  const fullAttendanceReasons = [
    absenceDays > 2 ? `月休/缺勤天数 ${absenceDays} 天，超过 2 天` : '',
    lateCount + earlyLeaveCount > 3 ? `迟到/早退 ${lateCount + earlyLeaveCount} 次，超过 3 次` : '',
    missingClockCount > 0 ? `缺卡 ${missingClockCount} 次` : '',
  ].filter(Boolean);

  return {
    expectedAttendanceDays: uniqueDateCount(records),
    actualAttendanceDays: uniqueDateCount(records.filter((record) => record.status === 'normal' && record.checkInTime && record.checkOutTime)),
    absenceDays,
    lateCount,
    earlyLeaveCount,
    missingClockCount,
    shortWorkDays: uniqueDateCount(shortWorkRecords),
    overtimeHours,
    absenceHours,
    isFullAttendance,
    fullAttendanceReasons,
  };
}

function SalaryDetailsPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [detailAttendanceRecords, setDetailAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRule[]>([]);
  const [pieceworkRecords, setPieceworkRecords] = useState<PieceworkRecord[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  useEffect(() => {
    salaryDataSource.loadEmployees().then(setEmployees);
    salaryDataSource.loadAttendanceRules().then(setAttendanceRules);
    salaryDataSource.loadPieceworkRecords().then(setPieceworkRecords);
    salaryDataSource.loadPeriods().then((next) => {
      setPeriods(next);
    });
  }, []);

  const periodOptions = useMemo(() => {
    const configuredOptions = periods.map<PeriodOption>((period) => ({
      value: period.id,
      periodKey: period.periodKey,
      startDate: period.startDate,
      endDate: period.endDate,
      label: `${period.periodKey}（${period.startDate} 至 ${period.endDate}）`,
    }));
    const configuredKeys = new Set(configuredOptions.map((option) => option.periodKey));
    const recordOptions = buildRecordPeriodOptions([], pieceworkRecords)
      .filter((option) => !configuredKeys.has(option.periodKey));

    return [...configuredOptions, ...recordOptions].sort((first, second) => second.periodKey.localeCompare(first.periodKey));
  }, [periods, pieceworkRecords]);

  useEffect(() => {
    if (!periodId && periodOptions.length > 0) {
      setPeriodId(periodOptions[0].value);
    }
  }, [periodId, periodOptions]);

  const selectedPeriod = periodOptions.find((period) => period.value === periodId);
  const selectedPeriodKey = selectedPeriod?.periodKey || '';
  const selectedPeriodStartDate = selectedPeriod?.startDate || '';
  const selectedPeriodEndDate = selectedPeriod?.endDate || '';

  useEffect(() => {
    if (!selectedPeriodKey) {
      setAttendanceRecords([]);
      return;
    }

    salaryDataSource.loadAttendanceRecords({
      startDate: selectedPeriodStartDate,
      endDate: selectedPeriodEndDate,
      period: selectedPeriodKey,
    }).then(setAttendanceRecords);
  }, [selectedPeriodEndDate, selectedPeriodKey, selectedPeriodStartDate]);

  useEffect(() => {
    if (!selectedEmployeeId || !selectedPeriodKey) {
      setDetailAttendanceRecords([]);
      return;
    }

    setDetailAttendanceRecords([]);
    salaryDataSource.loadAttendanceRecords({
      employeeId: selectedEmployeeId,
      startDate: selectedPeriodStartDate,
      endDate: selectedPeriodEndDate,
      period: selectedPeriodKey,
    }).then(setDetailAttendanceRecords);
  }, [selectedEmployeeId, selectedPeriodEndDate, selectedPeriodKey, selectedPeriodStartDate]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const normalizedAttendanceRecords = useMemo(
    () => dedupeAttendanceRecords(attendanceRecords).map((record) => recalculateSalaryAttendanceRecord(record, attendanceRules)),
    [attendanceRecords, attendanceRules],
  );

  const rows = useMemo(() => {
    const activeEmployees = employees.filter(isActive);
    const hourlyRecords = normalizedAttendanceRecords.filter((record) => {
      const employee = resolveRecordEmployee(record, employees);
      return employee?.employeeType === 'hourly' && inPeriod(record.workDate, selectedPeriod);
    });
    const pieceworkRows = pieceworkRecords.filter((record) => {
      const employee = resolveRecordEmployee(record, employees);
      return employee?.employeeType === 'piecework' && inPeriod(record.workDate, selectedPeriod);
    });
    const hourlyByEmployee = groupByEmployee(hourlyRecords, (record) => resolveRecordEmployee(record, employees)?.id);
    const pieceworkByEmployee = groupByEmployee(pieceworkRows, (record) => resolveRecordEmployee(record, employees)?.id);

    return activeEmployees.map<SalaryDetailRow>((employee) => {
      const isFixedEmployee = employee.employeeType === 'monthly' || employee.employeeType === 'manager' || employee.employeeType === 'hourly';
      const isPieceworkEmployee = employee.employeeType === 'piecework';
      const employeeHourlyRecords = hourlyByEmployee.get(employee.id) ?? [];
      const employeePieceworkRecords = pieceworkByEmployee.get(employee.id) ?? [];
      const fixed = fixedItems(employee, isFixedEmployee || isPieceworkEmployee);
      const baseSalary = isPieceworkEmployee ? 0 : fixed.baseSalary;
      const overtimeHours = employeeHourlyRecords.reduce((total, record) => total + toNumber(record.overtimeHours), 0);
      const hourlyRate = employee.employeeType === 'hourly' ? toNumber(employee.hourlyRate) : 0;
      const hourlyAmount = 0;
      const overtimeAmount = employeeHourlyRecords.reduce((total, record) => total + attendanceAmount(record, employee), 0);
      const totalAbsenceAmount = employeeHourlyRecords.reduce((total, record) => total + absenceAmount(record, employee), 0);
      const absenceHours = employeeHourlyRecords.reduce((total, record) => total + toNumber(record.absenceHours), 0);
      const pieceworkQuantity = isPieceworkEmployee ? employeePieceworkRecords.reduce((total, record) => total + toNumber(record.quantity), 0) : 0;
      const totalPieceworkAmount = isPieceworkEmployee ? employeePieceworkRecords.reduce((total, record) => total + pieceworkAmount(record), 0) : 0;
      const totalAmount = employee.employeeType === 'operator'
        ? 0
        : baseSalary + fixed.lunchAllowance + fixed.housingAllowance + fixed.attendanceBonus + hourlyAmount + overtimeAmount + totalPieceworkAmount - totalAbsenceAmount;

      return {
        id: employee.id,
        employeeId: employee.id,
        employeeName: employee.employeeName,
        employeeType: employee.employeeType,
        baseSalary,
        lunchAllowance: fixed.lunchAllowance,
        housingAllowance: fixed.housingAllowance,
        attendanceBonus: fixed.attendanceBonus,
        effectiveWorkHours: overtimeHours,
        hourlyRate,
        hourlyAmount,
        overtimeHours,
        overtimeAmount,
        absenceHours,
        absenceDeduction: totalAbsenceAmount,
        pieceworkQuantity,
        pieceworkAmount: totalPieceworkAmount,
        totalAmount,
        compositionLabel: compositionLabel(employee.employeeType),
        status: employee.employeeType === 'operator' ? 'not_calculated' : 'calculated',
      };
    });
  }, [employees, normalizedAttendanceRecords, pieceworkRecords, selectedPeriod]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const employee = employeeById.get(row.employeeId);
      const matchesType = !typeFilter || row.employeeType === typeFilter;
      const matchesSearch = !keyword || [
        row.employeeName,
        employee?.employeeCode,
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword));

      return matchesType && matchesSearch;
    });
  }, [employeeById, rows, searchText, typeFilter]);

  const selectedDetail = useMemo(() => {
    const employee = employees.find((item) => item.id === selectedEmployeeId);
    const row = rows.find((item) => item.employeeId === selectedEmployeeId);
    if (!employee || !row) return null;

    const employeeAttendanceRecords = dedupeAttendanceRecords(detailAttendanceRecords).map((record) => recalculateSalaryAttendanceRecord(record, attendanceRules));
    const employeePieceworkRecords = pieceworkRecords.filter((record) => recordMatchesEmployee(record, employee) && inPeriod(record.workDate, selectedPeriod));
    const attendanceStats = buildAttendanceStats(employeeAttendanceRecords);
    const salaryItems = employee.employeeType === 'operator'
      ? []
      : [
        { label: '基本工资', amount: row.baseSalary },
        { label: '午餐补贴', amount: row.lunchAllowance },
        { label: '住宿补贴', amount: row.housingAllowance },
        { label: '全勤奖', amount: row.attendanceBonus },
        { label: '加班工资', amount: row.overtimeAmount },
        { label: '计件工资', amount: row.pieceworkAmount },
        { label: '缺勤扣款', amount: -row.absenceDeduction },
      ].filter((item) => item.amount !== 0);

    return {
      employee,
      row,
      attendanceRecords: employeeAttendanceRecords,
      pieceworkRecords: employeePieceworkRecords,
      attendanceStats,
      salaryItems,
    };
  }, [attendanceRules, detailAttendanceRecords, employees, pieceworkRecords, rows, selectedEmployeeId, selectedPeriod]);

  const summary = useMemo(() => ({
    hourly: rows.filter((row) => row.employeeType === 'hourly').reduce((total, row) => total + row.totalAmount, 0),
    piecework: rows.filter((row) => row.employeeType === 'piecework').reduce((total, row) => total + row.totalAmount, 0),
    fixed: rows
      .filter((row) => row.employeeType === 'monthly' || row.employeeType === 'manager')
      .reduce((total, row) => total + row.baseSalary + row.lunchAllowance + row.housingAllowance + row.attendanceBonus, 0),
    operatorCount: rows.filter((row) => row.employeeType === 'operator').length,
    total: rows.filter((row) => row.status === 'calculated').reduce((total, row) => total + row.totalAmount, 0),
  }), [rows]);

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>计时工资</span><strong>{amount(summary.hourly)}</strong></article>
        <article><span>计件工资</span><strong>{amount(summary.piecework)}</strong></article>
        <article><span>月薪/管理</span><strong>{amount(summary.fixed)}</strong></article>
        <article><span>汇总金额</span><strong>{amount(summary.total)}</strong></article>
        <article><span>运营暂缓</span><strong>{summary.operatorCount}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资明细中心 V1</h2>
            <p>只做展示和汇总，不做工资单锁定；运营绩效工资本阶段暂缓。</p>
          </div>
          <span>{filteredRows.length} 条</span>
        </header>

        <section className="operator-form-grid">
          <label>
            工资周期
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">全部周期</option>
              {periodOptions.map((period) => (
                <option key={period.value} value={period.value}>{period.label}</option>
              ))}
            </select>
          </label>
          <label>
            员工类型
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">全部类型</option>
              <option value="hourly">计时员工</option>
              <option value="piecework">计件员工</option>
              <option value="monthly">月薪员工</option>
              <option value="manager">管理人员</option>
              <option value="operator">运营</option>
            </select>
          </label>
          <label>
            搜索员工
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="姓名 / 工号"
            />
          </label>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资明细汇总</h2>
            <p>每个员工一行，按项目列展示；计时员工加班工资 = 加班工时 × 时薪。</p>
          </div>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>员工</th>
                <th>员工类型</th>
                <th style={{ textAlign: 'right' }}>基本工资</th>
                <th style={{ textAlign: 'right' }}>午餐补贴</th>
                <th style={{ textAlign: 'right' }}>住宿补贴</th>
                <th style={{ textAlign: 'right' }}>全勤奖</th>
                <th style={{ textAlign: 'right' }}>加班工时</th>
                <th style={{ textAlign: 'right' }}>时薪</th>
                <th style={{ textAlign: 'right' }}>计时工资</th>
                <th style={{ textAlign: 'right' }}>加班时间</th>
                <th style={{ textAlign: 'right' }}>加班工资</th>
                <th style={{ textAlign: 'right' }}>计件数量</th>
                <th style={{ textAlign: 'right' }}>计件工资</th>
                <th style={{ textAlign: 'right' }}>合计</th>
                <th>工资构成</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.employeeName || '-'}</strong></td>
                  <td>{employeeTypeLabels[row.employeeType]}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.baseSalary)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.lunchAllowance)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.housingAllowance)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.attendanceBonus)}</td>
                  <td style={{ textAlign: 'right' }}>{optionalQuantity(row.effectiveWorkHours)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.hourlyRate)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.hourlyAmount)}</td>
                  <td style={{ textAlign: 'right' }}>{optionalQuantity(row.overtimeHours)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.overtimeAmount)}</td>
                  <td style={{ textAlign: 'right' }}>{optionalQuantity(row.pieceworkQuantity)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.pieceworkAmount)}</td>
                  <td style={{ textAlign: 'right' }}>{amount(row.totalAmount)}</td>
                  <td>{row.compositionLabel}</td>
                  <td><span className="admin-status" style={statusStyles[row.status]}>{statusLabels[row.status]}</span></td>
                  <td>
                    <button type="button" onClick={() => setSelectedEmployeeId(row.employeeId)}>查看明细</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && <div className="import-record-empty">暂无工资明细。</div>}
        </div>
      </article>

      {selectedDetail && (
        <div className="delete-modal-backdrop" role="presentation" onClick={() => setSelectedEmployeeId('')}>
          <section className="salary-detail-modal" role="dialog" aria-modal="true" aria-labelledby="salary-detail-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="salary-detail-title">{selectedDetail.employee.employeeName} 工资明细</h2>
                <p>{selectedPeriod?.periodKey || '全部周期'} / {employeeTypeLabels[selectedDetail.employee.employeeType]}</p>
              </div>
              <button type="button" onClick={() => setSelectedEmployeeId('')}>关闭</button>
            </header>

            <div className="salary-detail-body">
              <section className="salary-detail-section">
                <h3>基础信息</h3>
                <div className="salary-detail-grid">
                  <span>姓名<strong>{selectedDetail.employee.employeeName || '-'}</strong></span>
                  <span>工号<strong>{selectedDetail.employee.employeeCode || '-'}</strong></span>
                  <span>部门<strong>{selectedDetail.employee.departmentName || '-'}</strong></span>
                  <span>岗位<strong>{selectedDetail.employee.positionName || '-'}</strong></span>
                  <span>员工类型<strong>{employeeTypeLabels[selectedDetail.employee.employeeType]}</strong></span>
                  <span>工资周期<strong>{selectedPeriod?.periodKey || '-'}</strong></span>
                  <span>时薪<strong>{selectedDetail.employee.employeeType === 'hourly' ? amount(selectedDetail.row.hourlyRate) : '-'}</strong></span>
                </div>
              </section>

              {selectedDetail.employee.employeeType === 'hourly' && (
                <>
                  <section className="salary-detail-section">
                    <h3>考勤统计</h3>
                    <div className="salary-detail-grid">
                      <span>应出勤天数<strong>{selectedDetail.attendanceStats.expectedAttendanceDays}</strong></span>
                      <span>实际出勤天数<strong>{selectedDetail.attendanceStats.actualAttendanceDays}</strong></span>
                      <span>缺勤天数<strong>{selectedDetail.attendanceStats.absenceDays}</strong></span>
                      <span>半天/工时不足<strong>{selectedDetail.attendanceStats.shortWorkDays}</strong></span>
                      <span>迟到次数<strong>{selectedDetail.attendanceStats.lateCount}</strong></span>
                      <span>早退次数<strong>{selectedDetail.attendanceStats.earlyLeaveCount}</strong></span>
                      <span>缺卡次数<strong>{selectedDetail.attendanceStats.missingClockCount}</strong></span>
                      <span>加班工时<strong>{amount(selectedDetail.attendanceStats.overtimeHours)}</strong></span>
                      <span>缺勤工时<strong>{amount(selectedDetail.attendanceStats.absenceHours)}</strong></span>
                    </div>
                  </section>

                  <section className="salary-detail-section salary-detail-alerts">
                    <h3>异常统计</h3>
                    <div>
                      {selectedDetail.attendanceStats.absenceDays > 0 && <span className="admin-status">缺勤 {selectedDetail.attendanceStats.absenceDays} 天</span>}
                      {selectedDetail.attendanceStats.shortWorkDays > 0 && <span className="admin-status">工时不足 {selectedDetail.attendanceStats.shortWorkDays} 天</span>}
                      {selectedDetail.attendanceStats.missingClockCount > 0 && <span className="admin-status">缺卡 {selectedDetail.attendanceStats.missingClockCount} 次</span>}
                      {selectedDetail.attendanceStats.lateCount > 0 && <span className="admin-status">迟到 {selectedDetail.attendanceStats.lateCount} 次</span>}
                      {selectedDetail.attendanceStats.earlyLeaveCount > 0 && <span className="admin-status">早退 {selectedDetail.attendanceStats.earlyLeaveCount} 次</span>}
                      {selectedDetail.attendanceStats.absenceDays === 0 && selectedDetail.attendanceStats.missingClockCount === 0 && <span className="admin-status" style={statusStyles.calculated}>暂无异常</span>}
                    </div>
                  </section>

                  <section className="salary-detail-section">
                    <h3>全勤情况</h3>
                    <p>
                      <strong>{selectedDetail.attendanceStats.isFullAttendance ? '获得' : '未获得'}</strong>
                      {!selectedDetail.attendanceStats.isFullAttendance && `：${selectedDetail.attendanceStats.fullAttendanceReasons.join('；') || '未满足全勤条件'}`}
                    </p>
                  </section>
                </>
              )}

              {selectedDetail.employee.employeeType === 'piecework' && (
                <section className="salary-detail-section">
                  <h3>计件记录</h3>
                  <div className="import-record-table-wrap salary-detail-table-wrap">
                    <table className="import-record-table">
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th style={{ textAlign: 'right' }}>数量</th>
                          <th style={{ textAlign: 'right' }}>单价</th>
                          <th style={{ textAlign: 'right' }}>金额</th>
                          <th>备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetail.pieceworkRecords.map((record) => (
                          <tr key={record.id}>
                            <td>{record.workDate}</td>
                            <td style={{ textAlign: 'right' }}>{amount(toNumber(record.quantity))}</td>
                            <td style={{ textAlign: 'right' }}>{amount(toNumber(record.unitPrice))}</td>
                            <td style={{ textAlign: 'right' }}>{amount(pieceworkAmount(record))}</td>
                            <td>{record.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selectedDetail.pieceworkRecords.length === 0 && <div className="import-record-empty">当前周期暂无计件记录。</div>}
                  </div>
                </section>
              )}

              {selectedDetail.employee.employeeType === 'operator' && (
                <section className="salary-detail-section">
                  <h3>运营绩效指标</h3>
                  <p>绩效工资暂未计算。</p>
                  <div className="salary-detail-grid">
                    <span>销售额<strong>-</strong></span>
                    <span>首单<strong>-</strong></span>
                    <span>新品<strong>-</strong></span>
                    <span>任务完成率<strong>-</strong></span>
                  </div>
                </section>
              )}

              <section className="salary-detail-section">
                <h3>工资构成</h3>
                <div className="salary-detail-items">
                  {selectedDetail.employee.employeeType === 'operator' ? (
                    <span>运营绩效工资暂未计算</span>
                  ) : selectedDetail.salaryItems.length > 0 ? (
                    selectedDetail.salaryItems.map((item) => (
                      <span key={item.label}>{item.label}<strong>{amount(item.amount)}</strong></span>
                    ))
                  ) : (
                    <span>暂无工资项目</span>
                  )}
                </div>
              </section>

              <section className="salary-detail-total">
                <span>工资合计</span>
                <strong>{amount(selectedDetail.row.totalAmount)}</strong>
              </section>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default SalaryDetailsPage;
