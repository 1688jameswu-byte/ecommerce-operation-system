import type { RankingItem } from '../../types/dashboard';
import Panel from './Panel';

interface RankingPanelProps {
  title: string;
  period: string;
  items: RankingItem[];
  showTopThreeBadge: boolean;
  showGrowth: boolean;
}

function formatRankingValue(item: RankingItem) {
  const isCurrency = item.unit === '¥';
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: isCurrency ? 2 : 0,
    maximumFractionDigits: isCurrency ? 2 : 0,
  });

  return `${isCurrency ? '¥ ' : ''}${formatter.format(item.value)}${!isCurrency && item.unit ? item.unit : ''}`;
}

function getRankLabel(rank: number, showTopThreeBadge: boolean) {
  if (!showTopThreeBadge || rank > 3) {
    return String(rank);
  }

  return ['冠', '亚', '季'][rank - 1];
}

function RankingPanel({ title, period, items, showTopThreeBadge, showGrowth }: RankingPanelProps) {
  return (
    <Panel title={title} extra={<span>{period}</span>}>
      <ol className="ranking-list">
        {items.map((item) => (
          <li
            key={`${title}-${item.rank}-${item.name}`}
            className={`ranking-row ${showGrowth ? 'ranking-row-has-growth' : ''}`}
          >
            <span className={`ranking-rank ranking-rank-${item.rank}`}>
              {getRankLabel(item.rank, showTopThreeBadge)}
            </span>
            <span className="ranking-name">{item.name}</span>
            <span className="ranking-value">{formatRankingValue(item)}</span>
            {showGrowth && typeof item.growthPercent === 'number' && (
              <span className={`ranking-growth ranking-growth-${item.trend ?? 'flat'}`}>
                {item.growthPercent > 0 ? '+' : ''}
                {item.growthPercent.toFixed(2)}%
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export default RankingPanel;
