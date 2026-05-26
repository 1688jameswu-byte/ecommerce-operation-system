import { useEffect, useState } from 'react';
import { salaryDataSource } from '../../../data-source/salaryDataSource';
import type { SalaryImportFieldMapping, SalaryImportTemplate } from '../../../types/salary';

const targetFields = {
  attendance: [
    'employeeCode',
    'employeeName',
    'departmentName',
    'workDate',
    'dateLabel',
    'weekday',
    'punchTimes',
    'checkInTime',
    'checkOutTime',
    'rawWorkHours',
    'effectiveWorkHours',
    'payrollMode',
    'status',
    'remark',
  ],
  piecework: ['employeeCode', 'employeeName', 'workDate', 'platform', 'storeName', 'workType', 'quantity', 'unitPrice', 'remark'],
};

function SalaryImportTemplatesPage() {
  const [templates, setTemplates] = useState<SalaryImportTemplate[]>([]);
  const [mappings, setMappings] = useState<SalaryImportFieldMapping[]>([]);

  useEffect(() => {
    salaryDataSource.loadImportTemplates().then(setTemplates);
    salaryDataSource.loadImportFieldMappings().then(setMappings);
  }, []);

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel">
        <header>
          <div>
            <h2>导入模板配置</h2>
            <p>当前只展示导入模板和字段设计，不解析 Excel，不生成工资。</p>
          </div>
          <span>{templates.length} 个模板</span>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>模板名称</th>
                <th>导入类型</th>
                <th>表头行</th>
                <th>工作表</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td><strong>{template.templateName}</strong></td>
                  <td>{template.importType}</td>
                  <td>{template.headerRowIndex}</td>
                  <td>{template.sheetName || '-'}</td>
                  <td>{template.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {templates.length === 0 && <div className="import-record-empty">暂无导入模板，已预留 salary-import-templates.json。</div>}
        </div>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>打卡表矩阵模板</h2>
            <p>真实打卡表是“员工块 + 日期列 + 多行打卡时间”，不是一行一条记录。</p>
          </div>
        </header>
        <section className="admin-roadmap-grid">
          <article>
            <strong>人员识别</strong>
            <span>A列拆分姓名、工号、部门；B列作为工号兜底。</span>
          </article>
          <article>
            <strong>日期识别</strong>
            <span>第2行或重复日期行识别 01-30 日期列，生成 workDate。</span>
          </article>
          <article>
            <strong>打卡时间</strong>
            <span>同一员工块内纵向收集每日多次打卡，保存为 punchTimes。</span>
          </article>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>字段映射说明</h2>
            <p>打卡记录先作为考勤事实保存，只有计时员工参与打卡工资计算。</p>
          </div>
          <span>{mappings.length} 条映射</span>
        </header>
        <section className="admin-roadmap-grid">
          <article>
            <strong>打卡字段</strong>
            <span>{targetFields.attendance.join(' / ')}</span>
          </article>
          <article>
            <strong>计件字段</strong>
            <span>{targetFields.piecework.join(' / ')}</span>
          </article>
          <article>
            <strong>工资模式</strong>
            <span>hourly 员工为 hourly_wage；其他类型为 attendance_only。</span>
          </article>
        </section>
      </article>
    </section>
  );
}

export default SalaryImportTemplatesPage;
