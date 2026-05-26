import { useEffect, useState, type FormEvent } from 'react';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { AttendanceRule, AttendanceRuleSeason, AttendanceRuleStatus, EmployeeType } from '../../../types/salary';

const salarySystemRows = [
  {
    employeeType: '计时员工 hourly',
    composition: '基本工资 + 午餐补贴 + 住宿补贴 + 全勤奖 + 加班工资',
    algorithm: '加班工资 = overtimeHours × hourlyRate',
    source: '员工档案 + 打卡记录',
  },
  {
    employeeType: '计件员工 piecework',
    composition: '计件工资 + 午餐补贴 + 住宿补贴 + 全勤奖',
    algorithm: '计件工资 = quantity × unitPrice',
    source: '计件记录 + 员工档案',
  },
  {
    employeeType: '月薪员工 monthly',
    composition: '基本工资 + 午餐补贴 + 住宿补贴 + 全勤奖',
    algorithm: '从员工档案直接取数汇总',
    source: '员工档案',
  },
  {
    employeeType: '管理人员 manager',
    composition: '基本工资 + 午餐补贴 + 住宿补贴 + 全勤奖',
    algorithm: '从员工档案直接取数汇总',
    source: '员工档案',
  },
  {
    employeeType: '运营 operator',
    composition: '暂缓接入',
    algorithm: '等待运营绩效系统完成后接入',
    source: '暂不纳入工资汇总',
  },
];

const dataFlowSteps = ['员工档案', '工资周期', '打卡记录 / 计件记录', '工资明细', '工资单'];
const completedItems = ['员工档案', '工资周期', '打卡导入', '计件导入'];
const developingItems = ['工资明细自动汇总'];
const pausedItems = ['运营绩效工资', 'AI绩效分析', '自动奖金规则', '审批流'];

const emptyAttendanceRuleForm = {
  ruleName: '',
  season: 'summer' as AttendanceRuleSeason,
  effectiveFrom: '',
  effectiveTo: '',
  morningStartTime: '08:00',
  morningEndTime: '12:00',
  afternoonStartTime: '13:00',
  afternoonEndTime: '18:00',
  attendanceGraceMinutes: 10,
  monthlyRestDaysByEmployeeType: {
    monthly: 2,
    hourly: 2,
    piecework: 0,
    manager: 2,
    operator: 2,
  } as Record<EmployeeType, number>,
  normalOffTime: '18:00',
  graceMinutes: 10,
  remark: '',
  status: 'active' as AttendanceRuleStatus,
};

const employeeTypeLabels: Record<EmployeeType, string> = {
  monthly: '月薪员工',
  hourly: '计时员工',
  piecework: '计件员工',
  manager: '管理人员',
  operator: '运营',
};
const employeeTypes = Object.keys(employeeTypeLabels) as EmployeeType[];

const seasonLabels: Record<AttendanceRuleSeason, string> = {
  summer: '夏季',
  winter: '冬季',
};

const ruleStatusLabels: Record<AttendanceRuleStatus, string> = {
  active: '启用',
  inactive: '停用',
};

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, Number(((timeToMinutes(end) - timeToMinutes(start)) / 60).toFixed(2)));
}

function expectedWorkHours(rule: Pick<AttendanceRule, 'morningStartTime' | 'morningEndTime' | 'afternoonStartTime' | 'afternoonEndTime'>) {
  return hoursBetween(rule.morningStartTime, rule.morningEndTime) + hoursBetween(rule.afternoonStartTime, rule.afternoonEndTime);
}

function normalizeRule(rule: AttendanceRule): AttendanceRule {
  const morningStartTime = rule.morningStartTime || '08:00';
  const morningEndTime = rule.morningEndTime || '12:00';
  const afternoonStartTime = rule.afternoonStartTime || '13:00';
  const afternoonEndTime = rule.afternoonEndTime || rule.normalOffTime || '18:00';
  const attendanceGraceMinutes = Number(rule.attendanceGraceMinutes ?? rule.graceMinutes ?? 10);
  const monthlyRestDaysByEmployeeType = {
    ...emptyAttendanceRuleForm.monthlyRestDaysByEmployeeType,
    ...(rule.monthlyRestDaysByEmployeeType || {}),
  };

  return {
    ...rule,
    morningStartTime,
    morningEndTime,
    afternoonStartTime,
    afternoonEndTime,
    attendanceGraceMinutes,
    monthlyRestDaysByEmployeeType,
    expectedWorkHours: expectedWorkHours({ morningStartTime, morningEndTime, afternoonStartTime, afternoonEndTime }),
    normalOffTime: rule.normalOffTime || afternoonEndTime,
    graceMinutes: Number(rule.graceMinutes ?? attendanceGraceMinutes),
  };
}

