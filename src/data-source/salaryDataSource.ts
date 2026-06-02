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
  const cacheBust = method === 'GET' ? `${path.includes('?') ? '&' : '?'}t=${Date.now()}` : '';
  xhr.open(method, `${apiBase}${path}${cacheBust}`, false);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  xhr.send(body === undefined ? undefined : JSON.stringify(body));

  if (xhr.status >= 200 && xhr.status < 300) {
    return JSON.parse(xhr.responseText) as T;
  }

  if (xhr.status === 413) {
    throw new Error('保存失败：打卡记录数据过大，请分批保存或联系管理员调整服务器限制。');
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

  loadAttendanceRecords(params?: { startDate?: string; endDate?: string; period?: string; employeeId?: string }) {
    try {
      const query = new URLSearchParams();
      if (params?.startDate) query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
      if (params?.period) query.set('period', params.period);
      if (params?.employeeId) query.set('employeeId', params.employeeId);
      return Promise.resolve(request<AttendanceRecord[]>('/api/salary/attendance-records', 'GET', query.size ? `?${query.toString()}` : ''));
    } catch {
      return loadEmptyList<AttendanceRecord>();
    }
  },

  saveAttendanceRecords(records: AttendanceRecord[]) {
    return request<{ ok: boolean }>('/api/persistent-data/salaryAttendanceRecords', 'PUT', '', records);
  },

  mergeAttendanceRecords(records: AttendanceRecord[]) {
    return request<{ ok: boolean; savedCount?: number; totalCount?: number }>('/api/persistent-data/salaryAttendanceRecords', 'PUT', '?mode=merge', records);
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
