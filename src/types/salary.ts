import type { StorePlatform } from './store';

export type SalaryPlatform = StorePlatform | 'ALL';
export type EmployeeType = 'hourly' | 'piecework' | 'operator' | 'manager' | 'monthly';
export type SalaryRecordStatus = 'active' | 'inactive';
export type SalaryPeriodStatus = 'draft' | 'calculated' | 'locked';
export type SalaryImportType = 'attendance' | 'piecework';
export type SalaryImportStatus = 'active' | 'inactive' | 'parsed' | 'failed';
export type AttendanceRuleSeason = 'summer' | 'winter';
export type AttendanceRuleStatus = 'active' | 'inactive';
export type AttendanceRuleApplyStatus = 'matched' | 'default_rule_used';
export type SalaryPlanMode = 'fixed' | 'performance' | 'piecework' | 'mixed';
export type SalaryItemType = 'fixed' | 'performance' | 'piecework' | 'subsidy' | 'deduction' | 'attendance' | 'adjustment';
export type SalaryItemDirection = 'income' | 'deduction';
export type SalaryRecordSourceType = 'manual' | 'attendance' | 'operation_performance' | 'design_piecework' | 'packing_piecework' | 'fixed_salary' | 'subsidy' | 'deduction';
export type SalaryRecordConfirmStatus = 'draft' | 'pending' | 'confirmed' | 'rejected';
export type FinancialExpenseCategory = '推广服务费' | '消费者及履约保障-售后问题' | '仓储综合服务费' | '合规EPR物流包装环保费' | '提现' | '其他支出';

