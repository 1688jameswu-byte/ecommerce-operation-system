import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}

function Panel({ title, extra, className = '', children }: PanelProps) {
  return (
    <section className={`dashboard-panel ${className}`}>
      <header className="dashboard-panel-header">
        <h2>{title}</h2>
        {extra && <div className="dashboard-panel-extra">{extra}</div>}
      </header>
      <div className="dashboard-panel-body">{children}</div>
    </section>
  );
}

export default Panel;
