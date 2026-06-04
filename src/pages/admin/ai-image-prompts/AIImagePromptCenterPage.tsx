import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '../../../types/auth';
import './aiImagePromptCenter.css';

type Platform = '1688' | 'Amazon' | 'TEMU' | 'Shopify独立站' | '通用电商';
type ImageType = '1688主图' | '产品场景图' | '尺寸说明图' | 'SKU图' | '亚马逊白底主图' | '欧美模特佩戴图' | '节日礼品图' | '详情页卖点图';
type ProductType = '不锈钢饰品配件' | '名字项链' | '字母吊坠' | '手链' | '耳环' | '戒指' | '其他';
type Material = '304不锈钢' | '316不锈钢' | '18K真金电镀' | '925银' | '红木' | '其他';
type Ratio = '方形1:1' | '竖版3:4' | '故事版9:16' | '横版4:3' | '宽屏16:9';
type BackgroundStyle = '暖色干净背景' | '白底' | '浅灰高级背景' | '自然场景' | '礼品场景' | '节日氛围' | '办公桌面场景';
type CoreRequirement =
  | '保持产品原始形状不变'
  | '保持产品比例不变'
  | '不改变产品颜色'
  | '不改变孔位和结构'
  | '突出产品'
  | '不突出文字'
  | '不添加错误卖点'
  | '产品真实自然'
  | '适合电商主图'
  | '适合点击测试';

interface PromptForm {
  platform: Platform;
  imageType: ImageType;
  productType: ProductType;
  material: Material;
  ratio: Ratio;
  backgroundStyle: BackgroundStyle;
  coreRequirements: CoreRequirement[];
  extraRequirement: string;
}

interface PromptRecord extends PromptForm {
  id: string;
  createdAt: string;
  operator: string;
  prompt: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  patch: Partial<PromptForm>;
}

const storageKey = 'ai-image-prompt-center-records';
const visibleRecordLimit = 80;

const platformOptions: Platform[] = ['1688', 'Amazon', 'TEMU', 'Shopify独立站', '通用电商'];
const imageTypeOptions: ImageType[] = ['1688主图', '产品场景图', '尺寸说明图', 'SKU图', '亚马逊白底主图', '欧美模特佩戴图', '节日礼品图', '详情页卖点图'];
const productTypeOptions: ProductType[] = ['不锈钢饰品配件', '名字项链', '字母吊坠', '手链', '耳环', '戒指', '其他'];
const materialOptions: Material[] = ['304不锈钢', '316不锈钢', '18K真金电镀', '925银', '红木', '其他'];
const ratioOptions: Ratio[] = ['方形1:1', '竖版3:4', '故事版9:16', '横版4:3', '宽屏16:9'];
const backgroundOptions: BackgroundStyle[] = ['暖色干净背景', '白底', '浅灰高级背景', '自然场景', '礼品场景', '节日氛围', '办公桌面场景'];
const coreRequirementOptions: CoreRequirement[] = [
  '保持产品原始形状不变',
  '保持产品比例不变',
  '不改变产品颜色',
  '不改变孔位和结构',
  '突出产品',
  '不突出文字',
  '不添加错误卖点',
  '产品真实自然',
  '适合电商主图',
  '适合点击测试',
];

const defaultForm: PromptForm = {
  platform: '1688',
  imageType: '1688主图',
  productType: '不锈钢饰品配件',
  material: '304不锈钢',
  ratio: '方形1:1',
  backgroundStyle: '暖色干净背景',
  coreRequirements: [
    '保持产品原始形状不变',
    '保持产品比例不变',
    '不改变产品颜色',
    '不改变孔位和结构',
    '突出产品',
    '不突出文字',
    '不添加错误卖点',
    '产品真实自然',
    '适合点击测试',
  ],
  extraRequirement: '',
};