export interface SalaryPlan {
  id: string;
  name: string;
  code: string;
  applicablePosition: string;
  salaryMode: SalaryPlanMode;
  description?: string;
  status: SalaryRecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryItem {
  id: string;
  name: string;
  code: string;
  itemType: SalaryItemType;
  direction: SalaryItemDirection;
  description?: string;
  status: SalaryRecordStatus;
}

export interface EmployeeSalaryPlan {
  id: string;
  employeeId: string;
  salaryPlanId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: SalaryRecordStatus;
  remark?: string;
}

export interface SalaryRecord {
  id: string;
  employeeId: string;
  payrollPeriodId: string;
  salaryItemId: string;
  sourceType: SalaryRecordSourceType;
  sourceId?: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  status: SalaryRecordConfirmStatus;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeRecord {
  id: string;
  employeeCode: string;
  employeeName: string;
  employeeType: EmployeeType;
  attendanceRuleId?: string;
  departmentName?: string;
  positionName?: string;
  status: SalaryRecordStatus;
  entryDate?: string;
  hourlyRate?: number;
  baseSalary?: number;
  lunchAllowance?: number;
  housingAllowance?: number;
  attendanceBonus?: number;
  operatorId?: string;
  remark?: string;
  sourceFields?: Record<string, string | number>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRule {
  id: string;
  ruleId?: string;
  ruleName: string;
  season: AttendanceRuleSeason;
  effectiveFrom: string;
  startDate?: string;
  effectiveTo: string;
  endDate?: string;
  morningStartTime: string;
  morningEndTime: string;
  afternoonStartTime: string;
  afternoonEndTime: string;
  attendanceGraceMinutes: number;
  monthlyRestDaysByEmployeeType?: Record<EmployeeType, number>;
  expectedWorkHours?: number;
  dailyExpectedHours?: number;
  normalOffTime: string;
  graceMinutes: number;
  remark?: string;
  status: AttendanceRuleStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeTypeRule {
  id: string;
  employeeType: EmployeeType;
  monthlyRestDays: number;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalaryPeriodRecord {
  id: string;
  periodKey: string;
  startDate: string;
  endDate: string;
  status: SalaryPeriodStatus;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalaryImportTemplate {
  id: string;
  templateName: string;
  importType: SalaryImportType;
  headerRowIndex: number;
  sheetName?: string;
  status: SalaryRecordStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalaryImportFieldMapping {
  id: string;
  templateId: string;
  targetField: string;
  sourceHeader: string;
  required: boolean;
  defaultValue?: string;
  transformType?: 'text' | 'number' | 'date' | 'datetime' | 'time';
  remark?: string;
}

export interface SalaryImportBatch {
  id: string;
  templateId: string;
  importType: SalaryImportType;
  fileName: string;
  importedAt: string;
  rowCount: number;
  validRowCount: number;
  errorRowCount: number;
  status: Extract<SalaryImportStatus, 'parsed' | 'failed'>;
  message?: string;
}

export interface AttendanceRecord {
  id: string;
  periodId?: string;
  periodKey?: string;
  batchId?: string;
  employeeId?: string;
  employeeCode?: string;
  sourceEmployeeCode?: string;
  employeeName: string;
  departmentName?: string;
  workDate: string;
  dateLabel?: string;
  weekday?: string;
  punchTimes?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  rawWorkHours?: number;
  expectedWorkHours?: number;
  actualWorkHours?: number;
  absenceHours?: number;
  effectiveWorkHours?: number;
  overtimeHours?: number;
  normalOffTime?: string;
  attendanceRuleId?: string;
  attendanceGraceMinutes?: number;
  ruleStatus?: AttendanceRuleApplyStatus;
  hourlyRate?: number;
  dailyAmount?: number;
  payrollMode?: 'hourly_wage' | 'attendance_only';
  status: 'normal' | 'unmatched_employee' | 'conflict_employee_match' | 'missing_time' | 'invalid' | 'missing_hourly_rate' | 'missing_clock' | 'no_punch' | 'invalid_hours' | 'absence';
  sourceFileName?: string;
  sourceSheetName?: string;
  remark?: string;
  createdAt?: string;
}

export interface PieceworkRecord {
  id: string;
  batchId: string;
  payrollPeriodId?: string;
  employeeId?: string;
  employeeName: string;
  workDate: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  employeeCode?: string;
  dailyAmount?: number;
  status: 'normal' | 'unmatched_employee' | 'invalid_quantity' | 'invalid_price';
  remark?: string;
  createdAt?: string;
}

export interface ManagerSalaryItem {
  id: string;
  periodId: string;
  employeeId: string;
  itemType: 'base_salary' | 'bonus' | 'deduction';
  itemName: string;
  amount: number;
  reason?: string;
  sourceType: 'manual' | 'import';
  createdAt?: string;
  updatedAt?: string;
}

export interface SalarySlip {
  id: string;
  periodId: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  departmentName?: string;
  hourlyAmount: number;
  pieceworkAmount: number;
  managerAmount: number;
  performanceAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  finalAmount: number;
  status: 'draft' | 'confirmed' | 'locked';
  createdAt?: string;
  updatedAt?: string;
}

export interface SalarySlipItem {
  id: string;
  salarySlipId: string;
  periodId: string;
  employeeId: string;
  itemType: 'hourly' | 'piecework' | 'manager' | 'operator_performance' | 'bonus' | 'deduction' | 'adjustment';
  itemName: string;
  sourceType: 'attendance_record' | 'piecework_record' | 'manager_salary_item' | 'manual' | 'performance_result';
  sourceId?: string;
  workDate?: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  remark?: string;
  createdAt?: string;
}

export interface SalaryFinancialDetail {
  id: string;
  platform: StorePlatform;
  storeId: string;
  storeName?: string;
  period: string;
  transactionTime: string;
  transactionType: string;
  currency: string;
  amount: number;
  remark?: string;
  category: FinancialExpenseCategory;
  sourceFileName?: string;
  importBatchId: string;
  createdAt: string;
}

export interface SalaryFinancialCategorySummary {
  category: FinancialExpenseCategory;
  amount: number;
}

export interface SalaryFinancialImportBatch {
  id: string;
  platform: StorePlatform;
  storeId: string;
  storeName?: string;
  period: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  inflowAmount: number;
  expenseAmount: number;
  withdrawAmount: number;
  operationExpenseAmount: number;
  hasNonCny: boolean;
  hasOtherExpense: boolean;
  importedAt: string;
}

export interface SalaryFinancialImportListResponse {
  records: SalaryFinancialImportBatch[];
  total: number;
  page: number;
  pageSize: number;
  storeOptions: string[];
  periodOptions: string[];
}

export interface SalaryFinancialDetailPage {
  records: SalaryFinancialDetail[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SalaryFinancialStoreSummary {
  platform: StorePlatform;
  storeId: string;
  storeName?: string;
  period: string;
  inflowAmount: number;
  expenseAmount: number;
  promotionServiceFee: number;
  afterSalesProtectionFee: number;
  storageServiceFee: number;
  eprFee: number;
  otherExpense: number;
  withdrawAmount: number;
  operationExpenseAmount: number;
  netSalesAmount: number;
  commissionRate: number;
  commissionAmount: number;
  categorySummaries: SalaryFinancialCategorySummary[];
  detailCount: number;
  batchCount: number;
  hasData: boolean;
  hasNonCny: boolean;
  hasOtherExpense: boolean;
  dataStatus?: string;
  warnings?: string[];
}

export interface OperatorSalaryStoreDetail extends SalaryFinancialStoreSummary {
  dataStatus: string;
  warnings: string[];
}

export interface OperatorSalaryStatisticRow {
  id: string;
  period: string;
  employeeId: string;
  operatorId?: string;
  operatorName: string;
  storeIds: string[];
  storeNames: string[];
  baseSalary: number;
  inflowAmount: number;
  expenseAmount: number;
  promotionServiceFee: number;
  afterSalesProtectionFee: number;
  storageServiceFee: number;
  eprFee: number;
  otherExpense: number;
  withdrawAmount: number;
  operationExpenseAmount: number;
  netSalesAmount: number;
  commissionAmount: number;
  payableSalary: number;
  dataStatus: string;
  warnings: string[];
  hasFinancialData: boolean;
  storeDetails: OperatorSalaryStoreDetail[];
}
