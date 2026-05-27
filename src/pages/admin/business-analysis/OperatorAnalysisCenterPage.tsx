import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '../../../types/auth';
import type { OperatorRecord } from '../../../types/operator';
import type { OperationTaskRecord } from '../../../types/task';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import type { TrafficAnalysisItem, TrafficAnalysisResultStore } from '../../../types/traffic';
import { filterRecordsByPermission, filterTasksByPermission } from '../../../utils/permissionScope';

type OperatorRow = {
  operatorId: string;
  operatorName: string;
  groupName: string;
  storeNames: Set<string>;
  analysisStores: Set<string>;
  riskStores: Set<string>;
  growthStores: Set<string>;
  maxDrop: number;
  maxGrowth: number;
  openTasks: number;
  doneTasks: number;
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
}

function getOperatorKey(operatorId?: string, operatorName?: string) {
  return operatorId || operatorName || 'unassigned';
}

function findRelation(relations: StoreOperatorRelation[], storeName: string, date: string) {
  return relations.find((relation) =>
    relation.status !== 'inactive' &&
    relation.storeName === storeName &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date),
  );
}

function createRow(operatorId: string, operatorName: string, groupName = '-') {
  return {
    operatorId,
    operatorName: operatorName || '未指派运营',
    groupName: groupName || '-',
    storeNames: new Set<string>(),
    analysisStores: new Set<string>(),
    riskStores: new Set<string>(),
    growthStores: new Set<string>(),
    maxDrop: 0,
    maxGrowth: 0,
    openTasks: 0,
    doneTasks: 0,
  } satisfies OperatorRow;
}

function OperatorAnalysisCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [items, setItems] = useState<TrafficAnalysisItem[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [relations, setRelations] = useState<StoreOperatorRelation[]>([]);
  const [tasks, setTasks] = useState<OperationTaskRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>('/api/persistent-data/businessAnalysisItems', { items: [], updatedAt: '' }),
      fetchJson<OperatorRecord[]>('/api/operators', []),
      fetchJson<StoreOperatorRelation[]>('/api/store-operator-relations', []),
      fetchJson<OperationTaskRecord[]>('/api/tasks', []),
    ]).then(([analysisStore, nextOperators, nextRelations, nextTasks]) => {
      if (cancelled) {
        return;
      }
      setItems(filterRecordsByPermission(analysisStore.items ?? [], currentUser));
      setOperators(nextOperators.filter((operator) => operator.status !== 'inactive'));
      setRelations(nextRelations.filter((relation) => relation.status !== 'inactive'));
      setTasks(filterTasksByPermission(nextTasks, currentUser));
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const rows = useMemo(() => {
    const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
    const byOperator = new Map<string, OperatorRow>();
    operators.forEach((operator) => {
      byOperator.set(operator.id, createRow(operator.id, operator.operatorName, operator.groupName));
    });

    relations.forEach((relation) => {
      const operator = operatorMap.get(relation.operatorId);
      const key = getOperatorKey(relation.operatorId, relation.operatorName);
      const row = byOperator.get(key) ?? createRow(key, operator?.operatorName || relation.operatorName || '', operator?.groupName);
      if (relation.storeName) {
        row.storeNames.add(relation.storeName);
      }
      byOperator.set(key, row);
    });

    items.forEach((item) => {
      const relation = findRelation(relations, item.storeName, item.date);
      const operator = relation ? operatorMap.get(relation.operatorId) : undefined;
      const key = getOperatorKey(relation?.operatorId, relation?.operatorName);
      const row = byOperator.get(key) ?? createRow(key, operator?.operatorName || relation?.operatorName || '', operator?.groupName);
      row.analysisStores.add(item.storeName);
      row.storeNames.add(item.storeName);
      if (item.resultType === 'risk') {
        row.riskStores.add(item.storeName);
        row.maxDrop = Math.max(row.maxDrop, item.changeRate);
      }
      if (item.resultType === 'opportunity') {
        row.growthStores.add(item.storeName);
        row.maxGrowth = Math.max(row.maxGrowth, item.changeRate);
      }
      byOperator.set(key, row);
    });

    tasks.forEach((task) => {
      const key = getOperatorKey(task.operatorId, task.operatorName);
      const row = byOperator.get(key) ?? createRow(key, task.operatorName || '');
      if (task.storeName) {
        row.storeNames.add(task.storeName);
      }
      if (task.status === 'done') {
        row.doneTasks += 1;
      }
      if (task.status === 'todo' || task.status === 'doing') {
        row.openTasks += 1;
      }
      byOperator.set(key, row);
    });

    return Array.from(byOperator.values())
      .filter((row) => row.storeNames.size > 0 || row.openTasks > 0 || row.doneTasks > 0)
      .sort((first, second) => second.riskStores.size - first.riskStores.size || second.openTasks - first.openTasks || first.operatorName.localeCompare(second.operatorName));
  }, [items, operators, relations, tasks]);

  const riskOperatorCount = rows.filter((row) => row.riskStores.size > 0).length;
  const growthOperatorCount = rows.filter((row) => row.growthStores.size > 0).length;
  const openTaskCount = rows.reduce((total, row) => total + row.openTasks, 0);

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>运营人数</span><strong>{rows.length}</strong></article>
        <article><span>风险运营</span><strong>{riskOperatorCount}</strong></article>
        <article><span>增长运营</span><strong>{growthOperatorCount}</strong></article>
        <article><span>待处理任务</span><strong>{openTaskCount}</strong></article>
      </section>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>运营效果趋势</h2>
            <p>按当前账号可见范围汇总运营负责店铺、风险、增长和任务处理效果。</p>
          </div>
          <span>{rows.length} 人</span>
        </header>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>运营</th>
                <th>分组</th>
                <th>负责店铺</th>
                <th>分析店铺</th>
                <th>风险店铺</th>
                <th>增长店铺</th>
                <th>最大下降</th>
                <th>最大增长</th>
                <th>待处理任务</th>
                <th>已完成任务</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.operatorId}>
                  <td><strong>{row.operatorName}</strong></td>
                  <td>{row.groupName}</td>
                  <td><span className="operator-store-names">{Array.from(row.storeNames).join('、') || '-'}</span></td>
                  <td>{row.analysisStores.size}</td>
                  <td>{row.riskStores.size}</td>
                  <td>{row.growthStores.size}</td>
                  <td>{formatPercent(row.maxDrop)}</td>
                  <td>{formatPercent(row.maxGrowth)}</td>
                  <td>{row.openTasks}</td>
                  <td>{row.doneTasks}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10}>暂无可见运营分析数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default OperatorAnalysisCenterPage;
