import { warningRules } from '../../config/warningRules';
import type { WarningItem, WarningLevel, WarningType } from '../../types/dashboard';

interface WarningListProps {
  warnings: WarningItem[];
}

const levelLabels: Record<WarningLevel, string> = {
  low: '低',
  medium: '中',
  high: '警告',
  critical: '严重',
};

function getWarningRule(type: WarningType) {
  return warningRules.find((item) => item.type === type);
}

function WarningList({ warnings }: WarningListProps) {
  if (warnings.length === 0) {
    return <div className="warning-empty">暂无实时预警</div>;
  }

  return (
    <ul className="warning-list">
      {warnings.map((warning) => {
        const rule = getWarningRule(warning.type);

        return (
          <li key={warning.id} className={`warning-row warning-level-${warning.level}`}>
            <span
              className="warning-type"
              style={{
                borderColor: rule?.color,
                color: rule?.color,
                backgroundColor: `${rule?.color ?? '#1f8fff'}1f`,
              }}
            >
              {rule?.label ?? warning.type}
            </span>
            <span className="warning-store">{warning.storeName}</span>
            <span className="warning-content">{warning.content}</span>
            <span className="warning-level">{levelLabels[warning.level]}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default WarningList;
