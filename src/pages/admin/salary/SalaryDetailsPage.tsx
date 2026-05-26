import { useEffect, useMemo, useState } from 'react';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { AttendanceRecord, EmployeeRecord, EmployeeType, PieceworkRecord, SalaryPeriodRecord } from '../../../types/salary';

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

function pieceworkAmount(record: PieceworkRecord) {
  return toNumber(record.amount ?? record.dailyAmount);
}

function compositionLabel(employeeType: EmployeeType) {
  if (employeeType === 'hourly') return '基本工资 + 补贴 + 加班工资';
  if (employeeType === 'piecework') return '计件工资';
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

function SalaryDetailsPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [pieceworkRecords, setPieceworkRecords] = useState<PieceworkRecord[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    salaryDataSource.loadEmployees().then(setEmployees);
    salaryDataSource.loadAttendanceRecords().then(setAttendanceRecords);
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
    const recordOptions = buildRecordPeriodOptions(attendanceRecords, pieceworkRecords)
      .filter((option) => !configuredKeys.has(option.periodKey));

    return [...configuredOptions, ...recordOptions].sort((first, second) => second.periodKey.localeCompare(first.periodKey));
  }, [attendanceRecords, periods, pieceworkRecords]);

  useEffect(() => {
    if (!periodId && periodOptions.length > 0) {
      const attendanceMonth = buildRecordPeriodOptions(attendanceRecords, []).sort((first, second) => second.periodKey.localeCompare(first.periodKey))[0];
      setPeriodId(attendanceMonth?.value || periodOptions[0].value);
    }
  }, [attendanceRecords, periodId, periodOptions]);

  const selectedPeriod = periodOptions.find((period) => period.value === periodId);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const rows = useMemo(() => {
    const activeEmployees = employees.filter(isActive);
    const hourlyRecords = attendanceRecords.filter((record) => {
      const employee = record.employeeId ? employeeById.get(record.employeeId) : undefined;
      return employee?.employeeType === 'hourly' && inPeriod(record.workDate, selectedPeriod);
    });
    const pieceworkRows = pieceworkRecords.filter((record) => {
      const employee = record.employeeId ? employeeById.get(record.employeeId) : undefined;
      return employee?.employeeType === 'piecework' && inPeriod(record.workDate, selectedPeriod);
    });
    const hourlyByEmployee = groupByEmployee(hourlyRecords, (record) => record.employeeId);
    const pieceworkByEmployee = groupByEmployee(pieceworkRows, (record) => record.employeeId);

    return activeEmployees.map<SalaryDetailRow>((employee) => {
      const isFixedEmployee = employee.employeeType === 'monthly' || employee.employeeType === 'manager' || employee.employeeType === 'hourly';
      const isPieceworkEmployee = employee.employeeType === 'piecework';
      const employeeHourlyRecords = hourlyByEmployee.get(employee.id) ?? [];
      const employeePieceworkRecords = pieceworkByEmployee.get(employee.id) ?? [];
      const fixed = fixedItems(employee, isFixedEmployee);
      const hasAbsence = employeeHourlyRecords.some((record) => toNumber(record.absenceHours) > 0 || record.status === 'absence');
      const overtimeHours = employeeHourlyRecords.reduce((total, record) => total + toNumber(record.overtimeHours), 0);
      const hourlyRate = employee.employeeType === 'hourly' ? toNumber(employee.hourlyRate) : 0;
      const hourlyAmount = 0;
      const overtimeAmount = employeeHourlyRecords.reduce((total, record) => total + attendanceAmount(record, employee), 0);
      const pieceworkQuantity = isPieceworkEmployee ? employeePieceworkRecords.reduce((total, record) => total + toNumber(record.quantity), 0) : 0;
      const totalPieceworkAmount = isPieceworkEmployee ? employeePieceworkRecords.reduce((total, record) => total + pieceworkAmount(record), 0) : 0;
      const totalAmount = employee.employeeType === 'operator'
        ? 0
        : fixed.baseSalary + fixed.lunchAllowance + fixed.housingAllowance + fixed.attendanceBonus + hourlyAmount + overtimeAmount + totalPieceworkAmount;

      return {
        id: employee.id,
        employeeId: employee.id,
        employeeName: employee.employeeName,
        employeeType: employee.employeeType,
        baseSalary: fixed.baseSalary,
        lunchAllowance: fixed.lunchAllowance,
        housingAllowance: fixed.housingAllowance,
        attendanceBonus: hasAbsence ? 0 : fixed.attendanceBonus,
        effectiveWorkHours: overtimeHours,
        hourlyRate,
        hourlyAmount,
        overtimeHours,
        overtimeAmount,
        pieceworkQuantity,
        pieceworkAmount: totalPieceworkAmount,
        totalAmount: hasAbsence ? totalAmount - fixed.attendanceBonus : totalAmount,
        compositionLabel: compositionLabel(employee.employeeType),
        status: employee.employeeType === 'operator' ? 'not_calculated' : 'calculated',
      };
    });
  }, [attendanceRecords, employeeById, employees, pieceworkRecords, selectedPeriod]);

  const filteredRows = useMemo(() => (
    typeFilter ? rows.filter((row) => row.employeeType === typeFilter) : rows
  ), [rows, typeFilter]);

  const summary = useMemo(() => ({
    hourly: rows.filter((row) => row.employeeType === 'hourly').reduce((total, row) => total + row.hourlyAmount + row.overtimeAmount, 0),
    piecework: rows.filter((row) => row.employeeType === 'piecework').reduce((total, row) => total + row.pieceworkAmount, 0),
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
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && <div className="import-record-empty">暂无工资明细。</div>}
        </div>
      </article>
    </section>
  );
}

export default SalaryDetailsPage;