function SalaryPlanPage() {
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRule[]>([]);
  const [ruleForm, setRuleForm] = useState(emptyAttendanceRuleForm);
  const [editingRuleId, setEditingRuleId] = useState('');
  const [ruleMessage, setRuleMessage] = useState('');

  useEffect(() => {
    salaryDataSource.loadAttendanceRules().then((rules) => setAttendanceRules(rules.map(normalizeRule)));
  }, []);

  const resetRuleForm = () => {
    setRuleForm(emptyAttendanceRuleForm);
    setEditingRuleId('');
  };

  const saveAttendanceRule = (event: FormEvent) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const nextRule: AttendanceRule = {
      id: editingRuleId || `attendance-rule-${Date.now()}`,
      ruleName: ruleForm.ruleName.trim() || `${seasonLabels[ruleForm.season]}加班规则`,
      season: ruleForm.season,
      effectiveFrom: ruleForm.effectiveFrom,
      effectiveTo: ruleForm.effectiveTo,
      morningStartTime: ruleForm.morningStartTime,
      morningEndTime: ruleForm.morningEndTime,
      afternoonStartTime: ruleForm.afternoonStartTime,
      afternoonEndTime: ruleForm.afternoonEndTime,
      attendanceGraceMinutes: toNumber(ruleForm.attendanceGraceMinutes),
      monthlyRestDaysByEmployeeType: ruleForm.monthlyRestDaysByEmployeeType,
      expectedWorkHours: expectedWorkHours(ruleForm),
      normalOffTime: ruleForm.normalOffTime,
      graceMinutes: toNumber(ruleForm.graceMinutes),
      remark: ruleForm.remark.trim(),
      status: ruleForm.status,
      createdAt: attendanceRules.find((rule) => rule.id === editingRuleId)?.createdAt || now,
      updatedAt: now,
    };
    const nextRules = editingRuleId
      ? attendanceRules.map((rule) => rule.id === editingRuleId ? nextRule : rule)
      : [...attendanceRules, nextRule];

    const normalizedRules = nextRules.map(normalizeRule);
    salaryDataSource.saveAttendanceRules(normalizedRules);
    setAttendanceRules(normalizedRules);
    setRuleMessage(`已保存 ${nextRule.ruleName}`);
    resetRuleForm();
  };

  const editAttendanceRule = (rule: AttendanceRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      ruleName: rule.ruleName,
      season: rule.season,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      morningStartTime: normalizeRule(rule).morningStartTime,
      morningEndTime: normalizeRule(rule).morningEndTime,
      afternoonStartTime: normalizeRule(rule).afternoonStartTime,
      afternoonEndTime: normalizeRule(rule).afternoonEndTime,
      attendanceGraceMinutes: normalizeRule(rule).attendanceGraceMinutes,
      monthlyRestDaysByEmployeeType: normalizeRule(rule).monthlyRestDaysByEmployeeType,
      normalOffTime: normalizeRule(rule).normalOffTime,
      graceMinutes: normalizeRule(rule).graceMinutes,
      remark: rule.remark || '',
      status: rule.status,
    });
    setRuleMessage('');
  };

  return (
    <section className="excel-import-page">
      <article className="admin-placeholder-card">
        <span className="admin-status">规则说明中心</span>
        <h2>薪资系统规划</h2>
        <p>统一说明普通工资体系、工资算法和数据流；本页只做架构总览，不做复杂规则配置。</p>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>考勤 / 加班规则配置</h2>
            <p>工资工时基于上下班时间、员工类型休息天数和加班规则计算，不再以全天打卡时长作为工资依据。</p>
          </div>
          <span>{attendanceRules.length} 条规则</span>
        </header>

        <form className="operator-form-grid" onSubmit={saveAttendanceRule}>
          <label>规则名称<input value={ruleForm.ruleName} onChange={(event) => setRuleForm({ ...ruleForm, ruleName: event.target.value })} /></label>
          <label>
            适用季节
            <select value={ruleForm.season} onChange={(event) => setRuleForm({ ...ruleForm, season: event.target.value as AttendanceRuleSeason })}>
              <option value="summer">夏季 summer</option>
              <option value="winter">冬季 winter</option>
            </select>
          </label>
          <label>生效开始日期<input type="date" value={ruleForm.effectiveFrom} onChange={(event) => setRuleForm({ ...ruleForm, effectiveFrom: event.target.value })} /></label>
          <label>生效结束日期<input type="date" value={ruleForm.effectiveTo} onChange={(event) => setRuleForm({ ...ruleForm, effectiveTo: event.target.value })} /></label>
          <label>上午上班<input type="time" value={ruleForm.morningStartTime} onChange={(event) => setRuleForm({ ...ruleForm, morningStartTime: event.target.value })} /></label>
          <label>上午下班<input type="time" value={ruleForm.morningEndTime} onChange={(event) => setRuleForm({ ...ruleForm, morningEndTime: event.target.value })} /></label>
          <label>下午上班<input type="time" value={ruleForm.afternoonStartTime} onChange={(event) => setRuleForm({ ...ruleForm, afternoonStartTime: event.target.value })} /></label>
          <label>下午下班<input type="time" value={ruleForm.afternoonEndTime} onChange={(event) => setRuleForm({ ...ruleForm, afternoonEndTime: event.target.value, normalOffTime: event.target.value })} /></label>
          <label>加班免计分钟数<input type="number" min="0" value={ruleForm.attendanceGraceMinutes} onChange={(event) => setRuleForm({ ...ruleForm, attendanceGraceMinutes: toNumber(event.target.value), graceMinutes: toNumber(event.target.value) })} /></label>
          <label>每日应出勤工时<input value={expectedWorkHours(ruleForm)} readOnly /></label>
          <label>
            状态
            <select value={ruleForm.status} onChange={(event) => setRuleForm({ ...ruleForm, status: event.target.value as AttendanceRuleStatus })}>
              <option value="active">启用 active</option>
              <option value="inactive">停用 inactive</option>
            </select>
          </label>
          {employeeTypes.map((type) => (
            <label key={type}>
              {employeeTypeLabels[type]}每月休息
              <input
                type="number"
                min="0"
                value={ruleForm.monthlyRestDaysByEmployeeType[type]}
                onChange={(event) => setRuleForm({
                  ...ruleForm,
                  monthlyRestDaysByEmployeeType: {
                    ...ruleForm.monthlyRestDaysByEmployeeType,
                    [type]: toNumber(event.target.value),
                  },
                })}
              />
            </label>
          ))}
          <label className="operator-form-wide">备注<input value={ruleForm.remark} onChange={(event) => setRuleForm({ ...ruleForm, remark: event.target.value })} /></label>
          <button className="excel-clear-button primary-action" type="submit">{editingRuleId ? '保存规则' : '新增规则'}</button>
          {editingRuleId && <button className="excel-clear-button" type="button" onClick={resetRuleForm}>取消编辑</button>}
        </form>
        {ruleMessage && <div className="import-record-empty" style={{ textAlign: 'left' }}>{ruleMessage}</div>}

        <div className="import-record-table-wrap" style={{ marginTop: 14 }}>
          <table className="import-record-table">
            <thead>
              <tr>
                <th>规则名称</th>
                <th>季节</th>
                <th>生效日期</th>
                <th>上班时间</th>
                <th>下班时间</th>
                <th style={{ textAlign: 'right' }}>每日应出勤</th>
                <th style={{ textAlign: 'right' }}>免计分钟</th>
                <th>每月休息</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.ruleName}</strong></td>
                  <td>{seasonLabels[rule.season]}</td>
                  <td>{rule.effectiveFrom} 至 {rule.effectiveTo}</td>
                  <td>{rule.morningStartTime}-{rule.morningEndTime}</td>
                  <td>{rule.afternoonStartTime}-{rule.afternoonEndTime}</td>
                  <td style={{ textAlign: 'right' }}>{normalizeRule(rule).expectedWorkHours}</td>
                  <td style={{ textAlign: 'right' }}>{normalizeRule(rule).attendanceGraceMinutes}</td>
                  <td>{employeeTypes.map((type) => `${employeeTypeLabels[type]}${normalizeRule(rule).monthlyRestDaysByEmployeeType[type]}天`).join(' / ')}</td>
                  <td>{ruleStatusLabels[rule.status]}</td>
                  <td className="operator-actions">
                    <button type="button" onClick={() => editAttendanceRule(rule)}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {attendanceRules.length === 0 && <div className="import-record-empty">暂无考勤 / 加班规则，将使用默认规则。</div>}
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资体系说明</h2>
            <p>按员工类型确认工资构成、算法和数据来源。</p>
          </div>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>员工类型</th>
                <th>工资构成</th>
                <th>工资算法</th>
                <th>数据来源</th>
              </tr>
            </thead>
            <tbody>
              {salarySystemRows.map((row) => (
                <tr key={row.employeeType}>
                  <td><strong>{row.employeeType}</strong></td>
                  <td>{row.composition}</td>
                  <td>{row.algorithm}</td>
                  <td>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资数据流</h2>
            <p>工资从基础档案和导入事实进入工资明细，后续再生成工资单。</p>
          </div>
        </header>
        <section className="admin-roadmap-grid">
          {dataFlowSteps.map((item, index) => (
            <article key={item}>
              <strong>{item}</strong>
              <span>{index < dataFlowSteps.length - 1 ? `下一步：${dataFlowSteps[index + 1]}` : '最终输出，用于后续确认和发放。'}</span>
            </article>
          ))}
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>当前系统状态</h2>
            <p>当前阶段聚焦普通工资主链路，运营绩效和自动规则暂缓。</p>
          </div>
        </header>
        <section className="admin-roadmap-grid">
          <article>
            <strong>已完成</strong>
            <span>{completedItems.join(' / ')}</span>
          </article>
          <article>
            <strong>开发中</strong>
            <span>{developingItems.join(' / ')}</span>
          </article>
          <article>
            <strong>暂缓</strong>
            <span>{pausedItems.join(' / ')}</span>
          </article>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资系统核心模型</h2>
            <p>所有工资来源最终会进入工资明细和工资记录主表，用于后续统一汇总工资。</p>
          </div>
        </header>
        <section className="admin-roadmap-grid">
          {['工资方案', '工资项目', '员工工资方案关联', '工资记录主表'].map((item) => (
            <article key={item}>
              <strong>{item}</strong>
              <span>底层数据结构，后续承接工资明细和工资单。</span>
            </article>
          ))}
        </section>
      </article>
    </section>
  );
}

export default SalaryPlanPage;
