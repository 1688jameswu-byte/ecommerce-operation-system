import type { RankingItem } from '../../types/dashboard';
import Panel from './Panel';
import type { CSSProperties } from 'react';

interface RankingPanelProps {
  title: string;
  period: string;
  items: RankingItem[];
  emptyText?: string;
  showTopThreeBadge: boolean;
  showGrowth: boolean;
  autoScroll?: boolean;
  visibleRows?: number;
  compactSalesLayout?: boolean;
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

function RankingPanel({
  title,
  period,
  items,
  emptyText,
  showTopThreeBadge,
  showGrowth,
  autoScroll = false,
  visibleRows = 8,
  compactSalesLayout = false,
}: RankingPanelProps) {
  const shouldAutoScroll = autoScroll && items.length > visibleRows;
  const displayItems = shouldAutoScroll ? [...items, ...items] : items;
  const listStyle = shouldAutoScroll
    ? ({
        '--ranking-visible-rows': visibleRows,
        '--ranking-scroll-duration': `${Math.max(items.length * 2.2, 18)}s`,
      } as CSSProperties)
    : undefined;

  return (
    <Panel title={title} extra={<span>{period}</span>}>
      <div className={`ranking-list-viewport ${shouldAutoScroll ? 'ranking-list-viewport-auto-scroll' : ''}`} style={listStyle}>
        <ol className={`ranking-list ${shouldAutoScroll ? 'ranking-list-auto-scroll' : ''}`}>
          {displayItems.map((item, index) => (
            <li
              key={`${title}-${index}-${item.rank}-${item.name}`}
              className={`ranking-row ${showGrowth ? 'ranking-row-has-growth' : ''} ${
                compactSalesLayout ? 'ranking-row-sales-compact' : ''
              }`}
            >
              <span className={`ranking-rank ranking-rank-${item.rank}`}>
                {getRankLabel(item.rank, showTopThreeBadge)}
              </span>
              <span className="ranking-name" title={item.name}>
                {item.name}
              </span>
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
      </div>
      {items.length === 0 && emptyText && <div className="ranking-empty">{emptyText}</div>}
    </Panel>
  );
}

export default RankingPanel;
