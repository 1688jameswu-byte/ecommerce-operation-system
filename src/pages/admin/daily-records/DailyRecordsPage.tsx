import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { dailyRecordsDataSource } from '../../../data-source/dailyRecordsDataSource';
import type { CurrentUser } from '../../../types/auth';
import type {
  DailyRecord,
  DailyRecordBusinessCategory,
  DailyRecordImportance,
  DailyRecordInput,
  DailyRecordType,
} from '../../../types/dailyRecords';
import './dailyRecords.css';

const businessCategoryOptions: DailyRecordBusinessCategory[] = ['TEMU', '1688', '独立站', '运营管理', '员工管理', '系统开发', '产品供应链', '其他'];
const recordTypeOptions: DailyRecordType[] = ['工作动作', '想法', '问题', '决策', '待办', '复盘', '系统需求', '员工沟通'];
const importanceOptions: DailyRecordImportance[] = ['普通', '重要'];

const reviewQuestions = [
  '今天做了什么重要动作？',
  '今天有什么重要想法？',
  '今天发现了什么问题？',
  '今天做了什么决定？',
  '哪些内容以后希望AI重点记住？',
];

const emptyForm: DailyRecordInput = {
  content: '',
  businessCategory: 'TEMU',
  recordType: '工作动作',
  importance: '普通',
  aiMemoryEnabled: true,
  aiMemoryNote: '',
  sourceDevice: '电脑端',
};

