import { useEffect, useState } from 'react';
import { type ImportOverview, type ImportPreview, type ImportResult, type TemuStorageStatus, newProductCenterDataSource } from '../../../data-source/newProductCenterDataSource';

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

function inferStoreNameFromFileName(fileName: string) {
  return fileName.match(/([A-Za-z0-9]+店|[\u4e00-\u9fa5]+店)/)?.[1] || '';
}

export default function TemuAdReportImportPage() {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [storeName, setStoreName] = useState('');
  const [overview, setOverview] = useState<ImportOverview>({ batches: [], records: [] });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [storageError, setStorageError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const refreshOverview = async () => {
    try {
      const [status, records] = await Promise.all([
        newProductCenterDataSource.getTemuStorageStatus(),
        newProductCenterDataSource.getAdImportRecords(),
      ]);
      setStorageStatus(status);
      setStorageError(status.ok ? '' : (status.message || 'PostgreSQL 未连接'));
      setOverview(records);
    } catch (error) {
      setStorageStatus(null);
      setStorageError(error instanceof Error ? error.message : String(error));
      setOverview({ batches: [], records: [] });
    }
  };

  useEffect(() => {
    void refreshOverview();
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setPreviewLoading(true);
    setMessage('');
    setResult(null);
    try {
      const next = await newProductCenterDataSource.previewAdFile(file);
      setPreview(next);
      setMapping(next.mapping);
      setStoreName((current) => current || inferStoreNameFromFileName(file.name));
      setMessage('预览完成，尚未入库；请点击“确认导入 PostgreSQL”。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    if (!mapping.temuProductId) {
      setMessage('当前文件不像 TEMU 广告报表：必须映射商品ID。商品基础信息请使用“商品信息导入”。');
      return;
    }
    if (!mapping.storeName && !storeName.trim()) {
      setMessage('广告报表没有店铺列时，请先填写默认店铺，例如 A店。');
      return;
    }
    setConfirmLoading(true);
    setMessage('');
    try {
      const next = await newProductCenterDataSource.confirmAdImport({
        previewId: preview.previewId,
        fileName: preview.fileName,
        rows: preview.rows || [],
        mapping,
        reportDate,
        storeName,
      });
      setResult(next);
      await refreshOverview();
      setMessage(`导入完成：成功 ${next.successRows} 行，失败 ${next.errorRows} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <section className="npc-page">
      <article className="excel-upload-panel">
        <div>
          <span className="npc-pill">广告数据导入</span>
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
          <input type="file" accept=".xlsx,.xls,.csv" disabled={previewLoading || confirmLoading || !reportDate} onChange={(event) => void onFile(event.target.files?.[0])} />
          <strong>{previewLoading ? '处理中...' : confirmLoading ? '导入中...' : '选择或拖入 Excel 文件'}</strong>
          <span>支持推广、全域、净推广字段映射</span>
        </label>
      </article>

      {message && <div className="excel-import-error">{message}</div>}
      {(storageStatus || storageError) && (
        <div className={storageError ? 'excel-import-error' : 'npc-storage-status'}>
          PostgreSQL 状态：{storageError ? `异常：${storageError}` : `已连接 ${storageStatus?.databaseName || ''}，商品 ${storageStatus?.counts?.products ?? 0}，SKU ${storageStatus?.counts?.skus ?? 0}，广告 ${storageStatus?.counts?.ads ?? 0}，导入批次 ${storageStatus?.counts?.importBatches ?? 0}`}
        </div>
      )}

      {preview && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header">
            <div>
              <h2>字段映射</h2>
              <p>{preview.fileName}，共 {preview.totalRows} 行，预览前 20 行。</p>
            </div>
            <button type="button" disabled={confirmLoading || !reportDate} onClick={confirm}>{confirmLoading ? '导入中...' : '确认导入 PostgreSQL'}</button>
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

      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header">
          <div>
            <h2>PostgreSQL 广告记录</h2>
            <p>刷新页面后从 temu_ad_product_daily 读取，最多显示最近 50 条。</p>
          </div>
          <button type="button" onClick={() => void refreshOverview()}>刷新</button>
        </header>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>日期</th><th>店铺</th><th>商品ID</th><th>SPU ID</th><th>商品名称</th><th>花费</th><th>推广销售额</th><th>广告单</th><th>曝光</th><th>点击</th><th>更新时间</th></tr></thead>
            <tbody>
              {overview.records.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.reportDate || '-').slice(0, 10)}</td>
                  <td>{String(row.storeName || '-')}</td>
                  <td>{String(row.temuProductId || '-')}</td>
                  <td>{String(row.temuSpuId || '-')}</td>
                  <td>{String(row.productName || '-')}</td>
                  <td>{String(row.adSpend ?? '-')}</td>
                  <td>{String(row.promoSalesAmount ?? '-')}</td>
                  <td>{String(row.promoSubOrderCount ?? '-')}</td>
                  <td>{String(row.promoImpressions ?? '-')}</td>
                  <td>{String(row.promoClicks ?? '-')}</td>
                  <td>{String(row.updatedAt || '-').slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))}
              {overview.records.length === 0 && <tr><td colSpan={11}>暂无 PostgreSQL 广告记录</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel npc-panel">
        <h2>最近广告导入批次</h2>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>文件名</th><th>报表日期</th><th>店铺</th><th>总行数</th><th>成功</th><th>失败</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {overview.batches.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.fileName || '-')}</td>
                  <td>{String(row.reportDate || '-').slice(0, 10)}</td>
                  <td>{String(row.storeName || '-')}</td>
                  <td>{String(row.totalRows ?? 0)}</td>
                  <td>{String(row.successRows ?? 0)}</td>
                  <td>{String(row.errorRows ?? 0)}</td>
                  <td>{String(row.status || '-')}</td>
                  <td>{String(row.createdAt || '-').slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))}
              {overview.batches.length === 0 && <tr><td colSpan={8}>暂无广告导入批次</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
