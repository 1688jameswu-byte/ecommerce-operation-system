import { useState } from 'react';
import { type ImportPreview, type ImportResult, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';

const fieldLabels: Record<string, string> = {
  storeName: '店铺',
  productName: '商品名称',
  temuProductId: '商品ID',
  temuSpuId: 'SPU ID',
  adSpend: '总花费',
  netAdSpend: '净总花费',
  promoSalesAmount: '申报价销售额（推广）',
  promoRoas: '投资回报率ROAS（推广）',
  targetRoas: '自然周目标ROAS（推广）',
  promoSubOrderCount: '子订单数（推广）',
  promoUnitCount: '件数（推广）',
  promoImpressions: '曝光（推广）',
  promoClicks: '点击（推广）',
  promoCtr: '点击率（推广）',
  promoCvr: '转化率（推广）',
  promoAddToCartCount: '加购（推广）',
  globalSalesAmount: '申报价销售额（全域）',
  globalRoas: '投资回报率ROAS（全域）',
  globalSubOrderCount: '子订单数（全域）',
  globalImpressions: '曝光（全域）',
  globalClicks: '点击（全域）',
  globalAddToCartCount: '加入购物车数（全域）',
};

export default function TemuAdReportImportPage() {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [storeName, setStoreName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setMessage('');
    setResult(null);
    try {
      const next = await newProductCenterDataSource.previewAdFile(file);
      setPreview(next);
      setMapping(next.mapping);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setLoading(true);
    setMessage('');
    try {
      const next = await newProductCenterDataSource.confirmAdImport({
        fileName: preview.fileName,
        rows: preview.rows,
        mapping,
        reportDate,
        storeName,
      });
      setResult(next);
      setMessage(`导入完成：成功 ${next.successRows} 行，失败 ${next.errorRows} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="npc-page">
      <article className="excel-upload-panel">
        <div>
          <span className="npc-pill">TEMU广告数据导入</span>
          <h2>上传商品推广报表 Excel</h2>
          <p>写入 PostgreSQL 的 temu_ad_product_daily，不写 JSON。导入完成后自动重算新品快照和广告建议。</p>
        </div>
        <div className="npc-import-controls">
          <label>报表日期<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
          <label>默认店铺
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="报表内有店铺字段可留空" />
          </label>
        </div>
        <label className="excel-upload-box">
          <input type="file" accept=".xlsx,.xls,.csv" disabled={loading || !reportDate} onChange={(event) => void onFile(event.target.files?.[0])} />
          <strong>{loading ? '处理中...' : '选择或拖入 Excel 文件'}</strong>
          <span>支持推广、全域、净推广字段映射</span>
        </label>
      </article>

      {message && <div className="excel-import-error">{message}</div>}

      {preview && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header">
            <div>
              <h2>字段映射</h2>
              <p>{preview.fileName}，共 {preview.totalRows} 行，预览前 20 行。</p>
            </div>
            <button type="button" disabled={loading || !reportDate} onClick={confirm}>确认导入 PostgreSQL</button>
          </header>
          <div className="npc-mapping-grid">
            {Object.entries(fieldLabels).map(([field, label]) => (
              <label key={field}>
                <span>{label}</span>
                <select value={mapping[field] || ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
                  <option value="">不导入</option>
                  {preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="npc-table-wrap">
            <table>
              <thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {preview.previewRows.map((row, index) => (
                  <tr key={index}>{preview.headers.map((header) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {result && result.errors.length > 0 && (
        <article className="excel-record-panel npc-panel">
          <h2>失败行</h2>
          <div className="npc-table-wrap">
            <table>
              <thead><tr><th>行号</th><th>原因</th></tr></thead>
              <tbody>{result.errors.map((error) => <tr key={error.rowNumber}><td>{error.rowNumber}</td><td>{error.errorReason}</td></tr>)}</tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}
