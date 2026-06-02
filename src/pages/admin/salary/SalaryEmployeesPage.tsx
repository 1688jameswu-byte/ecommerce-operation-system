import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { AttendanceRule, EmployeeRecord, EmployeeType, SalaryRecordStatus } from '../../../types/salary';

const employeeTypeLabels: Record<EmployeeType, string> = {
  monthly: '月薪员工',
  hourly: '计时员工',
  piecework: '计件员工',
  operator: '运营',
  manager: '管理人员',
};

const statusLabels: Record<SalaryRecordStatus, string> = {
  active: '启用',
  inactive: '停用',
};

const statusStyles: Record<SalaryRecordStatus, React.CSSProperties> = {
  active: { borderColor: 'rgba(74, 222, 128, 0.6)', color: '#86efac' },
  inactive: { borderColor: 'rgba(148, 163, 184, 0.5)', color: '#cbd5e1' },
};

const employeeTypes = Object.keys(employeeTypeLabels) as EmployeeType[];
const importHeaders = ['员工姓名', '入职日期', '部门', '岗位', '基本工资', '时薪', '午餐补贴', '住宿补贴', '全勤奖'] as const;

function toText(value: unknown) {
  return String(value ?? '').trim();
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toExcelDate(value: unknown) {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  return toText(value);
}

function normalizeEmployeeType(value: unknown): EmployeeType {
  return employeeTypes.includes(value as EmployeeType) ? value as EmployeeType : 'monthly';
}

function normalizeStatus(value: unknown): SalaryRecordStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

function inferEmployeeType(positionName: string): EmployeeType {
  if (positionName.includes('运营')) return 'operator';
  if (positionName.includes('管理') || positionName.includes('主管') || positionName.includes('负责人')) return 'manager';
  if (positionName.includes('计件')) return 'piecework';
  if (positionName.includes('临时') || positionName.includes('小时') || positionName.includes('计时')) return 'hourly';
  return 'monthly';
}

function sourceValue(value: unknown) {
  return typeof value === 'number' ? value : toText(value);
}

function nextEmployeeCode(employees: EmployeeRecord[]) {
  const max = employees.reduce((current, employee) => {
    const matched = /^EMP-(\d+)$/.exec(employee.employeeCode || '');
    return matched ? Math.max(current, Number(matched[1])) : current;
  }, 0);

  return `EMP-${String(max + 1).padStart(4, '0')}`;
}

function amount(value: number | undefined) {
  return value === undefined ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function defaultAttendanceRuleId(rules: AttendanceRule[]) {
  return rules.find((rule) => rule.id === 'attendance-rule-standard')?.id || rules.find((rule) => rule.status === 'active')?.id || '';
}

function SalaryEmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRule[]>([]);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const [lastImportAt, setLastImportAt] = useState('');
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadEmployees = () => salaryDataSource.loadEmployees().then(setEmployees);

  useEffect(() => {
    loadEmployees();
    salaryDataSource.loadAttendanceRules().then(setAttendanceRules);
  }, []);

  const summary = useMemo(() => {
    const byType = Object.fromEntries(employeeTypes.map((type) => [type, 0])) as Record<EmployeeType, number>;
    let active = 0;
    let inactive = 0;

    employees.forEach((employee) => {
      byType[normalizeEmployeeType(employee.employeeType)] += 1;
      if (normalizeStatus(employee.status) === 'inactive') inactive += 1;
      else active += 1;
    });

    return { active, inactive, byType };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return employees.filter((employee) => {
      const employeeType = normalizeEmployeeType(employee.employeeType);
      const status = normalizeStatus(employee.status);
      const matchesKeyword = !keyword || [
        employee.employeeName,
        employee.employeeCode,
        employee.departmentName,
        employee.positionName,
      ].some((value) => toText(value).toLowerCase().includes(keyword));

      return matchesKeyword &&
        (!typeFilter || employeeType === typeFilter) &&
        (!statusFilter || status === statusFilter);
    });
  }, [employees, searchText, typeFilter, statusFilter]);

  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;

    salaryDataSource.updateEmployee(editing.id, {
      employeeCode: editing.employeeCode,
      employeeName: editing.employeeName,
      entryDate: editing.entryDate,
      departmentName: editing.departmentName,
      positionName: editing.positionName,
      baseSalary: editing.baseSalary,
      hourlyRate: editing.hourlyRate ?? 0,
      lunchAllowance: editing.lunchAllowance,
      housingAllowance: editing.housingAllowance,
      attendanceBonus: editing.attendanceBonus,
      attendanceRuleId: editing.attendanceRuleId || defaultAttendanceRuleId(attendanceRules),
      employeeType: normalizeEmployeeType(editing.employeeType),
      status: normalizeStatus(editing.status),
      remark: editing.remark,
    });
    setEditing(null);
    loadEmployees();
  };

  const toggleEmployeeStatus = (employee: EmployeeRecord) => {
    const nextStatus = normalizeStatus(employee.status) === 'active' ? 'inactive' : 'active';
    salaryDataSource.updateEmployee(employee.id, { status: nextStatus });
    loadEmployees();
  };

  const startEdit = (employee: EmployeeRecord) => {
    setEditing({
      ...employee,
      employeeType: normalizeEmployeeType(employee.employeeType),
      status: normalizeStatus(employee.status),
      hourlyRate: employee.hourlyRate ?? 0,
      attendanceRuleId: employee.attendanceRuleId || defaultAttendanceRuleId(attendanceRules),
    });
  };

  const importEmployees = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const headers = (rows[0] ?? []).map(toText);
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const current = await salaryDataSource.loadEmployees();
    const byName = new Map(current.filter((item) => item.employeeName).map((item) => [item.employeeName, item]));
    let workingEmployees = [...current];
    let created = 0;
    let updated = 0;
    let ignored = 0;

    setDetectedHeaders(headers);

    for (const row of rows.slice(1)) {
      const get = (header: string) => headerIndex.has(header) ? row[headerIndex.get(header)!] : '';
      const employeeName = toText(get('员工姓名'));

      if (!employeeName) {
        ignored += 1;
        continue;
      }

      const positionName = toText(get('岗位'));
      const sourceFields = Object.fromEntries(
        headers
          .map((header, index) => [header, sourceValue(row[index])] as const)
          .filter(([, value]) => value !== ''),
      );
      const matched = byName.get(employeeName);
      const employeeCode = matched?.employeeCode || nextEmployeeCode(workingEmployees);
      const hourlyRate = headerIndex.has('时薪') ? toNumber(get('时薪')) ?? 0 : 0;
      const payload: Partial<EmployeeRecord> = {
        employeeCode,
        employeeName,
        entryDate: toExcelDate(get('入职日期')),
        departmentName: toText(get('部门')),
        positionName,
        baseSalary: toNumber(get('基本工资')),
        hourlyRate,
        lunchAllowance: toNumber(get('午餐补贴')),
        housingAllowance: toNumber(get('住宿补贴')),
        attendanceBonus: toNumber(get('全勤奖')),
        employeeType: inferEmployeeType(positionName),
        status: matched?.status || 'active',
        sourceFields: {
          ...(matched?.sourceFields ?? {}),
          ...sourceFields,
        },
      };

      if (matched) {
        const next = salaryDataSource.updateEmployee(matched.id, payload);
        byName.set(next.employeeName, next);
        workingEmployees = workingEmployees.map((item) => item.id === next.id ? next : item);
        updated += 1;
      } else {
        const next = salaryDataSource.createEmployee(payload);
        byName.set(next.employeeName, next);
        workingEmployees = [...workingEmployees, next];
        created += 1;
      }
    }

    setImportMessage(`导入完成：新增 ${created} 人，更新 ${updated} 人，忽略 ${ignored} 行。`);
    setLastImportAt(new Date().toLocaleString('zh-CN', { hour12: false }));
    loadEmployees();
  };

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>员工总数</span><strong>{employees.length}</strong></article>
        <article><span>启用员工</span><strong>{summary.active}</strong></article>
        <article><span>停用员工</span><strong>{summary.inactive}</strong></article>
        <article><span>月薪员工</span><strong>{summary.byType.monthly}</strong></article>
        <article><span>计时员工</span><strong>{summary.byType.hourly}</strong></article>
        <article><span>计件员工</span><strong>{summary.byType.piecework}</strong></article>
        <article><span>运营人数</span><strong>{summary.byType.operator}</strong></article>
        <article><span>管理人员</span><strong>{summary.byType.manager}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>员工表导入</h2>
            <p>导入员工基础档案；本页不做工资计算。</p>
          </div>
        </header>
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'stretch' }}>
          <section className="admin-roadmap-grid">
            <article>
              <strong>支持字段</strong>
              <span>{importHeaders.join(' / ')}</span>
            </article>
            <article>
              <strong>识别到的表头</strong>
              <span>{detectedHeaders.length > 0 ? detectedHeaders.join(' / ') : '尚未导入'}</span>
            </article>
            <article>
              <strong>匹配规则</strong>
              <span>按员工姓名更新；无工号时自动生成 EMP 编号。</span>
            </article>
          </section>
          <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <label className="excel-clear-button" style={{ display: 'grid', placeItems: 'center' }}>
              导入员工表
              <input type="file" accept=".xlsx,.xls" onChange={importEmployees} style={{ display: 'none' }} />
            </label>
            <div className="import-record-empty" style={{ minHeight: 82, textAlign: 'left' }}>
              <strong>最近导入时间</strong>
              <p>{lastImportAt || '暂无导入'}</p>
              <span>{importMessage || '导入结果会显示在这里。'}</span>
            </div>
          </section>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>员工列表</h2>
            <p>默认展示核心字段，更多补贴和备注在编辑区查看。</p>
          </div>
          <span>{filteredEmployees.length} / {employees.length} 人</span>
        </header>
        <section className="import-filter-bar">
          <label>
            搜索
            <input placeholder="姓名 / 工号 / 部门 / 岗位" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          </label>
          <label>
            员工类型
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">全部类型</option>
              {employeeTypes.map((type) => <option key={type} value={type}>{employeeTypeLabels[type]}</option>)}
            </select>
          </label>
          <label>
            状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
        </section>

        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>员工姓名</th>
                <th>工号</th>
                <th>部门</th>
                <th>岗位</th>
                <th>员工类型</th>
                <th>考勤规则</th>
                <th>状态</th>
                <th style={{ textAlign: 'right' }}>基本工资</th>
                <th style={{ textAlign: 'right' }}>时薪</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => {
                const employeeType = normalizeEmployeeType(employee.employeeType);
                const status = normalizeStatus(employee.status);
                const attendanceRule = attendanceRules.find((rule) => rule.id === (employee.attendanceRuleId || defaultAttendanceRuleId(attendanceRules)));
                return (
                  <tr key={employee.id}>
                    <td><strong>{employee.employeeName}</strong></td>
                    <td>{employee.employeeCode || '-'}</td>
                    <td>{employee.departmentName || '-'}</td>
                    <td>{employee.positionName || '-'}</td>
                    <td>{employeeTypeLabels[employeeType]}</td>
                    <td>{attendanceRule?.ruleName || '标准班'}</td>
                    <td><span className="admin-status" style={statusStyles[status]}>{statusLabels[status]}</span></td>
                    <td style={{ textAlign: 'right' }}>{amount(employee.baseSalary)}</td>
                    <td style={{ textAlign: 'right' }}>{amount(employee.hourlyRate ?? 0)}</td>
                    <td className="operator-actions">
                      <button type="button" onClick={() => startEdit(employee)}>编辑</button>
                      <button type="button" onClick={() => toggleEmployeeStatus(employee)}>
                        {status === 'active' ? '停用' : '启用'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && <div className="import-record-empty">暂无匹配员工。</div>}
        </div>
      </article>

      {editing && (
        <div className="delete-modal-backdrop" role="presentation" onClick={() => setEditing(null)}>
          <section className="employee-edit-modal" role="dialog" aria-modal="true" aria-labelledby="employee-edit-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="employee-edit-title">编辑员工档案</h2>
                <p>编辑基础资料和系统字段；不触发工资计算。</p>
              </div>
              <button type="button" onClick={() => setEditing(null)}>关闭</button>
            </header>
            <form className="operator-form-grid" onSubmit={saveEdit}>
              <label>员工姓名<input value={editing.employeeName || ''} onChange={(event) => setEditing({ ...editing, employeeName: event.target.value })} /></label>
              <label>入职日期<input type="date" value={editing.entryDate || ''} onChange={(event) => setEditing({ ...editing, entryDate: event.target.value })} /></label>
              <label>部门<input value={editing.departmentName || ''} onChange={(event) => setEditing({ ...editing, departmentName: event.target.value })} /></label>
              <label>岗位<input value={editing.positionName || ''} onChange={(event) => setEditing({ ...editing, positionName: event.target.value })} /></label>
              <label>基本工资<input type="number" value={editing.baseSalary ?? ''} onChange={(event) => setEditing({ ...editing, baseSalary: toNumber(event.target.value) })} /></label>
              <label>时薪<input type="number" value={editing.hourlyRate ?? 0} onChange={(event) => setEditing({ ...editing, hourlyRate: toNumber(event.target.value) ?? 0 })} /></label>
              <label>午餐补贴<input type="number" value={editing.lunchAllowance ?? ''} onChange={(event) => setEditing({ ...editing, lunchAllowance: toNumber(event.target.value) })} /></label>
              <label>住宿补贴<input type="number" value={editing.housingAllowance ?? ''} onChange={(event) => setEditing({ ...editing, housingAllowance: toNumber(event.target.value) })} /></label>
              <label>全勤奖<input type="number" value={editing.attendanceBonus ?? ''} onChange={(event) => setEditing({ ...editing, attendanceBonus: toNumber(event.target.value) })} /></label>
              <label>工号<input value={editing.employeeCode || ''} onChange={(event) => setEditing({ ...editing, employeeCode: event.target.value })} /></label>
              <label>
                员工类型
                <select value={normalizeEmployeeType(editing.employeeType)} onChange={(event) => setEditing({ ...editing, employeeType: event.target.value as EmployeeType })}>
                  {employeeTypes.map((type) => <option key={type} value={type}>{employeeTypeLabels[type]}</option>)}
                </select>
              </label>
              <label>
                考勤规则
                <select value={editing.attendanceRuleId || defaultAttendanceRuleId(attendanceRules)} onChange={(event) => setEditing({ ...editing, attendanceRuleId: event.target.value })}>
                  {attendanceRules.filter((rule) => rule.status === 'active').map((rule) => <option key={rule.id} value={rule.id}>{rule.ruleName}</option>)}
                </select>
              </label>
              <label>
                状态
                <select value={normalizeStatus(editing.status)} onChange={(event) => setEditing({ ...editing, status: event.target.value as SalaryRecordStatus })}>
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label className="operator-form-wide">备注<input value={editing.remark || ''} onChange={(event) => setEditing({ ...editing, remark: event.target.value })} /></label>
              <button className="excel-clear-button primary-action" type="submit">保存编辑</button>
              <button className="excel-clear-button" type="button" onClick={() => setEditing(null)}>取消</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default SalaryEmployeesPage;
