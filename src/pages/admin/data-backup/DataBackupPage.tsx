import { useEffect, useState } from 'react';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

interface BackupResult {
  path: string;
  fileCount: number;
}

interface BackupItem extends BackupResult {
  name: string;
  createdAt: string;
}

async function createBackup(): Promise<BackupResult> {
  const response = await fetch('/api/data-backup', { method: 'POST' });
  const data = await response.json().catch(() => null) as (BackupResult & { error?: string }) | null;

  if (!response.ok || !data) {
    throw new Error(data?.error || '备份接口调用失败');
  }

  return {
    path: data.path,
    fileCount: data.fileCount,
  };
}

async function loadBackups(): Promise<BackupItem[]> {
  const response = await fetch(`/api/data-backup?t=${Date.now()}`);
  const data = await response.json().catch(() => null) as { backups?: BackupItem[]; error?: string } | null;

  if (!response.ok || !data) {
    throw new Error(data?.error || '备份列表读取失败');
  }

  return data.backups ?? [];
}

async function deleteBackup(name: string) {
  const response = await fetch(`/api/data-backup/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => null) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error || '备份删除失败');
  }
}

function DataBackupPage() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [deletingName, setDeletingName] = useState('');
  const [deleteBackupItem, setDeleteBackupItem] = useState<BackupItem | null>(null);
  const [error, setError] = useState('');

  const refreshBackups = async () => {
    setBackups(await loadBackups());
  };

  useEffect(() => {
    void refreshBackups().catch((backupError) => {
      setError(backupError instanceof Error ? backupError.message : '备份列表读取失败');
    });
  }, []);

  const handleBackup = async () => {
    setIsBackingUp(true);
    setError('');
    setResult(null);
    setDeleteBackupItem(null);

    try {
      setResult(await createBackup());
      await refreshBackups();
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : '备份失败');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDelete = async (backup: BackupItem) => {

    setDeletingName(backup.name);
    setError('');

    try {
      await deleteBackup(backup.name);
      await refreshBackups();
      setResult(null);
      setDeleteBackupItem(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '备份删除失败');
    } finally {
      setDeletingName('');
    }
  };

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel data-backup-panel">
        <header>
          <div>
            <h2>本地数据备份</h2>
            <p>备份 data/raw、data/summary、data/analysis 和 data 根目录下的基础 JSON 文件。</p>
          </div>
          <button className="excel-clear-button primary-action" type="button" disabled={isBackingUp} onClick={handleBackup}>
            {isBackingUp ? '备份中...' : '立即备份'}
          </button>
        </header>

        {result && (
          <section className="backup-result success">
            <strong>备份成功</strong>
            <span>备份路径：{result.path}</span>
            <span>备份文件数量：{result.fileCount}</span>
          </section>
        )}

        {error && (
          <section className="backup-result error">
            <strong>操作失败</strong>
            <span>{error}</span>
          </section>
        )}
      </article>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>已有备份</h2>
            <p>只允许删除 data/backups 下名称以 backup- 开头的备份目录。</p>
          </div>
          <span>{backups.length} 个备份</span>
        </header>
        <div className="import-record-table-wrap">
          <table className="import-record-table backup-table">
            <thead>
              <tr>
                <th>备份名称</th>
                <th>文件数量</th>
                <th>备份路径</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.name}>
                  <td><strong>{backup.name}</strong></td>
                  <td>{backup.fileCount}</td>
                  <td><span className="backup-path">{backup.path}</span></td>
                  <td>
                    <button type="button" className="batch-delete-button" disabled={deletingName === backup.name} onClick={() => setDeleteBackupItem(backup)}>
                      {deletingName === backup.name ? '删除中...' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {backups.length === 0 && <div className="import-record-empty">暂无备份</div>}
        </div>
      </article>
      {deleteBackupItem && (
        <ConfirmDeleteModal isBusy={deletingName === deleteBackupItem.name} onCancel={() => setDeleteBackupItem(null)} onConfirm={() => void handleDelete(deleteBackupItem)}>
          <span>备份：{deleteBackupItem.name}</span>
        </ConfirmDeleteModal>
      )}
    </section>
  );
}

export default DataBackupPage;

