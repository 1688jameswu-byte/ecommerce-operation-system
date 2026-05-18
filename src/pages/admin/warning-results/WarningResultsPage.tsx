import { useEffect, useState } from 'react';
import {
  metricFieldLabels,
  subscribeTrafficConversionChange,
  trafficConversionDataSource,
  trafficGrowthTypeLabels,
  trafficTypeLabels,
} from '../../../data-source/trafficConversionDataSource';
import type {
  TrafficAnalysisItem,
  TrafficAnalysisResultType,
  TrafficGrowthOpportunity,
  TrafficWarningLevel,
  TrafficWarningResult,
  TrafficWarningType,
} from '../../../types/traffic';

const levelLabels: Record<TrafficWarningLevel | 'normal' | 'opportunity', string> = {
  warning: '警告',
  critical: '严重',
  insufficient: '数据不足',
  normal: '正常',
  opportunity: '机会',
};

const resultTypeLabels: Record<TrafficAnalysisResultType, string> = {
  risk: '风险',
  opportunity: '机会',
  insufficient: '数据不足',
  normal: '正常',
};

function riskSort(first: TrafficWarningResult, second: TrafficWarningResult) {
  const levelRank = { critical: 0, warning: 1, insufficient: 2 };
  const typeRank: Record<TrafficWarningType, number> = { deal: 0, conversion: 1, traffic: 2 };
  return levelRank[first.level] - levelRank[second.level] || second.dropRate - first.dropRate || typeRank[first.type] - typeRank[second.type];
}

function loadAnalysisData() {
  return {
    riskResults: trafficConversionDataSource.computeResults().filter((item) => item.level !== 'insufficient').sort(riskSort),
    growthResults: trafficConversionDataSource.computeGrowthOpportunities(999),
    analysisItems: trafficConversionDataSource.computeAnalysisItems(),
  };
}

function WarningResultsPage() {
  const [data, setData] = useState<{
    riskResults: TrafficWarningResult[];
    growthResults: TrafficGrowthOpportunity[];
    analysisItems: TrafficAnalysisItem[];
  }>(() => loadAnalysisData());
  const [dateFilter, setDateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');

  useEffect(() => {
    const refresh = () => setData(loadAnalysisData());
    refresh();
    return subscribeTrafficConversionChange(refresh);
  }, []);

  const { riskResults, growthResults, analysisItems } = data;
  const filtered = analysisItems.filter((item) =>
    (!dateFilter || item.date === dateFilter) &&
    (!storeFilter || item.storeName === storeFilter) &&
    (!typeFilter || item.type === typeFilter) &&
    (!resultFilter || item.resultType === resultFilter),
  );
  const dates = Array.from(new Set(analysisItems.map((item) => item.date))).sort().reverse();
  const stores = Array.from(new Set(analysisItems.map((item) => item.storeName))).sort();
  const maxGrowth = growthResults[0];
  const maxDrop = riskResults[0];

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article>
          <span>风险店铺数</span>
          <strong>{new Set(riskResults.map((item) => item.storeName)).size}</strong>
        </article>
        <article>
          <span>增长店铺数</span>
          <strong>{new Set(growthResults.map((item) => item.storeName)).size}</strong>
        </article>
        <article>
          <span>严重异常数</span>
          <strong>{riskResults.filter((item) => item.level === 'critical').length}</strong>
        </article>
        <article>
          <span>最大增长店铺</span>
          <strong>{maxGrowth ? `${maxGrowth.storeName} ${maxGrowth.growthRate.toFixed(2)}%` : '-'}</strong>
        </article>
        <article>
          <span>最大下降店铺</span>
          <strong>{maxDrop ? `${maxDrop.storeName} ${maxDrop.dropRate.toFixed(2)}%` : '-'}</strong>
        </article>
      </section>

      <section className="analysis-two-column">
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>风险预警</h2>
              <p>只展示真正触发阈值的下降数据。</p>
            </div>
            <span>{riskResults.length} 条</span>
          </header>
          <div className="analysis-card-list">
            {riskResults.slice(0, 8).map((item) => (
              <section key={item.id} className={`analysis-card analysis-risk-${item.level}`}>
                <strong>{trafficTypeLabels[item.type]}</strong>
                <span>{item.storeName}</span>
                <p>{item.content}</p>
                <em>{levelLabels[item.level]} · {item.dropRate.toFixed(2)}%</em>
              </section>
            ))}
            {riskResults.length === 0 && <div className="import-record-empty">暂无风险预警</div>}
          </div>
        </article>

        <article className="excel-record-panel">
          <header>
            <div>
              <h2>增长机会</h2>
              <p>只展示超过增长规则阈值的上涨数据。</p>
            </div>
            <span>{growthResults.length} 条</span>
          </header>
          <div className="analysis-card-list">
            {growthResults.slice(0, 8).map((item) => (
              <section key={item.id} className="analysis-card analysis-growth">
                <strong>{trafficGrowthTypeLabels[item.type]}</strong>
                <span>{item.storeName}</span>
                <p>{item.content}</p>
                <em>{item.growthRate.toFixed(2)}%</em>
              </section>
            ))}
            {growthResults.length === 0 && <div className="import-record-empty">暂无增长机会</div>}
          </div>
        </article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>详细分析列表</h2>
            <p>包含风险、机会、数据不足和正常结果。</p>
          </div>
          <span>{filtered.length} 条</span>
        </header>
        <section className="import-filter-bar">
          <label>
            日期
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="">全部日期</option>
              {dates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
          </label>
          <label>
            店铺
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">全部店铺</option>
              {stores.map((storeName) => <option key={storeName} value={storeName}>{storeName}</option>)}
            </select>
          </label>
          <label>
            类型
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">全部类型</option>
              {Object.entries(trafficTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            结果
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
              <option value="">全部结果</option>
              {Object.entries(resultTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </section>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>店铺名称</th>
                <th>分析类型</th>
                <th>监控字段</th>
                <th>前30日平均值</th>
                <th>近7日平均值</th>
                <th>变化比例</th>
                <th>结果类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td><strong>{item.storeName}</strong></td>
                  <td>{item.resultType === 'opportunity' ? trafficGrowthTypeLabels[item.type] : trafficTypeLabels[item.type]}</td>
                  <td>{metricFieldLabels[item.metricField]}</td>
                  <td>{item.previous30Avg.toFixed(4)}</td>
                  <td>{item.recent7Avg.toFixed(4)}</td>
                  <td>{item.changeRate.toFixed(2)}%</td>
                  <td>
                    <span className={`import-status analysis-result-${item.resultType}`}>{resultTypeLabels[item.resultType]}</span>
                  </td>
                  <td>{item.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="import-record-empty">暂无详细分析数据</div>}
        </div>
      </article>
    </section>
  );
}

export default WarningResultsPage;
