import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { SalaryPeriodRecord, SalaryPeriodStatus } from '../../../types/salary';

const statusLabels: Record<SalaryPeriodStatus, string> = {
  draft: '草稿',
  calculated: '已计算',
  locked: '已锁定',
};

const statusStyles: Record<SalaryPeriodStatus, React.CSSProperties> = {
  draft: { borderColor: 'rgba(148, 163, 184, 0.5)', color: '#cbd5e1' },
  calculated: { borderColor: 'rgba(82, 167, 255, 0.6)', color: '#7dd3fc' },
  locked: { borderColor: 'rgba(74, 222, 128, 0.6)', color: '#86efac' },
};

const emptyForm = {
  periodKey: '',
  startDate: '',
  endDate: '',
  status: 'draft' as SalaryPeriodStatus,
  remark: '',
};

function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentMonthForm() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    periodKey: formatMonth(now),
    startDate: formatDate(first),
    endDate: formatDate(last),
    status: 'draft' as SalaryPeriodStatus,
    remark: '',
  };
}

function normalizeStatus(value: unknown): SalaryPeriodStatus {
  return value === 'calculated' || value === 'locked' ? value : 'draft';
}

function SalaryPeriodsPage() {
  const [periods, setPeriods] = useState<SalaryPeriodRecord[]>([]);
  const [form, setForm] = useState(currentMonthForm);
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('');

  const loadPeriods = () => salaryDataSource.loadPeriods().then(setPeriods);

  useEffect(() => {
    loadPeriods();
  }, []);

  const summary = useMemo(() => {
    const today = formatDate(new Date());
    const currentPeriod = periods.find((period) => period.startDate <= today && today <= period.endDate) ??
      [...periods].filter((period) => normalizeStatus(period.status) !== 'locked').sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];

    return {
      draft: periods.filter((period) => normalizeStatus(period.status) === 'draft').length,
      calculated: periods.filter((period) => normalizeStatus(period.status) === 'calculated').length,
      locked: periods.filter((period) => normalizeStatus(period.status) === 'locked').length,
      currentPeriod,
    };
  }, [periods]);

  const resetForm = () => {
    setForm(currentMonthForm());
    setEditingId('');
    setMessage('');
  };

  const savePeriod = (event: FormEvent) => {
    event.preventDefault();
    const periodKey = form.periodKey.trim();

    if (!periodKey) {
      setMessage('请填写周期名称。');
      return;
    }

    const duplicated = periods.some((period) => period.periodKey === periodKey && period.id !== editingId);
    if (duplicated) {
      setMessage(`周期 ${periodKey} 已存在，不能重复创建。`);
      return;
    }

    const payload = {
      ...form,
      periodKey,
      remark: form.remark.trim(),
    };

    if (editingId) {
      const current = periods.find((period) => period.id === editingId);
      if (current && normalizeStatus(current.status) === 'locked') {
        setMessage('已锁定周期不可编辑。');
        return;
      }
      salaryDataSource.updatePeriod(editingId, payload);
    } else {
      salaryDataSource.createPeriod(payload);
    }

    resetForm();
    loadPeriods();
  };

  const editPeriod = (period: SalaryPeriodRecord) => {
    if (normalizeStatus(period.status) === 'locked') {
      setMessage('已锁定周期只允许查看，不允许编辑。');
      return;
    }

    setEditingId(period.id);
    setForm({
      periodKey: period.periodKey,
      startDate: period.startDate,
      endDate: period.endDate,
      status: normalizeStatus(period.status),
      remark: period.remark || '',
    });
    setMessage('');
  };

  const changeStatus = (period: SalaryPeriodRecord, status: SalaryPeriodStatus) => {
    salaryDataSource.updatePeriod(period.id, { status });
    loadPeriods();
  };

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>周期总数</span><strong>{periods.length}</strong></article>
        <article><span>草稿周期</span><strong>{summary.draft}</strong></article>
        <article><span>已计算</span><strong>{summary.calculated}</strong></article>
        <article><span>已锁定</span><strong>{summary.locked}</strong></article>
        <article><span>当前周期</span><strong>{summary.currentPeriod?.periodKey || '-'}</strong></article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>新建工资周期</h2>
            <p>工资周期统一关联打卡记录、计件记录、管理工资、工资明细和工资单；本页不做工资计算。</p>
          </div>
          <button className="excel-clear-button" type="button" onClick={() => setForm(currentMonthForm())}>填入当前月份</button>
        </header>
        <form className="operator-form-grid" onSubmit={savePeriod}>
          <label>周期名称<input placeholder="例如 2026-05" value={form.periodKey} onChange={(event) => setForm({ ...form, periodKey: event.target.value })} /></label>
          <label>开始日期<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
          <label>结束日期<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
          <label>
            状态
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SalaryPeriodStatus })}>
              <option value="draft">草稿</option>
              <option value="calculated">已计算</option>
              <option value="locked">已锁定</option>
            </select>
          </label>
          <label className="operator-form-wide">备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <button className="excel-clear-button primary-action" type="submit">{editingId ? '保存编辑' : '新增工资周期'}</button>
          {editingId && <button className="excel-clear-button" type="button" onClick={resetForm}>取消编辑</button>}
        </form>
        {message && <div className="import-record-empty">{message}</div>}
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>工资周期列表</h2>
            <p>已锁定周期不可编辑；解锁后可重新调整基础信息。</p>
          </div>
          <span>{periods.length} 个周期</span>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>周期名称</th>
                <th>开始日期</th>
                <th>结束日期</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const status = normalizeStatus(period.status);
                return (
                  <tr key={period.id}>
                    <td><strong>{period.periodKey}</strong></td>
                    <td>{period.startDate || '-'}</td>
                    <td>{period.endDate || '-'}</td>
                    <td><span className="admin-status" style={statusStyles[status]}>{statusLabels[status]}</span></td>
                    <td>{period.createdAt?.slice(0, 10) || '-'}</td>
                    <td>{period.updatedAt?.slice(0, 10) || '-'}</td>
                    <td>{period.remark || '-'}</td>
                    <td className="operator-actions">
                      <button type="button" onClick={() => editPeriod(period)}>编辑</button>
                      {status === 'locked' ? (
                        <button type="button" onClick={() => changeStatus(period, 'draft')}>解锁</button>
                      ) : (
                        <button type="button" onClick={() => changeStatus(period, 'locked')}>锁定</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {periods.length === 0 && <div className="import-record-empty">暂无工资周期，可以先创建当前月份周期。</div>}
        </div>
      </article>
    </section>
  );
}

export default SalaryPeriodsPage;
