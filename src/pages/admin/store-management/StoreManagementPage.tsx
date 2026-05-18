import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { storeOperatorDataSource } from '../../../data-source/storeOperatorDataSource';
import type { StoreOperatorRelation } from '../../../types/storeOperator';

function StoreManagementPage() {
  const [relations, setRelations] = useState<StoreOperatorRelation[]>([]);
  const [storeName, setStoreName] = useState('');
  const [operatorName, setOperatorName] = useState('');

  const refreshRelations = () => {
    setRelations(storeOperatorDataSource.load());
  };

  useEffect(() => {
    refreshRelations();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    storeOperatorDataSource.save({ storeName, operatorName });
    setStoreName('');
    setOperatorName('');
    refreshRelations();
  };

  const handleRemove = (name: string) => {
    storeOperatorDataSource.remove(name);
    refreshRelations();
  };

  return (
    <section className="excel-import-page">
      <article className="admin-placeholder-card">
        <span className="admin-status">店铺运营归属</span>
        <h2>维护店铺所属运营</h2>
        <p>销售数据导入后，会按店铺名称自动归属到这里配置的运营。</p>
        <form className="excel-sheet-list" onSubmit={handleSubmit}>
          <label className="excel-sheet-card">
            <strong>店铺名称</strong>
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} />
          </label>
          <label className="excel-sheet-card">
            <strong>所属运营名称</strong>
            <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} />
          </label>
          <button className="excel-clear-button" type="submit">
            保存关系
          </button>
        </form>
      </article>

      <article className="excel-preview-card">
        <header>
          <div>
            <h2>店铺关系表</h2>
            <p>一个店铺当前只归属一个运营</p>
          </div>
          <span>{relations.length} 条</span>
        </header>
        <div className="excel-sheet-list">
          {relations.map((relation) => (
            <section key={relation.storeName} className="excel-sheet-card">
              <h3>{relation.storeName}</h3>
              <p>所属运营ID：{relation.operatorId}</p>
              <p>所属运营名称：{relation.operatorName}</p>
              <button className="excel-clear-button" type="button" onClick={() => handleRemove(relation.storeName)}>
                删除
              </button>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}

export default StoreManagementPage;
