import { useEffect, useState } from 'react';
import {
  defaultTrafficGrowthRules,
  defaultTrafficWarningRules,
  metricFieldLabels,
  trafficConversionDataSource,
  trafficGrowthTypeLabels,
  trafficTypeLabels,
} from '../../../data-source/trafficConversionDataSource';
import type { TrafficWarningRuleStore } from '../../../types/traffic';

function WarningRulesPage() {
  const [store, setStore] = useState<TrafficWarningRuleStore>({
    settings: { displayLimit: 5 },
    rules: defaultTrafficWarningRules,
    growthRules: defaultTrafficGrowthRules,
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStore(trafficConversionDataSource.loadRuleStore());
  }, []);

  const save = () => {
    try {
      trafficConversionDataSource.saveRuleStore(store);
      setMessage('已保存');
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : 'JSON 文件写入失败'}`);
    }
  };

  return (
    <section className="excel-import-page">
      <article className="excel-record-panel">
        <header>
          <div>
            <h2>经营规则配置</h2>
            <p>规则保存到项目 data 目录，前台大屏和风险诊断中心共用同一份配置。</p>
          </div>
          <label className="traffic-store-input compact-input">
            前台显示条数
            <input
              type="number"
              min="1"
              value={store.settings.displayLimit}
              onChange={(event) =>
                setStore({ ...store, settings: { displayLimit: Number(event.target.value) || 5 } })
              }
            />
          </label>
        </header>

        <h3 className="analysis-section-title">风险预警规则</h3>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>规则名称</th>
                <th>异常类型</th>
                <th>监控字段</th>
                <th>黄色阈值</th>
                <th>红色阈值</th>
                <th>排序权重</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {store.rules.map((rule, index) => (
                <tr key={rule.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => {
                        const rules = [...store.rules];
                        rules[index] = { ...rule, enabled: event.target.checked };
                        setStore({ ...store, rules });
                      }}
                    />
                  </td>
                  <td>{rule.name}</td>
                  <td>{trafficTypeLabels[rule.type]}</td>
                  <td>{metricFieldLabels[rule.metricField]}</td>
                  <td>
                    <input type="number" value={rule.yellowThreshold} onChange={(event) => {
                      const rules = [...store.rules];
                      rules[index] = { ...rule, yellowThreshold: Number(event.target.value) };
                      setStore({ ...store, rules });
                    }} />
                  </td>
                  <td>
                    <input type="number" value={rule.redThreshold} onChange={(event) => {
                      const rules = [...store.rules];
                      rules[index] = { ...rule, redThreshold: Number(event.target.value) };
                      setStore({ ...store, rules });
                    }} />
                  </td>
                  <td>
                    <input type="number" value={rule.sortWeight} onChange={(event) => {
                      const rules = [...store.rules];
                      rules[index] = { ...rule, sortWeight: Number(event.target.value) };
                      setStore({ ...store, rules });
                    }} />
                  </td>
                  <td>
                    <input value={rule.remark} onChange={(event) => {
                      const rules = [...store.rules];
                      rules[index] = { ...rule, remark: event.target.value };
                      setStore({ ...store, rules });
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="analysis-section-title">增长机会规则</h3>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>规则名称</th>
                <th>增长类型</th>
                <th>监控字段</th>
                <th>增长阈值</th>
                <th>排序权重</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {store.growthRules.map((rule, index) => (
                <tr key={rule.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => {
                        const growthRules = [...store.growthRules];
                        growthRules[index] = { ...rule, enabled: event.target.checked };
                        setStore({ ...store, growthRules });
                      }}
                    />
                  </td>
                  <td>{rule.name}</td>
                  <td>{trafficGrowthTypeLabels[rule.type]}</td>
                  <td>{metricFieldLabels[rule.metricField]}</td>
                  <td>
                    <input type="number" value={rule.growthThreshold} onChange={(event) => {
                      const growthRules = [...store.growthRules];
                      growthRules[index] = { ...rule, growthThreshold: Number(event.target.value) };
                      setStore({ ...store, growthRules });
                    }} />
                  </td>
                  <td>
                    <input type="number" value={rule.sortWeight} onChange={(event) => {
                      const growthRules = [...store.growthRules];
                      growthRules[index] = { ...rule, sortWeight: Number(event.target.value) };
                      setStore({ ...store, growthRules });
                    }} />
                  </td>
                  <td>
                    <input value={rule.remark} onChange={(event) => {
                      const growthRules = [...store.growthRules];
                      growthRules[index] = { ...rule, remark: event.target.value };
                      setStore({ ...store, growthRules });
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="excel-clear-button primary-action" type="button" onClick={save}>
          保存规则
        </button>
        {message && <span className="traffic-save-message">{message}</span>}
      </article>
    </section>
  );
}

export default WarningRulesPage;