interface DailyRecordsPageProps {
  currentUser: CurrentUser;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function summarizeContent(value: string) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 120)}...` : text || '-';
}

function canDeleteDailyRecord(currentUser: CurrentUser) {
  const roleCode = String(currentUser.roleCode ?? '').toLowerCase();
  return currentUser.role === 'admin' || roleCode.includes('boss') || currentUser.permissionKeys?.includes('daily-records.manage');
}

function DailyRecordsPage({ currentUser }: DailyRecordsPageProps) {
  const [form, setForm] = useState<DailyRecordInput>(() => ({
    ...emptyForm,
    sourceDevice: typeof window !== 'undefined' && isMobileDevice() ? '手机端' : '电脑端',
  }));
  const [filters, setFilters] = useState({
    dateFrom: formatDateKey(),
    dateTo: formatDateKey(),
    businessCategory: '',
    recordType: '',
    keyword: '',
    importance: '',
    aiMemoryEnabled: '',
  });
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DailyRecord | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAnswers, setReviewAnswers] = useState<string[]>(() => reviewQuestions.map(() => ''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canDelete = canDeleteDailyRecord(currentUser);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const todayRecords = useMemo(
    () => records.filter((record) => String(record.recordDate).slice(0, 10) === formatDateKey()),
    [records],
  );

  async function loadRecords(nextPage = page) {
    setLoading(true);
    setError('');
    try {
      const data = await dailyRecordsDataSource.loadPage({
        ...filters,
        page: nextPage,
        pageSize,
      });
      setRecords(data.records);
      setTotal(data.total);
      setPage(data.page);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords(1);
  }, []);

  function resetForm() {
    setForm({
      ...emptyForm,
      sourceDevice: isMobileDevice() ? '手机端' : '电脑端',
    });
    setFiles([]);
    setEditingRecord(null);
  }

  function updateForm<K extends keyof DailyRecordInput>(key: K, value: DailyRecordInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
  }

  async function uploadFiles(recordId: string) {
    for (const file of files) {
      await dailyRecordsDataSource.uploadAttachment(recordId, file);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.content.trim()) {
      setError('请先填写记录内容');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        recordDate: form.recordDate || formatDateKey(),
        content: form.content.trim(),
        aiMemoryNote: form.aiMemoryNote?.trim(),
      };
      const saved = editingRecord
        ? await dailyRecordsDataSource.update(editingRecord.id, payload)
        : await dailyRecordsDataSource.create(payload);
      if (files.length > 0) {
        await uploadFiles(saved.id);
      }
      setMessage(editingRecord ? '记录已更新。' : '记录已保存。');
      resetForm();
      await loadRecords(1);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(record: DailyRecord) {
    setEditingRecord(record);
    setViewingRecord(null);
    setFiles([]);
    setForm({
      recordDate: String(record.recordDate).slice(0, 10),
      content: record.content,
      businessCategory: record.businessCategory,
      recordType: record.recordType,
      importance: record.importance,
      aiMemoryEnabled: record.aiMemoryEnabled,
      aiMemoryNote: record.aiMemoryNote ?? '',
      sourceDevice: record.sourceDevice || (isMobileDevice() ? '手机端' : '电脑端'),
      status: record.status,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(record: DailyRecord) {
    if (!window.confirm('确认删除这条每日记录？删除后不会在列表中显示。')) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await dailyRecordsDataSource.remove(record.id);
      setMessage('记录已删除。');
      await loadRecords(page);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  }

  async function saveReview() {
    const lines = reviewQuestions
      .map((question, index) => {
        const answer = reviewAnswers[index].trim();
        return answer ? `${index + 1}. ${question}\n${answer}` : '';
      })
      .filter(Boolean);
    if (lines.length === 0) {
      setError('请至少填写一项今日整理内容');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await dailyRecordsDataSource.create({
        recordDate: formatDateKey(),
        content: lines.join('\n\n'),
        businessCategory: '运营管理',
        recordType: '复盘',
        importance: '重要',
        aiMemoryEnabled: true,
        aiMemoryNote: reviewAnswers[4]?.trim(),
        sourceDevice: isMobileDevice() ? '手机端' : '电脑端',
      });
      setReviewAnswers(reviewQuestions.map(() => ''));
      setReviewOpen(false);
      setMessage('今日整理已保存为复盘记录。');
      await loadRecords(1);
    } catch (reviewError) {
      setError(getErrorMessage(reviewError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="daily-records-page">
      <form className="daily-record-quick-panel" onSubmit={handleSubmit}>
        <textarea
          value={form.content}
          onChange={(event) => updateForm('content', event.target.value)}
          placeholder="今天做了什么？有什么想法、判断、问题或决策？"
          autoFocus
        />

        <div className="daily-record-controls">
          <label>
            业务分类
            <select value={form.businessCategory} onChange={(event) => updateForm('businessCategory', event.target.value as DailyRecordBusinessCategory)}>
              {businessCategoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            记录类型
            <select value={form.recordType} onChange={(event) => updateForm('recordType', event.target.value as DailyRecordType)}>
              {recordTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            重要程度
            <select value={form.importance} onChange={(event) => updateForm('importance', event.target.value as DailyRecordImportance)}>
              {importanceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            进入AI记忆
            <select value={form.aiMemoryEnabled ? 'true' : 'false'} onChange={(event) => updateForm('aiMemoryEnabled', event.target.value === 'true')}>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label className="daily-record-upload">
            上传图片
            <input type="file" accept="image/*" multiple onChange={handleFilesChange} />
            <span>{files.length > 0 ? `${files.length} 张图片` : '选择图片'}</span>
          </label>
          <div className="daily-record-actions">
            {editingRecord && <button type="button" onClick={resetForm} disabled={saving}>取消编辑</button>}
            <button type="submit" className="daily-record-primary" disabled={saving}>
              {saving ? '保存中...' : editingRecord ? '保存修改' : '保存记录'}
            </button>
          </div>
        </div>

        {message && <p className="daily-record-message">{message}</p>}
        {error && <p className="daily-record-error">{error}</p>}
      </form>

      <section className="daily-record-review-panel">
        <div>
          <h2>今日整理</h2>
          <p>把今天重要内容收束成一条复盘记录。</p>
        </div>
        <button type="button" className="daily-record-primary" onClick={() => setReviewOpen((current) => !current)}>
          整理今日记录
        </button>
      </section>

      {reviewOpen && (
        <section className="daily-record-review-form">
          {reviewQuestions.map((question, index) => (
            <label key={question}>
              {question}
              <textarea
                value={reviewAnswers[index]}
                onChange={(event) => setReviewAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
              />
            </label>
          ))}
          <div className="daily-record-actions">
            <button type="button" onClick={() => setReviewOpen(false)} disabled={saving}>关闭</button>
            <button type="button" className="daily-record-primary" onClick={() => void saveReview()} disabled={saving}>保存整理</button>
          </div>
        </section>
      )}

      <section className="daily-record-list-panel">
        <header>
          <div>
            <h2>记录列表</h2>
            <p>今日 {todayRecords.length} 条，共 {total} 条</p>
          </div>
        </header>

        <div className="daily-record-filters">
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
          <select value={filters.businessCategory} onChange={(event) => setFilters((current) => ({ ...current, businessCategory: event.target.value }))}>
            <option value="">全部业务</option>
            {businessCategoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.recordType} onChange={(event) => setFilters((current) => ({ ...current, recordType: event.target.value }))}>
            <option value="">全部类型</option>
            {recordTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.importance} onChange={(event) => setFilters((current) => ({ ...current, importance: event.target.value }))}>
            <option value="">全部重要程度</option>
            {importanceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.aiMemoryEnabled} onChange={(event) => setFilters((current) => ({ ...current, aiMemoryEnabled: event.target.value }))}>
            <option value="">全部AI记忆</option>
            <option value="true">进入AI记忆</option>
            <option value="false">不进入AI记忆</option>
          </select>
          <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="关键词" />
          <button type="button" onClick={() => void loadRecords(1)} disabled={loading}>筛选</button>
        </div>

        <div className="daily-record-list">
          {records.map((record) => (
            <article key={record.id} className={`daily-record-card ${record.importance === '重要' ? 'is-important' : ''}`}>
              <div className="daily-record-card-main">
                <time>{formatDateTime(record.createdAt)}</time>
                <p>{summarizeContent(record.content)}</p>
                {record.attachments.length > 0 && (
                  <div className="daily-record-thumbs">
                    {record.attachments.slice(0, 4).map((attachment) => (
                      <img key={attachment.id} src={attachment.fileUrl} alt={attachment.fileName} />
                    ))}
                  </div>
                )}
              </div>
              <div className="daily-record-meta">
                <span>{record.businessCategory}</span>
                <span>{record.recordType}</span>
                <span>{record.importance}</span>
                <span>{record.aiMemoryEnabled ? 'AI记忆：是' : 'AI记忆：否'}</span>
                <span>{record.sourceDevice || '-'}</span>
              </div>
              <div className="daily-record-card-actions">
                <button type="button" onClick={() => setViewingRecord(record)}>查看</button>
                <button type="button" onClick={() => beginEdit(record)}>编辑</button>
                {canDelete && <button type="button" className="daily-record-danger" onClick={() => void handleDelete(record)} disabled={saving}>删除</button>}
              </div>
            </article>
          ))}
          {!loading && records.length === 0 && <div className="daily-record-empty">暂无记录</div>}
          {loading && <div className="daily-record-empty">加载中...</div>}
        </div>

        <div className="daily-record-pagination">
          <button type="button" disabled={page <= 1 || loading} onClick={() => void loadRecords(page - 1)}>上一页</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => void loadRecords(page + 1)}>下一页</button>
        </div>
      </section>

      {viewingRecord && (
        <div className="daily-record-modal-backdrop" role="presentation">
          <section className="daily-record-modal">
            <header>
              <div>
                <h2>查看记录</h2>
                <p>{formatDateTime(viewingRecord.createdAt)} / {viewingRecord.businessCategory} / {viewingRecord.recordType}</p>
              </div>
              <button type="button" onClick={() => setViewingRecord(null)}>关闭</button>
            </header>
            <pre>{viewingRecord.content}</pre>
            {viewingRecord.aiMemoryNote && (
              <div className="daily-record-memory-note">
                <strong>AI记忆备注</strong>
                <p>{viewingRecord.aiMemoryNote}</p>
              </div>
            )}
            {viewingRecord.attachments.length > 0 && (
              <div className="daily-record-modal-images">
                {viewingRecord.attachments.map((attachment) => (
                  <img key={attachment.id} src={attachment.fileUrl} alt={attachment.fileName} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default DailyRecordsPage;
