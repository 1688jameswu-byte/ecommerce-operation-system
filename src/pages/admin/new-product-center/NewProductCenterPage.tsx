import { useEffect, useMemo, useState } from 'react';
import { newProductCenterDataSource, type DashboardResponse, type ProductDetailResponse, type ProductSnapshot, type RecommendationRecord } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  return `¥ ${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatRatio(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function MetricCards({ summary }: { summary: Record<string, number | null> }) {
  const items = [
    ['今日新品', summary.todayNewCount],
    ['近7天新品', summary.recent7NewCount],
    ['近7天出单率', formatRatio(summary.recent7OrderedRate)],
    ['近30天新品', summary.recent30NewCount],
    ['近30天出单率', formatRatio(summary.recent30OrderedRate)],
    ['广告花费', formatMoney(summary.adSpend)],
    ['广告销售额', formatMoney(summary.adSalesAmount)],
    ['ROAS', summary.roas === null ? '-' : Number(summary.roas).toFixed(2)],
    ['亏损新品', summary.lossNewCount],
    ['高潜新品', summary.highPotentialCount],
  ];
  return <div className="npc-metric-grid">{items.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}

function RankingTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <article className="excel-record-panel npc-panel">
      <h2>{title}</h2>
      <div className="npc-table-wrap">
        <table>
          <thead><tr><th>名称</th><th>新品数</th><th>订单数</th><th>广告花费</th><th>广告销售额</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>{String(row.operatorName || row.storeName || '-')}</td>
                <td>{String(row.newCount || 0)}</td>
                <td>{String(row.orderCount || 0)}</td>
                <td>{formatMoney(row.adSpend)}</td>
                <td>{formatMoney(row.adSalesAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DashboardView({ mode }: { mode: 'boss' | 'operator' }) {
  const [snapshotDate, setSnapshotDate] = useState(today());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const query = `?snapshotDate=${snapshotDate}`;
    const loader = mode === 'boss' ? newProductCenterDataSource.getBossDashboard(query) : newProductCenterDataSource.getOperatorDashboard(query);
    loader.then(setData).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [mode, snapshotDate]);

  return (
    <section className="npc-page">
      <div className="npc-toolbar">
        <label>统计日期<input type="date" value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} /></label>
        <button type="button" onClick={() => newProductCenterDataSource.rebuildSnapshot(snapshotDate).then(() => window.location.reload())}>重算快照</button>
      </div>
      {message && <div className="excel-import-error">{message}</div>}
      {data && <MetricCards summary={data.summary} />}
      {mode === 'operator' && <RecommendationStrip />}
      <div className="npc-two-columns">
        <RankingTable title="运营排名" rows={data?.operatorRanking ?? []} />
        <RankingTable title="店铺排名" rows={data?.storeRanking ?? []} />
      </div>
    </section>
  );
}

function RecommendationStrip() {
  const [records, setRecords] = useState<RecommendationRecord[]>([]);
  useEffect(() => {
    newProductCenterDataSource.getRecommendations('?status=PENDING&pageSize=5').then((data) => setRecords(data.records)).catch(() => setRecords([]));
  }, []);
  return (
    <article className="excel-record-panel npc-panel">
      <h2>我的今日建议</h2>
      <div className="npc-recommendation-strip">
        {records.map((item) => <span key={item.id}>{item.productName}：{item.recommendationText}</span>)}
        {records.length === 0 && <span>暂无待处理建议</span>}
      </div>
    </article>
  );
}

function ProductsView() {
  const [snapshotDate, setSnapshotDate] = useState(today());
  const [tag, setTag] = useState('');
  const [isAdEnabled, setIsAdEnabled] = useState('');
  const [isOrdered, setIsOrdered] = useState('');
  const [data, setData] = useState<{ records: ProductSnapshot[]; total: number }>({ records: [], total: 0 });
  const query = useMemo(() => {
    const params = new URLSearchParams({ snapshotDate, pageSize: '50' });
    if (tag) params.set('productTag', tag);
    if (isAdEnabled) params.set('isAdEnabled', isAdEnabled);
    if (isOrdered) params.set('isOrdered', isOrdered);
    return `?${params.toString()}`;
  }, [isAdEnabled, isOrdered, snapshotDate, tag]);
  useEffect(() => {
    newProductCenterDataSource.getProducts(query).then(setData).catch(() => setData({ records: [], total: 0 } as any));
  }, [query]);
  return (
    <section className="npc-page">
      <div className="npc-toolbar">
        <label>统计日期<input type="date" value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} /></label>
        <label>商品标签<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">全部</option>{['高潜新品','烧钱无单','有流量无转化','加购未成交','低曝光新品','高费比新品','自然起量','普通新品'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>广告<select value={isAdEnabled} onChange={(event) => setIsAdEnabled(event.target.value)}><option value="">全部</option><option value="true">已开广告</option><option value="false">未开广告</option></select></label>
        <label>出单<select value={isOrdered} onChange={(event) => setIsOrdered(event.target.value)}><option value="">全部</option><option value="true">已出单</option><option value="false">未出单</option></select></label>
      </div>
      <ProductTable records={data.records} total={data.total} />
    </section>
  );
}

function ProductTable({ records, total }: { records: ProductSnapshot[]; total: number }) {
  return (
    <article className="excel-record-panel npc-panel">
      <header className="npc-panel-header"><h2>新品列表</h2><span>{total} 条</span></header>
      <div className="npc-table-wrap">
        <table>
          <thead><tr><th>商品</th><th>店铺/运营</th><th>上架</th><th>广告</th><th>订单</th><th>ROAS/ACOS</th><th>标签</th><th>建议</th><th>操作</th></tr></thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id}>
                <td><div className="npc-product-cell">{item.productImageUrl && <img src={item.productImageUrl} alt="" />}<span><strong>{item.productName || '-'}</strong><small>{item.temuProductId} / {item.temuSpuId || '-'}</small></span></div></td>
                <td>{item.storeName}<br /><small>{item.operatorName || '-'}</small></td>
                <td>{String(item.firstOnlineAt || '').slice(0, 10)}<br /><small>{item.daysOnline} 天</small></td>
                <td>{formatMoney(item.adSpend)}<br /><small>{item.clicks} 点击 / {item.addToCartCount} 加购</small></td>
                <td>{item.orderCount} 单<br /><small>{formatMoney(item.orderSalesAmount)}</small></td>
                <td>{item.roas === null ? '-' : Number(item.roas).toFixed(2)}<br /><small>{item.acos === null ? '-' : formatRatio(item.acos)}</small></td>
                <td><span className="npc-tag">{item.productTag || '普通新品'}</span></td>
                <td>{item.latestRecommendationText || '-'}</td>
                <td><a href={`/new-product-center/products/${item.productId}`}>查看详情</a></td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={9}>暂无新品快照，请先导入商品信息或重算快照。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RecommendationsView() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ records: RecommendationRecord[]; total: number }>({ records: [], total: 0 });
  const refresh = () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    newProductCenterDataSource.getRecommendations(`?${params.toString()}`).then(setData).catch(() => setData({ records: [], total: 0 } as any));
  };
  useEffect(refresh, [status]);
  const handle = async (item: RecommendationRecord, nextStatus: string) => {
    await newProductCenterDataSource.handleRecommendation(item.id, { status: nextStatus });
    refresh();
  };
  return (
    <section className="npc-page">
      <div className="npc-toolbar">
        <label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{['PENDING','ACCEPTED','IGNORED','EXECUTED','EXPIRED'].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header"><h2>广告建议中心</h2><span>{data.total} 条</span></header>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>商品</th><th>标签</th><th>指标</th><th>建议</th><th>原因</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {data.records.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}<br /><small>{item.storeName} / {item.operatorName || '-'}</small></td>
                  <td><span className="npc-tag">{item.productTag || item.problemType}</span></td>
                  <td>{formatMoney(item.adSpend)}<br /><small>ROAS {item.roas === null ? '-' : Number(item.roas).toFixed(2)}</small></td>
                  <td><strong>{item.recommendationText}</strong><br /><small>{item.suggestedAction}</small></td>
                  <td>{item.reasonText}</td>
                  <td>{item.status}</td>
                  <td className="npc-actions">
                    <button type="button" onClick={() => void handle(item, 'ACCEPTED')}>采纳</button>
                    <button type="button" onClick={() => void handle(item, 'IGNORED')}>忽略</button>
                    <button type="button" onClick={() => void handle(item, 'EXECUTED')}>已执行</button>
                    <a href={`/new-product-center/products/${item.productId}`}>详情</a>
                  </td>
                </tr>
              ))}
              {data.records.length === 0 && <tr><td colSpan={7}>暂无广告建议。</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function DetailView({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductDetailResponse | null>(null);
  useEffect(() => {
    newProductCenterDataSource.getProductDetail(productId).then(setData).catch(() => setData(null));
  }, [productId]);
  if (!data?.product) return <section className="excel-record-panel npc-panel">商品不存在或暂无数据。</section>;
  return (
    <section className="npc-page">
      <article className="excel-record-panel npc-panel">
        <h2>{String(data.product.productName || '商品详情')}</h2>
        <p>{String(data.product.storeName || '-')} / {String(data.product.operatorName || '-')} / {String(data.product.temuProductId || '-')}</p>
      </article>
      <ProductTable records={data.snapshots.slice(0, 1)} total={data.snapshots.length} />
      <div className="npc-two-columns">
        <SimpleTable title="订单趋势" rows={data.orders} columns={['orderDate','orderCount','quantity','salesAmount']} />
        <SimpleTable title="广告趋势" rows={data.ads} columns={['reportDate','adSpend','promoSalesAmount','promoClicks','promoSubOrderCount']} />
      </div>
      <SimpleTable title="建议历史" rows={data.recommendations} columns={['recommendationDate','recommendationType','priority','recommendationText','status']} />
      <SimpleTable title="商品时间线" rows={data.timeline} columns={['eventTime','eventType','title','description']} />
    </section>
  );
}

function SimpleTable({ title, rows, columns }: { title: string; rows: Array<Record<string, any>>; columns: string[] }) {
  return (
    <article className="excel-record-panel npc-panel">
      <h2>{title}</h2>
      <div className="npc-table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '-')}</td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={columns.length}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function NewProductCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const path = window.location.pathname;
  if (path === '/new-product-center/boss-dashboard') return <DashboardView mode="boss" />;
  if (path === '/new-product-center/operator-dashboard') return <DashboardView mode="operator" />;
  if (path === '/new-product-center/ad-recommendations') return <RecommendationsView />;
  if (path.startsWith('/new-product-center/products/')) return <DetailView productId={decodeURIComponent(path.replace('/new-product-center/products/', ''))} />;
  return <ProductsView />;
}