const promptTemplates: PromptTemplate[] = [
  {
    id: '1688-warm-main',
    name: '1688暖色主图',
    description: '适合1688平台主图点击测试，强调真实、暖色、突出产品。',
    patch: {
      platform: '1688',
      imageType: '1688主图',
      backgroundStyle: '暖色干净背景',
      ratio: '方形1:1',
      coreRequirements: [
        '保持产品原始形状不变',
        '保持产品比例不变',
        '不改变产品颜色',
        '不改变孔位和结构',
        '突出产品',
        '不突出文字',
        '产品真实自然',
        '适合点击测试',
      ],
    },
  },
  {
    id: '1688-stock-parts',
    name: '1688现货配件主图',
    description: '适合不锈钢小配件、字母吊坠、小五金饰品配件。',
    patch: {
      platform: '1688',
      imageType: '1688主图',
      productType: '不锈钢饰品配件',
      material: '304不锈钢',
      backgroundStyle: '暖色干净背景',
      ratio: '方形1:1',
      coreRequirements: ['保持产品原始形状不变', '保持产品比例不变', '不改变孔位和结构', '突出产品', '产品真实自然', '适合点击测试'],
    },
  },
  {
    id: 'amazon-white-main',
    name: '亚马逊白底主图',
    description: '适合名字项链、吊坠、手链等平台白底主图。',
    patch: {
      platform: 'Amazon',
      imageType: '亚马逊白底主图',
      backgroundStyle: '白底',
      ratio: '方形1:1',
      coreRequirements: ['保持产品原始形状不变', '保持产品比例不变', '不改变产品颜色', '不突出文字', '适合电商主图'],
    },
  },
  {
    id: 'western-model',
    name: '欧美模特佩戴图',
    description: '适合项链、耳环、手链，突出真实佩戴效果。',
    patch: {
      platform: '通用电商',
      imageType: '欧美模特佩戴图',
      backgroundStyle: '自然场景',
      ratio: '竖版3:4',
      coreRequirements: ['保持产品原始形状不变', '不改变产品颜色', '突出产品', '产品真实自然'],
    },
  },
  {
    id: 'gift-scene',
    name: '礼品场景图',
    description: '适合生日、母亲节、圣诞节、情人节礼品图。',
    patch: {
      platform: '通用电商',
      imageType: '节日礼品图',
      backgroundStyle: '礼品场景',
      ratio: '竖版3:4',
      coreRequirements: ['保持产品原始形状不变', '不改变产品颜色', '突出产品', '产品真实自然', '不添加错误卖点'],
    },
  },
  {
    id: 'size-guide',
    name: '尺寸说明图',
    description: '适合带尺寸标注的产品图，强调不改变产品比例。',
    patch: {
      platform: '通用电商',
      imageType: '尺寸说明图',
      backgroundStyle: '浅灰高级背景',
      ratio: '方形1:1',
      coreRequirements: ['保持产品原始形状不变', '保持产品比例不变', '不改变孔位和结构', '不添加错误卖点', '适合电商主图'],
    },
  },
];

function ratioLabel(ratio: Ratio) {
  return ratio.replace('方形', '').replace('竖版', '').replace('故事版', '').replace('横版', '').replace('宽屏', '').trim();
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function readRecords(): PromptRecord[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as PromptRecord[] : [];
  } catch {
    return [];
  }
}

function saveRecords(records: PromptRecord[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records.slice(0, 300)));
}

