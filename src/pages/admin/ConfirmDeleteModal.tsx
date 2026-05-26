import type { ReactNode } from 'react';

interface ConfirmDeleteModalProps {
  children?: ReactNode;
  confirmText?: string;
  description?: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
}

function ConfirmDeleteModal({
  children,
  confirmText = '确认删除',
  description = '删除后不可恢复。',
  isBusy = false,
  onCancel,
  onConfirm,
  title = '确认删除该数据吗？',
}: ConfirmDeleteModalProps) {
  return (
    <div className="delete-modal-backdrop" role="presentation">
      <section className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
        <h2 id="confirm-delete-title">{title}</h2>
        <p>{description}</p>
        {children && <div className="delete-modal-info">{children}</div>}
        <div className="delete-modal-actions">
          <button type="button" className="delete-cancel-button" autoFocus disabled={isBusy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="delete-confirm-button" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? '删除中...' : confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDeleteModal;
