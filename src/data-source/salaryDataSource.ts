import type {
  EmployeeRecord,
  AttendanceRecord,
  AttendanceRule,
  EmployeeSalaryPlan,
  PieceworkRecord,
  SalaryImportFieldMapping,
  SalaryImportTemplate,
  SalaryItem,
  SalaryPlan,
  SalaryPeriodRecord,
  SalaryRecord,
} from '../types/salary';

function request<T>(apiBase: string, method: string, path = '', body?: unknown): T {
  const xhr = new XMLHttpRequest();
  const cacheBust = method === 'GET' ? `?t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  throw new Error(xhr.responseText || '薪资数据请求失败');
}

function loadEmptyList<T>(): Promise<T[]> {
  return Promise.resolve([]);
}

export const salaryDataSource = {
  loadEmployees() {
    try {
      return Promise.resolve(request<EmployeeRecord[]>('/api/salary/employees', 'GET'));
    } catch {
      return loadEmptyList<EmployeeRecord>();
    }
  },

  createEmployee(employee: Partial<EmployeeRecord>) {
    return request<EmployeeRecord>('/api/salary/employees', 'POST', '', employee);
  },

  updateEmployee(id: string, employee: Partial<EmployeeRecord>) {
    return request<EmployeeRecord>('/api/salary/employees', 'PUT', `/${encodeURIComponent(id)}`, employee);
  },

  loadPeriods() {
    try {
      return Promise.resolve(request<SalaryPeriodRecord[]>('/api/salary/periods', 'GET'));
    } catch {
      return loadEmptyList<SalaryPeriodRecord>();
    }
  },

  createPeriod(period: Partial<SalaryPeriodRecord>) {
    return request<SalaryPeriodRecord>('/api/salary/periods', 'POST', '', period);
  },

  updatePeriod(id: string, period: Partial<SalaryPeriodRecord>) {
    return request<SalaryPeriodRecord>('/api/salary/periods', 'PUT', `/${encodeURIComponent(id)}`, period);
  },

  loadAttendanceRecords() {
    try {
      return Promise.resolve(request<AttendanceRecord[]>('/api/salary/attendance-records', 'GET'));
    } catch {
      return loadEmptyList<AttendanceRecord>();
    }
  },

  saveAttendanceRecords(records: AttendanceRecord[]) {
    return request<{ ok: boolean }>('/api/persistent-data/salaryAttendanceRecords', 'PUT', '', records);
  },

  loadAttendanceRules() {
    try {
      return Promise.resolve(request<AttendanceRule[]>('/api/salary/attendance-rules', 'GET'));
    } catch {
      return loadEmptyList<AttendanceRule>();
    }
  },

  saveAttendanceRules(rules: AttendanceRule[]) {
    return request<{ ok: boolean }>('/api/persistent-data/salaryAttendanceRules', 'PUT', '', rules);
  },

  loadPieceworkRecords() {
    try {
      return Promise.resolve(request<PieceworkRecord[]>('/api/salary/piecework-records', 'GET'));
    } catch {
      return loadEmptyList<PieceworkRecord>();
    }
  },

  savePieceworkRecords(records: PieceworkRecord[]) {
    return request<{ ok: boolean }>('/api/persistent-data/salaryPieceworkRecords', 'PUT', '', records);
  },

  loadImportTemplates() {
    return loadEmptyList<SalaryImportTemplate>();
  },

  loadImportFieldMappings() {
    return loadEmptyList<SalaryImportFieldMapping>();
  },

  loadSalaryPlans() {
    try {
      return Promise.resolve(request<SalaryPlan[]>('/api/salary-plans', 'GET'));
    } catch {
      return loadEmptyList<SalaryPlan>();
    }
  },

  loadSalaryItems() {
    try {
      return Promise.resolve(request<SalaryItem[]>('/api/salary-items', 'GET'));
    } catch {
      return loadEmptyList<SalaryItem>();
    }
  },

  loadEmployeeSalaryPlans() {
    try {
      return Promise.resolve(request<EmployeeSalaryPlan[]>('/api/employee-salary-plans', 'GET'));
    } catch {
      return loadEmptyList<EmployeeSalaryPlan>();
    }
  },

  loadSalaryRecords() {
    try {
      return Promise.resolve(request<SalaryRecord[]>('/api/salary-records', 'GET'));
    } catch {
      return loadEmptyList<SalaryRecord>();
    }
  },

  saveSalaryRecords(records: SalaryRecord[]) {
    return request<{ ok: boolean }>('/api/persistent-data/salaryRecords', 'PUT', '', records);
  },
};