function uniqueLines(lines: string[]) {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

function buildPrompt(form: PromptForm) {
  const ratio = ratioLabel(form.ratio);
  const intro = form.platform === '1688' && form.imageType === '1688主图'
    ? `请基于我上传的产品图，生成一张适合1688平台使用的${ratio}产品主图。`
    : `请基于我上传的产品图，生成一张适合${form.platform}平台使用的${ratio}${form.imageType}。`;

  const productLine = `产品是${form.productType}，材质为${form.material}${form.platform === '1688' ? '，适合现货批发销售' : ''}。`;
  const requirements: string[] = [];

  if (form.platform === '1688') {
    requirements.push('画面风格偏真实产品、工厂现货和批发采购，不夸张，适合买家点击。');
  }

  if (form.imageType === '1688主图') {
    requirements.push(
      '保持产品原始形状、比例、孔位和结构完全不变。',
      '背景使用暖色系，干净、有质感。',
      '产品要真实，不要卡通，不要过度修饰。',
      '不要添加夸张文字，不要添加错误卖点。',
      '画面突出产品，适合1688买家点击。',
    );
  }

  if (form.imageType === '亚马逊白底主图') {
    requirements.push(
      '使用白色纯背景，产品居中展示。',
      '不添加文字，不添加道具。',
      '不改变产品结构，保持真实电商主图风格。',
    );
  }

  if (form.imageType === '欧美模特佩戴图') {
    requirements.push(
      '使用欧美女性模特和自然光环境。',
      '展示真实佩戴效果，突出饰品但不要让人物抢主体。',
      '保持产品外观不变。',
    );
  }

  if (!requirements.some((item) => item.includes(form.backgroundStyle))) {
    requirements.push(`背景使用${form.backgroundStyle}。`);
  }

  form.coreRequirements.forEach((requirement) => {
    const map: Record<CoreRequirement, string> = {
      保持产品原始形状不变: '保持产品原始形状不变。',
      保持产品比例不变: '保持产品比例不变。',
      不改变产品颜色: '不要改变产品颜色、材质和金属质感。',
      不改变孔位和结构: '不要改变孔位和结构。',
      突出产品: '画面突出产品本身。',
      不突出文字: '不要让文字或装饰元素抢主体。',
      不添加错误卖点: '不要添加错误卖点。',
      产品真实自然: '产品要真实自然，不要卡通化，不要过度美化。',
      适合电商主图: '整体风格适合电商平台主图使用。',
      适合点击测试: '整体风格适合点击测试。',
    };
    requirements.push(map[requirement]);
  });

  if (form.extraRequirement.trim()) {
    requirements.push(form.extraRequirement.trim());
  }

  const numberedRequirements = uniqueLines(requirements).map((line, index) => `${index + 1}. ${line}`).join('\n');

  return `${intro}\n\n${productLine}\n\n图片要求：\n${numberedRequirements}\n\n输出真实电商产品图片效果。`;
}

function AIImagePromptCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [form, setForm] = useState<PromptForm>(defaultForm);
  const [prompt, setPrompt] = useState('');
  const [records, setRecords] = useState<PromptRecord[]>([]);
  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');
  const [imageTypeFilter, setImageTypeFilter] = useState<'all' | ImageType>('all');
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setRecords(readRecords());
  }, []);

  const filteredRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return records
      .filter((record) => platformFilter === 'all' || record.platform === platformFilter)
      .filter((record) => imageTypeFilter === 'all' || record.imageType === imageTypeFilter)
      .filter((record) => !normalizedKeyword || record.prompt.toLowerCase().includes(normalizedKeyword))
      .slice(0, visibleRecordLimit);
  }, [imageTypeFilter, keyword, platformFilter, records]);

  const updateRecords = (nextRecords: PromptRecord[]) => {
    setRecords(nextRecords);
    saveRecords(nextRecords);
  };

  const generatePrompt = () => {
    const nextPrompt = buildPrompt(form);
    const nextRecord: PromptRecord = {
      ...form,
      id: makeId(),
      createdAt: new Date().toISOString(),
      operator: currentUser.displayName || currentUser.username || '当前用户',
      prompt: nextPrompt,
    };
    setPrompt(nextPrompt);
    updateRecords([nextRecord, ...records]);
    setMessage('提示词已生成并保存到记录。');
  };

  const copyText = async (text: string) => {
    if (!text.trim()) {
      setMessage('暂无可复制的提示词。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage('提示词已复制。');
    } catch {
      setMessage('复制失败，请手动选中文本复制。');
    }
  };

  const toggleRequirement = (requirement: CoreRequirement) => {
    setForm((current) => {
      const hasRequirement = current.coreRequirements.includes(requirement);
      return {
        ...current,
        coreRequirements: hasRequirement
          ? current.coreRequirements.filter((item) => item !== requirement)
          : [...current.coreRequirements, requirement],
      };
    });
  };

  const applyTemplate = (template: PromptTemplate) => {
    setForm((current) => ({ ...current, ...template.patch }));
    setMessage(`已套用模板：${template.name}`);
  };

  const deleteRecord = (recordId: string) => {
    updateRecords(records.filter((record) => record.id !== recordId));
    setMessage('记录已删除。');
  };

  const clearRecords = () => {
    if (!window.confirm('确定清空全部提示词记录吗？此操作不可恢复。')) {
      return;
    }

    updateRecords([]);
    setMessage('提示词记录已清空。');
  };

  return (
    <section className="ai-prompt-page">
      <article className="ai-prompt-panel ai-prompt-generator">
        <header>
          <div>
            <h2>提示词生成区</h2>
            <p>选择平台、图片用途和产品信息，生成可直接复制到 ChatGPT 的图片提示词。</p>
          </div>
          {message && <span>{message}</span>}
        </header>

        <section className="ai-prompt-form-grid">
          <label>
            <strong>平台选择</strong>
            <select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as Platform })}>
              {platformOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>图片类型</strong>
            <select value={form.imageType} onChange={(event) => setForm({ ...form, imageType: event.target.value as ImageType })}>
              {imageTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>产品类型</strong>
            <select value={form.productType} onChange={(event) => setForm({ ...form, productType: event.target.value as ProductType })}>
              {productTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>产品材质</strong>
            <select value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value as Material })}>
              {materialOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>图片比例</strong>
            <select value={form.ratio} onChange={(event) => setForm({ ...form, ratio: event.target.value as Ratio })}>
              {ratioOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>背景风格</strong>
            <select value={form.backgroundStyle} onChange={(event) => setForm({ ...form, backgroundStyle: event.target.value as BackgroundStyle })}>
              {backgroundOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </section>

        <section className="ai-prompt-requirements">
          <strong>核心要求</strong>
          <div>
            {coreRequirementOptions.map((requirement) => (
              <label key={requirement} className={form.coreRequirements.includes(requirement) ? 'active' : ''}>
                <input
                  type="checkbox"
                  checked={form.coreRequirements.includes(requirement)}
                  onChange={() => toggleRequirement(requirement)}
                />
                <span>{requirement}</span>
              </label>
            ))}
          </div>
        </section>

        <label className="ai-prompt-extra">
          <strong>补充要求</strong>
          <textarea
            value={form.extraRequirement}
            placeholder="例如：画面不要出现英文，不要增加不存在的配件，保持金属反光真实。"
            onChange={(event) => setForm({ ...form, extraRequirement: event.target.value })}
          />
        </label>

        <div className="ai-prompt-actions">
          <button className="ai-prompt-primary-button" type="button" onClick={generatePrompt}>生成提示词</button>
          <button type="button" onClick={() => void copyText(prompt)}>一键复制</button>
        </div>

        <label className="ai-prompt-result">
          <strong>生成后的提示词</strong>
          <textarea value={prompt} placeholder="点击“生成提示词”后会显示在这里，也可以手动微调后再复制。" onChange={(event) => setPrompt(event.target.value)} />
        </label>
      </article>

      <article className="ai-prompt-panel">
        <header>
          <div>
            <h2>常用模板区</h2>
            <p>点击模板后会自动套用到上方表单，运营可再按产品微调。</p>
          </div>
          <span>{promptTemplates.length} 个模板</span>
        </header>
        <section className="ai-prompt-template-grid">
          {promptTemplates.map((template) => (
            <button key={template.id} type="button" onClick={() => applyTemplate(template)}>
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </section>
      </article>

      <article className="ai-prompt-panel">
        <header>
          <div>
            <h2>提示词记录区</h2>
            <p>每次生成会保存一条记录，最新记录排在最上面。</p>
          </div>
          <span>{records.length} 条记录</span>
        </header>

        <section className="ai-prompt-filter-bar">
          <label>
            <strong>平台筛选</strong>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as 'all' | Platform)}>
              <option value="all">全部平台</option>
              {platformOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>图片类型</strong>
            <select value={imageTypeFilter} onChange={(event) => setImageTypeFilter(event.target.value as 'all' | ImageType)}>
              <option value="all">全部类型</option>
              {imageTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>关键词搜索</strong>
            <input value={keyword} placeholder="搜索提示词内容" onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <button className="ai-prompt-danger-button" type="button" onClick={clearRecords}>清空记录</button>
        </section>

        <section className="ai-prompt-record-list">
          {filteredRecords.map((record) => (
            <article key={record.id} className="ai-prompt-record">
              <header>
                <div>
                  <strong>{record.platform} / {record.imageType}</strong>
                  <span>{formatDateTime(record.createdAt)} · {record.operator} · {record.productType} · {record.material} · {record.ratio} · {record.backgroundStyle}</span>
                </div>
                <div>
                  <button type="button" onClick={() => void copyText(record.prompt)}>复制</button>
                  <button className="ai-prompt-danger-button" type="button" onClick={() => deleteRecord(record.id)}>删除</button>
                </div>
              </header>
              <p>{record.prompt}</p>
            </article>
          ))}
          {filteredRecords.length === 0 && <div className="ai-prompt-empty">暂无符合条件的提示词记录</div>}
        </section>
      </article>
    </section>
  );
}

export default AIImagePromptCenterPage;
