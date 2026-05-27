import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { taskSuggestionDataSource } from '../../../data-source/taskSuggestionDataSource';
import type { TaskSuggestionProblemType, TaskSuggestionTemplate } from '../../../types/taskSuggestion';

type TemplateForm = Pick<TaskSuggestionTemplate, 'name' | 'problemType' | 'content' | 'enabled' | 'sortWeight'>;

const problemTypeLabels: Record<TaskSuggestionProblemType, string> = {
  traffic: '流量下降',
  conversion: '转化下降',
  deal: '成交下降',
  opportunity: '增长机会',
};

const emptyForm: TemplateForm = {
  name: '',
  problemType: 'traffic',
  content: '',
  enabled: true,
  sortWeight: 0,
};

function toForm(template: TaskSuggestionTemplate): TemplateForm {
  return {
    name: template.name,
    problemType: template.problemType,
    content: template.content,
    enabled: template.enabled,
    sortWeight: template.sortWeight,
  };
}

function TaskSuggestionsPage() {
  const [templates, setTemplates] = useState<TaskSuggestionTemplate[]>([]);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const nextTemplates = await taskSuggestionDataSource.loadAsync();
    setTemplates(nextTemplates.sort((first, second) => first.sortWeight - second.sortWeight));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const editTemplate = (template: TaskSuggestionTemplate) => {
    setEditingId(template.id);
    setForm(toForm(template));
    setMessage('正在编辑处理建议模板。');
  };

  const saveTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingId) {
      setMessage('请选择要编辑的模板。');
      return;
    }

    if (!form.name.trim() || !form.content.trim()) {
      setMessage('请填写模板名称和建议内容。');
      return;
    }

    taskSuggestionDataSource.update(editingId, form);
    setMessage('处理建议模板已保存。');
    setEditingId('');
    setForm(emptyForm);
    void refresh();
  };

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel task-template-panel">
        <header>
          <div>
            <h2>处理建议模板</h2>
            <p>维护不同问题类型的运营 SOP，创建任务时自动带入启用模板。</p>
          </div>
          {message && <span>{message}</span>}
        </header>

        <section className="task-template-grid">
          <div className="task-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={template.id === editingId ? 'active' : ''}
                type="button"
                onClick={() => editTemplate(template)}
              >
                <strong>{template.name}</strong>
                <span>{problemTypeLabels[template.problemType]} / {template.enabled ? '启用' : '停用'}</span>
              </button>
            ))}
          </div>

          <form className="task-template-form" onSubmit={saveTemplate}>
            <label>
              <strong>模板名称</strong>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              <strong>问题类型</strong>
              <select
                value={form.problemType}
                onChange={(event) => setForm({ ...form, problemType: event.target.value as TaskSuggestionProblemType })}
              >
                {Object.entries(problemTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <strong>排序</strong>
              <input
                type="number"
                value={form.sortWeight}
                onChange={(event) => setForm({ ...form, sortWeight: Number(event.target.value) })}
              />
            </label>
            <label>
              <strong>状态</strong>
              <select
                value={form.enabled ? 'enabled' : 'disabled'}
                onChange={(event) => setForm({ ...form, enabled: event.target.value === 'enabled' })}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label className="task-template-content">
              <strong>建议内容</strong>
              <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            </label>
            <div className="task-template-actions">
              <button className="excel-clear-button primary-action" type="submit">保存模板</button>
              <button
                className="excel-clear-button"
                type="button"
                onClick={() => {
                  setEditingId('');
                  setForm(emptyForm);
                  setMessage('已取消编辑。');
                }}
              >
                取消编辑
              </button>
            </div>
          </form>
        </section>
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>模板预览</h2>
            <p>当前启用模板会在风险诊断中心创建任务时优先带入。</p>
          </div>
          <span>{templates.filter((template) => template.enabled).length} 个启用</span>
        </header>
        <div className="task-template-preview-list">
          {templates.map((template) => (
            <section key={template.id} className="task-template-preview">
              <header>
                <strong>{template.name}</strong>
                <span>{problemTypeLabels[template.problemType]} / {template.enabled ? '启用' : '停用'}</span>
              </header>
              <p>{template.content}</p>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}

export default TaskSuggestionsPage;
