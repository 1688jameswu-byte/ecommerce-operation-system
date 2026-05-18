import type { GrowthOpportunityItem } from '../../types/dashboard';

interface GrowthOpportunityListProps {
  items: GrowthOpportunityItem[];
}

const typeLabels: Record<GrowthOpportunityItem['type'], string> = {
  traffic: '流量增长',
  conversion: '转化增长',
  deal: '成交增长',
};

function GrowthOpportunityList({ items }: GrowthOpportunityListProps) {
  if (items.length === 0) {
    return <div className="growth-empty">暂无今日增长店铺</div>;
  }

  return (
    <ul className="growth-list">
      {items.map((item) => (
        <li key={item.id} className={`growth-row growth-type-${item.type}`}>
          <span className="growth-type">{typeLabels[item.type]}</span>
          <span className="growth-store">{item.storeName}</span>
          <span className="growth-content">{item.content}</span>
          <strong>{item.growthRate.toFixed(2)}%</strong>
        </li>
      ))}
    </ul>
  );
}

export default GrowthOpportunityList;
