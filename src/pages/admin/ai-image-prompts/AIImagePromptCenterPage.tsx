import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '../../../types/auth';
import './aiImagePromptCenter.css';

type Platform = '1688' | 'Amazon' | 'TEMU' | 'Shopify独立站' | '通用电商';
type ImageType = '1688主图' | '产品场景图' | '尺寸说明图' | 'SKU图' | '亚马逊白底主图' | '欧美模特佩戴图' | '节日礼品图' | '详情页卖点图';
type ProductType = '不锈钢饰品配件' | '名字项链' | '字母吊坠' | '手链' | '耳环' | '戒指' | '其他';
type Material = '304不锈钢' | '316不锈钢' | '18K真金电镀' | '925银' | '红木' | '其他';
type Ratio = '方形1:1' | '竖版3:4' | '故事版9:16' | '横版4:3' | '宽屏16:9';
type BackgroundStyle = '暖色干净背景' | '白底' | '浅灰高级背景' | '自然场景' | '礼品场景' | '节日氛围' | '办公桌面场景';
type PositiveRequirement =
  | '保持产品原始形状'
  | '保持产品真实比例'
  | '保持产品颜色准确'
  | '保持孔位和结构清晰'
  | '产品真实自然'
  | '金属质感真实'
  | '产品主体完整展示'
  | '适合1688主图'
  | '适合点击测试'
  | '适合批发采购'
  | '突出现货'
  | '突出源头工厂'
  | '背景干净简洁'
  | '产品一眼可识别'
  | '适合手机端浏览'
  | '适合亚马逊商品图'
  | '主体清晰规范'
  | '画面干净专业'
  | '产品边缘清晰'
  | '产品颜色真实'
  | '适合跨境买家浏览'
  | '适合独立站展示'
  | '具有品牌感'
  | '画面高级干净'
  | '适合礼品场景'
  | '突出产品质感'
  | '适合详情页展示'
  | '适合TEMU商品图'
  | '产品清晰直接'
  | '卖点表达明确'
  | '适合快速浏览'
  | '适合移动端展示'
  | '主体占比合理'
  | '适合短视频封面'
  | '画面有吸引力'
  | '产品视觉冲击强'
  | '适合种草内容'
  | '场景自然真实'
  | '产品仍然突出'
  | '适合电商产品展示'
  | '产品主体突出'
  | '背景干净'
  | '画面真实自然'
  | '商业摄影质感'
  | '突出产品主体'
  | '产品占比合理'
  | '小配件需要放大展示'
  | '白底干净展示'
  | '产品居中'
  | '产品颜色准确'
  | '主体完整展示'
  | '适合标准电商图'
  | '展示真实使用场景'
  | '展示搭配效果'
  | '产品仍然是主体'
  | '道具搭配合理'
  | '适合饰品配件应用展示'
  | '展示产品细节'
  | '展示孔位和边缘'
  | '展示厚度和结构'
  | '展示金属质感'
  | '展示抛光效果'
  | '细节高清清晰'
  | '保持比例真实'
  | '适合尺寸标注'
  | '构图清晰'
  | '产品完整展示'
  | '留出标注空间'
  | '适合展示mm和inch尺寸'
  | '展示多SKU'
  | '排列整齐'
  | '款式区分清楚'
  | '颜色区分清楚'
  | '适合多规格展示'
  | '画面清爽统一'
  | '突出现货供应'
  | '展示库存感'
  | '展示采购场景'
  | '产品主体仍然清晰'
  | '突出不锈钢材质'
  | '突出防水'
  | '突出不易褪色'
  | '突出可定制'
  | '突出跨境电商适用';
type NegativeRequirement =
  | '不改变产品形状'
  | '不改变产品比例'
  | '不改变产品颜色'
  | '不改变孔位和结构'
  | '不添加不存在的配件'
  | '不让产品变形'
  | '不让产品模糊'
  | '不出现乱码文字'
  | '不出现水印'
  | '不出现品牌Logo'
  | '不要过度品牌海报化'
  | '不要奢侈品广告感太强'
  | '不要文字过多'
  | '不要产品太小'
  | '不要画面过空'
  | '不要复杂拼图'
  | '不要生成平台Logo'
  | '不要生成价格'
  | '不使用复杂背景'
  | '不使用过多道具'
  | '不生成促销标签'
  | '不生成价格'
  | '不生成平台Logo'
  | '不出现夸张文字'
  | '不添加未经确认的认证信息'
  | '不添加错误卖点'
  | '不要廉价批发感过强'
  | '不要背景杂乱'
  | '不要过度促销风'
  | '不要低质感光影'
  | '不要乱码文字'
  | '不要无关Logo'
  | '不要复杂背景'
  | '不要过多文字'
  | '不要虚假卖点'
  | '不要低清晰度'
  | '不要无关装饰抢镜'
  | '不要产品主体不清楚'
  | '不要人物过度抢镜'
  | '不要背景过乱'
  | '不要错误使用场景'
  | '不要产品变形'
  | '不要错误文字'
  | '不要错误卖点'
  | '不要水印Logo'
  | '不突出文字'
  | '不让主体过小'
  | '不让道具抢镜'
  | '不使用复杂拼图'
  | '不添加复杂场景'
  | '不添加多余道具'
  | '不添加文字'
  | '不添加阴影过重效果'
  | '不让产品边缘模糊'
  | '不让人物抢镜'
  | '不使用错误佩戴方式'
  | '不出现手部遮挡产品'
  | '不使用不相关场景'
  | '不让产品主体不清楚'
  | '不让细节模糊'
  | '不遮挡关键结构'
  | '不过度反光'
  | '不让边缘融化'
  | '不改变孔位结构'
  | '不改变尺寸感'
  | '不生成错误结构'
  | '不让标注遮挡产品'
  | '不添加复杂道具'
  | '不混乱排列'
  | '不让颜色失真'
  | '不让款式差异不清楚'
  | '不添加不存在的SKU'
  | '不让工厂背景抢镜'
  | '不让画面脏乱'
  | '不使用虚假工厂信息'
  | '不生成错误库存数量'
  | '不让产品主体变小'
  | '不使用塑料质感'
  | '不使用过度反光'
  | '不使用夸张奢侈场景';

interface PromptForm {
  platform: Platform;
  imageType: ImageType;
  productType: ProductType;
  material: Material;
  ratio: Ratio;
  backgroundStyle: BackgroundStyle;
  positiveRequirements: PositiveRequirement[];
  negativeRequirements: NegativeRequirement[];
  extraRequirement: string;
}

type LegacyPromptRecord = Partial<PromptForm> & {
  id: string;
  createdAt: string;
  operator: string;
  prompt: string;
  platform: Platform;
  imageType: ImageType;
  productType: ProductType;
  material: Material;
  ratio: Ratio;
  backgroundStyle: BackgroundStyle;
};

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

interface RequirementPreset {
  positive: PositiveRequirement[];
  negative: NegativeRequirement[];
}

type BatchMode = '主图点击测试' | '背景风格测试' | '构图角度测试' | '卖点方向测试' | '场景使用测试' | '细节图批量生成' | 'SKU图批量生成';
type BatchCount = 3 | 5 | 10;
type BatchVariationDimension = '背景变化' | '构图变化' | '光线变化' | '卖点变化' | '场景变化' | '产品展示重点变化';
type GenerationMode = 'single' | 'batch' | 'set';
type SetTemplate = '1688基础套图' | '1688增强套图' | 'Amazon基础套图' | 'Shopify/独立站套图' | 'TEMU基础套图' | '通用电商套图' | '自定义套图';
type SetCount = 5 | 8 | 10;
type SetConsistencyRequirement =
  | '全套图片保持同一个产品'
  | '保持产品形状一致'
  | '保持产品比例一致'
  | '保持产品颜色一致'
  | '保持孔位和结构一致'
  | '保持材质表现一致'
  | '保持整体风格统一'
  | '不要每张图生成不同产品'
  | '不要添加不存在的配件'
  | '不要让产品前后不一致';

interface BatchDirection {
  title: string;
  purpose: string;
  detail: string;
}

interface SetItem {
  name: string;
  purpose: string;
}

const storageKey = 'ai-image-prompt-center-records';
const visibleRecordLimit = 80;

const platformOptions: Platform[] = ['1688', 'Amazon', 'TEMU', 'Shopify独立站', '通用电商'];
const imageTypeOptions: ImageType[] = ['1688主图', '产品场景图', '尺寸说明图', 'SKU图', '亚马逊白底主图', '欧美模特佩戴图', '节日礼品图', '详情页卖点图'];
const productTypeOptions: ProductType[] = ['不锈钢饰品配件', '名字项链', '字母吊坠', '手链', '耳环', '戒指', '其他'];
const materialOptions: Material[] = ['304不锈钢', '316不锈钢', '18K真金电镀', '925银', '红木', '其他'];
const ratioOptions: Ratio[] = ['方形1:1', '竖版3:4', '故事版9:16', '横版4:3', '宽屏16:9'];
const backgroundOptions: BackgroundStyle[] = ['暖色干净背景', '白底', '浅灰高级背景', '自然场景', '礼品场景', '节日氛围', '办公桌面场景'];
const batchModeOptions: BatchMode[] = ['主图点击测试', '背景风格测试', '构图角度测试', '卖点方向测试', '场景使用测试', '细节图批量生成', 'SKU图批量生成'];
const batchCountOptions: BatchCount[] = [3, 5, 10];
const batchVariationOptions: BatchVariationDimension[] = ['背景变化', '构图变化', '光线变化', '卖点变化', '场景变化', '产品展示重点变化'];
const generationModes: { key: GenerationMode; title: string; description: string }[] = [
  { key: 'single', title: '单图提示词', description: '生成一张图片的提示词，适合单张主图、细节图、场景图。' },
  { key: 'batch', title: '批量测试模式', description: '同一个产品，生成多张不同风格、背景、构图的测试图片提示词。' },
  { key: 'set', title: '系列套图模式', description: '同一个产品，生成一整套商品上架图片提示词。' },
];
const setTemplateOptions: SetTemplate[] = ['1688基础套图', '1688增强套图', 'Amazon基础套图', 'Shopify/独立站套图', 'TEMU基础套图', '通用电商套图', '自定义套图'];
const setCountOptions: SetCount[] = [5, 8, 10];
const defaultSetConsistencyRequirements: SetConsistencyRequirement[] = [
  '全套图片保持同一个产品',
  '保持产品形状一致',
  '保持产品比例一致',
  '保持产品颜色一致',
  '保持孔位和结构一致',
  '保持材质表现一致',
  '保持整体风格统一',
  '不要每张图生成不同产品',
  '不要添加不存在的配件',
  '不要让产品前后不一致',
];

const commonRequirements: RequirementPreset = {
  positive: ['保持产品原始形状', '保持产品真实比例', '保持产品颜色准确', '保持孔位和结构清晰', '产品真实自然', '金属质感真实', '产品主体完整展示'],
  negative: ['不改变产品形状', '不改变产品比例', '不改变产品颜色', '不改变孔位和结构', '不添加不存在的配件', '不让产品变形', '不让产品模糊', '不出现乱码文字', '不出现水印', '不出现品牌Logo'],
};

const platformRequirementPresets: Record<Platform, RequirementPreset> = {
  '1688': {
    positive: ['适合1688主图', '适合点击测试', '适合批发采购', '突出现货', '突出源头工厂', '背景干净简洁', '产品一眼可识别', '适合手机端浏览'],
    negative: ['不要过度品牌海报化', '不要奢侈品广告感太强', '不要文字过多', '不要产品太小', '不要画面过空', '不要复杂拼图', '不要生成平台Logo', '不要生成价格'],
  },
  Amazon: {
    positive: ['适合亚马逊商品图', '主体清晰规范', '画面干净专业', '产品边缘清晰', '产品颜色真实', '适合跨境买家浏览'],
    negative: ['不使用复杂背景', '不使用过多道具', '不生成促销标签', '不生成价格', '不生成平台Logo', '不出现夸张文字', '不添加未经确认的认证信息', '不添加错误卖点'],
  },
  'Shopify独立站': {
    positive: ['适合独立站展示', '具有品牌感', '画面高级干净', '适合礼品场景', '突出产品质感', '适合详情页展示'],
    negative: ['不要廉价批发感过强', '不要背景杂乱', '不要过度促销风', '不要低质感光影', '不要乱码文字', '不要无关Logo'],
  },
  TEMU: {
    positive: ['适合TEMU商品图', '产品清晰直接', '卖点表达明确', '适合快速浏览', '适合移动端展示', '主体占比合理'],
    negative: ['不要复杂背景', '不要产品太小', '不要过多文字', '不要虚假卖点', '不要低清晰度', '不要无关装饰抢镜'],
  },
  通用电商: {
    positive: ['适合电商产品展示', '产品主体突出', '背景干净', '画面真实自然', '商业摄影质感'],
    negative: ['不要产品变形', '不要背景杂乱', '不要错误文字', '不要错误卖点', '不要水印Logo'],
  },
};

const tikTokRequirementPreset: RequirementPreset = {
  positive: ['适合短视频封面', '画面有吸引力', '产品视觉冲击强', '适合种草内容', '场景自然真实', '产品仍然突出'],
  negative: ['不要产品主体不清楚', '不要人物过度抢镜', '不要背景过乱', '不要文字过多', '不要低清晰度', '不要错误使用场景'],
};

const imageTypeRequirementPresets: Record<ImageType, RequirementPreset> = {
  '1688主图': {
    positive: ['突出产品主体', '产品占比合理', '背景干净简洁', '适合点击测试', '适合批发采购', '产品一眼可识别', '小配件需要放大展示'],
    negative: ['不突出文字', '不生成价格', '不使用复杂背景', '不让主体过小', '不让道具抢镜', '不使用复杂拼图', '不生成促销标签'],
  },
  亚马逊白底主图: {
    positive: ['白底干净展示', '产品居中', '产品边缘清晰', '产品颜色准确', '主体完整展示', '适合标准电商图'],
    negative: ['不添加复杂场景', '不添加多余道具', '不添加文字', '不添加阴影过重效果', '不改变产品颜色', '不让产品边缘模糊'],
  },
  产品场景图: {
    positive: ['展示真实使用场景', '展示搭配效果', '产品仍然是主体', '场景自然真实', '道具搭配合理', '适合饰品配件应用展示'],
    negative: ['不让人物抢镜', '不让道具抢镜', '不使用错误佩戴方式', '不出现手部遮挡产品', '不使用不相关场景', '不让产品主体不清楚'],
  },
  欧美模特佩戴图: {
    positive: ['展示真实使用场景', '展示搭配效果', '产品仍然是主体', '场景自然真实', '道具搭配合理', '适合饰品配件应用展示'],
    negative: ['不让人物抢镜', '不让道具抢镜', '不使用错误佩戴方式', '不出现手部遮挡产品', '不使用不相关场景', '不让产品主体不清楚'],
  },
  节日礼品图: {
    positive: ['展示真实使用场景', '展示搭配效果', '产品仍然是主体', '场景自然真实', '道具搭配合理', '适合礼品场景'],
    negative: ['不让道具抢镜', '不使用不相关场景', '不让产品主体不清楚', '不使用夸张奢侈场景'],
  },
  详情页卖点图: {
    positive: ['展示产品细节', '展示孔位和边缘', '展示厚度和结构', '展示金属质感', '展示抛光效果', '细节高清清晰'],
    negative: ['不让细节模糊', '不遮挡关键结构', '不使用复杂背景', '不过度反光', '不让边缘融化', '不改变孔位结构'],
  },
  尺寸说明图: {
    positive: ['保持比例真实', '适合尺寸标注', '构图清晰', '产品完整展示', '留出标注空间', '适合展示mm和inch尺寸'],
    negative: ['不改变尺寸感', '不改变产品比例', '不添加复杂道具', '不使用复杂背景', '不生成错误结构', '不让标注遮挡产品'],
  },
  SKU图: {
    positive: ['展示多SKU', '排列整齐', '款式区分清楚', '颜色区分清楚', '适合多规格展示', '画面清爽统一'],
    negative: ['不混乱排列', '不让颜色失真', '不让款式差异不清楚', '不添加不存在的SKU', '不改变产品比例', '不使用复杂背景'],
  },
};

const factoryStockRequirementPreset: RequirementPreset = {
  positive: ['突出现货供应', '突出源头工厂', '适合批发采购', '展示库存感', '展示采购场景', '产品主体仍然清晰'],
  negative: ['不让工厂背景抢镜', '不让画面脏乱', '不使用虚假工厂信息', '不生成错误库存数量', '不生成价格', '不让产品主体变小'],
};

function uniqueItems<T extends string>(items: T[]) {
  return Array.from(new Set(items));
}

function getRequirementPreset(platform: Platform, imageType: ImageType): RequirementPreset {
  const platformPreset = platformRequirementPresets[platform];
  const imageTypePreset = imageTypeRequirementPresets[imageType];
  const useFactoryStock = platform === '1688' && imageType === '1688主图';
  return {
    positive: uniqueItems([
      ...commonRequirements.positive,
      ...platformPreset.positive,
      ...imageTypePreset.positive,
      ...(useFactoryStock ? factoryStockRequirementPreset.positive : []),
    ]),
    negative: uniqueItems([
      ...commonRequirements.negative,
      ...platformPreset.negative,
      ...imageTypePreset.negative,
      ...(useFactoryStock ? factoryStockRequirementPreset.negative : []),
    ]),
  };
}

const positiveRequirementText: Record<PositiveRequirement, string> = {
  保持产品原始形状: '保持产品原始形状。',
  保持产品真实比例: '保持产品真实比例。',
  保持产品颜色准确: '保持产品颜色准确，不偏色。',
  保持孔位和结构清晰: '保持孔位和结构清晰可见。',
  产品真实自然: '产品真实自然，不要卡通化，不要过度美化。',
  金属质感真实: '金属质感真实，保留自然反光和细节。',
  产品主体完整展示: '产品主体完整展示。',
  适合1688主图: '整体风格适合1688平台主图。',
  适合点击测试: '整体风格适合点击测试。',
  适合批发采购: '画面适合批发采购买家查看。',
  突出现货: '适度突出现货供应感。',
  突出源头工厂: '适度突出源头工厂和供应能力。',
  背景干净简洁: '背景干净简洁，不抢产品主体。',
  产品一眼可识别: '产品需要一眼可识别。',
  适合手机端浏览: '适合手机端快速浏览。',
  适合亚马逊商品图: '适合亚马逊商品图规范。',
  主体清晰规范: '主体清晰规范。',
  画面干净专业: '画面干净专业。',
  产品边缘清晰: '产品边缘清晰。',
  产品颜色真实: '产品颜色真实。',
  适合跨境买家浏览: '适合跨境买家浏览。',
  适合独立站展示: '适合独立站展示。',
  具有品牌感: '画面具有品牌感。',
  画面高级干净: '画面高级干净。',
  适合礼品场景: '适合礼品场景。',
  突出产品质感: '突出产品质感。',
  适合详情页展示: '适合详情页展示。',
  适合TEMU商品图: '适合TEMU商品图。',
  产品清晰直接: '产品清晰直接。',
  卖点表达明确: '卖点表达明确。',
  适合快速浏览: '适合快速浏览。',
  适合移动端展示: '适合移动端展示。',
  主体占比合理: '主体占比合理。',
  适合短视频封面: '适合短视频封面。',
  画面有吸引力: '画面有吸引力。',
  产品视觉冲击强: '产品视觉冲击强。',
  适合种草内容: '适合种草内容。',
  场景自然真实: '场景自然真实。',
  产品仍然突出: '产品仍然突出。',
  适合电商产品展示: '适合电商产品展示。',
  产品主体突出: '产品主体突出。',
  背景干净: '背景干净。',
  画面真实自然: '画面真实自然。',
  商业摄影质感: '具有商业摄影质感。',
  突出产品主体: '突出产品主体，画面焦点集中在产品本身。',
  产品占比合理: '产品占比合理。',
  小配件需要放大展示: '小配件需要放大展示。',
  白底干净展示: '白底干净展示。',
  产品居中: '产品居中。',
  产品颜色准确: '产品颜色准确。',
  主体完整展示: '主体完整展示。',
  适合标准电商图: '适合标准电商图。',
  展示真实使用场景: '展示真实使用场景。',
  展示搭配效果: '展示搭配效果。',
  产品仍然是主体: '产品仍然是主体。',
  道具搭配合理: '道具搭配合理。',
  适合饰品配件应用展示: '适合饰品配件应用展示。',
  展示产品细节: '展示产品细节。',
  展示孔位和边缘: '展示孔位和边缘。',
  展示厚度和结构: '展示厚度和结构。',
  展示金属质感: '展示金属质感。',
  展示抛光效果: '展示抛光效果。',
  细节高清清晰: '细节高清清晰。',
  保持比例真实: '保持比例真实。',
  适合尺寸标注: '适合尺寸标注。',
  构图清晰: '构图清晰。',
  产品完整展示: '产品完整展示。',
  留出标注空间: '留出标注空间。',
  适合展示mm和inch尺寸: '适合展示mm和inch尺寸。',
  展示多SKU: '展示多SKU。',
  排列整齐: '排列整齐。',
  款式区分清楚: '款式区分清楚。',
  颜色区分清楚: '颜色区分清楚。',
  适合多规格展示: '适合多规格展示。',
  画面清爽统一: '画面清爽统一。',
  突出现货供应: '突出现货供应。',
  展示库存感: '展示库存感。',
  展示采购场景: '展示采购场景。',
  产品主体仍然清晰: '产品主体仍然清晰。',
  突出不锈钢材质: '突出不锈钢材质特征。',
  突出防水: '在不夸张的前提下突出防水特点。',
  突出不易褪色: '在不夸张的前提下突出不易褪色特点。',
  突出可定制: '适度突出可定制属性。',
  突出跨境电商适用: '画面适合跨境电商销售场景。',
};

const negativeRequirementText: Record<NegativeRequirement, string> = {
  不改变产品形状: '不改变产品形状。',
  不改变产品比例: '不改变产品比例。',
  不改变产品颜色: '不改变产品颜色。',
  不改变孔位和结构: '不改变孔位和结构。',
  不添加不存在的配件: '不添加不存在的配件。',
  不让产品变形: '不让产品变形。',
  不让产品模糊: '不让产品模糊。',
  不出现乱码文字: '不出现乱码文字。',
  不出现水印: '不出现水印。',
  不出现品牌Logo: '不出现品牌Logo。',
  不要过度品牌海报化: '不要过度品牌海报化。',
  不要奢侈品广告感太强: '不要奢侈品广告感太强。',
  不要文字过多: '不要文字过多。',
  不要产品太小: '不要产品太小。',
  不要画面过空: '不要画面过空。',
  不要复杂拼图: '不要复杂拼图。',
  不要生成平台Logo: '不要生成平台Logo。',
  不要生成价格: '不要生成价格。',
  不使用复杂背景: '不使用复杂背景。',
  不使用过多道具: '不使用过多道具。',
  不生成促销标签: '不生成促销标签。',
  不生成价格: '不生成价格。',
  不生成平台Logo: '不生成平台Logo。',
  不出现夸张文字: '不出现夸张文字。',
  不添加未经确认的认证信息: '不添加未经确认的认证信息。',
  不添加错误卖点: '不添加错误卖点。',
  不要廉价批发感过强: '不要廉价批发感过强。',
  不要背景杂乱: '不要背景杂乱。',
  不要过度促销风: '不要过度促销风。',
  不要低质感光影: '不要低质感光影。',
  不要乱码文字: '不要乱码文字。',
  不要无关Logo: '不要无关Logo。',
  不要复杂背景: '不要复杂背景。',
  不要过多文字: '不要过多文字。',
  不要虚假卖点: '不要虚假卖点。',
  不要低清晰度: '不要低清晰度。',
  不要无关装饰抢镜: '不要无关装饰抢镜。',
  不要产品主体不清楚: '不要产品主体不清楚。',
  不要人物过度抢镜: '不要人物过度抢镜。',
  不要背景过乱: '不要背景过乱。',
  不要错误使用场景: '不要错误使用场景。',
  不要产品变形: '不要产品变形。',
  不要错误文字: '不要错误文字。',
  不要错误卖点: '不要错误卖点。',
  不要水印Logo: '不要水印Logo。',
  不突出文字: '不突出文字，不让文字抢主体。',
  不让主体过小: '不让主体过小。',
  不让道具抢镜: '不让道具抢镜。',
  不使用复杂拼图: '不使用复杂拼图。',
  不添加复杂场景: '不添加复杂场景。',
  不添加多余道具: '不添加多余道具。',
  不添加文字: '不添加文字。',
  不添加阴影过重效果: '不添加阴影过重效果。',
  不让产品边缘模糊: '不让产品边缘模糊。',
  不让人物抢镜: '不让人物抢镜。',
  不使用错误佩戴方式: '不使用错误佩戴方式。',
  不出现手部遮挡产品: '不出现手部遮挡产品。',
  不使用不相关场景: '不使用不相关场景。',
  不让产品主体不清楚: '不让产品主体不清楚。',
  不让细节模糊: '不让细节模糊。',
  不遮挡关键结构: '不遮挡关键结构。',
  不过度反光: '不过度反光。',
  不让边缘融化: '不让边缘融化。',
  不改变孔位结构: '不改变孔位结构。',
  不改变尺寸感: '不改变尺寸感。',
  不生成错误结构: '不生成错误结构。',
  不让标注遮挡产品: '不让标注遮挡产品。',
  不添加复杂道具: '不添加复杂道具。',
  不混乱排列: '不混乱排列。',
  不让颜色失真: '不让颜色失真。',
  不让款式差异不清楚: '不让款式差异不清楚。',
  不添加不存在的SKU: '不添加不存在的SKU。',
  不让工厂背景抢镜: '不让工厂背景抢镜。',
  不让画面脏乱: '不让画面脏乱。',
  不使用虚假工厂信息: '不使用虚假工厂信息。',
  不生成错误库存数量: '不生成错误库存数量。',
  不让产品主体变小: '不让产品主体变小。',
  不使用塑料质感: '不使用塑料质感。',
  不使用过度反光: '不使用过度反光。',
  不使用夸张奢侈场景: '不使用夸张奢侈场景。',
};

const defaultRequirements = getRequirementPreset('1688', '1688主图');
const defaultForm: PromptForm = {
  platform: '1688',
  imageType: '1688主图',
  productType: '不锈钢饰品配件',
  material: '304不锈钢',
  ratio: '方形1:1',
  backgroundStyle: '暖色干净背景',
  positiveRequirements: defaultRequirements.positive,
  negativeRequirements: defaultRequirements.negative,
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
    },
  },
  {
    id: '亚马逊白底主图',
    name: '亚马逊白底主图',
    description: '适合名字项链、吊坠、手链等平台白底主图。',
    patch: {
      platform: 'Amazon',
      imageType: '亚马逊白底主图',
      backgroundStyle: '白底',
      ratio: '方形1:1',
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
    },
  },
  {
    id: 'gift-scene',
    name: '礼品场景图',
    description: '适合生日、母亲节、圣诞节、情人节礼品图。',
    patch: {
      platform: 'Shopify独立站',
      imageType: '节日礼品图',
      backgroundStyle: '礼品场景',
      ratio: '竖版3:4',
    },
  },
  {
    id: 'size-guide',
    name: '尺寸说明图',
    description: '适合带尺寸标注的产品图，要求不改变产品比例。',
    patch: {
      platform: '通用电商',
      imageType: '尺寸说明图',
      backgroundStyle: '浅灰高级背景',
      ratio: '方形1:1',
    },
  },
];

const batchDirectionPresets: Record<BatchMode, BatchDirection[]> = {
  主图点击测试: [
    { title: '暖色干净背景主图', purpose: '测试1688主图点击率', detail: '产品居中，主体突出，背景为暖色干净背景，画面真实自然，适合批发采购买家点击。' },
    { title: '白底标准主图', purpose: '测试标准电商主图清晰度', detail: '白底干净展示，产品居中，边缘清晰，颜色准确，适合标准商品图。' },
    { title: '浅灰金属质感主图', purpose: '测试金属材质表现', detail: '浅灰背景，柔和商业摄影光线，突出不锈钢金属质感和自然反光。' },
    { title: '米色托盘主图', purpose: '测试柔和暖色风格', detail: '米色背景或浅色托盘，产品主体突出，画面干净温和，不抢产品。' },
    { title: '工厂现货风主图', purpose: '测试批发采购和现货感', detail: '适度体现现货、批发、工厂供应感，但产品仍然是画面主体，背景不要杂乱。' },
    { title: '饰品工作台场景图', purpose: '测试使用联想', detail: '使用饰品工作台、工具、配件托盘等轻场景，体现饰品配件用途，但不要遮挡产品。' },
    { title: '产品细节放大图', purpose: '测试孔位、边缘、厚度展示', detail: '局部微距或细节放大，展示孔位、边缘、抛光、厚度和金属质感。' },
    { title: '多件整齐排列图', purpose: '测试批量感和采购感', detail: '多个同款产品整齐排列，保持每个产品形状比例准确，画面有批发采购感。' },
    { title: '包装袋/库存盒场景图', purpose: '测试现货库存感', detail: '可出现透明包装袋、库存盒或配件收纳盒作为背景元素，但不要遮挡产品，不要生成错误文字。' },
    { title: '极简高质感主图', purpose: '测试高级简洁风格', detail: '极简干净背景，柔和光影，突出产品质感，画面高级但不过度奢侈。' },
  ],
  背景风格测试: [
    { title: '白底背景', purpose: '测试白底商品图表现', detail: '使用白底背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '暖色背景', purpose: '测试暖色点击效果', detail: '使用暖色干净背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '浅灰背景', purpose: '测试高级金属质感', detail: '使用浅灰背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '米色背景', purpose: '测试柔和暖色风格', detail: '使用米色背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '石纹背景', purpose: '测试材质对比效果', detail: '使用浅色石纹背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '木纹桌面背景', purpose: '测试自然桌面氛围', detail: '使用木纹桌面背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '饰品托盘背景', purpose: '测试饰品陈列质感', detail: '使用饰品托盘背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '工厂现货背景', purpose: '测试现货批发感', detail: '使用轻工厂现货背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '包装库存背景', purpose: '测试库存发货感', detail: '使用包装或库存背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
    { title: '极简渐变背景', purpose: '测试极简商业风格', detail: '使用极简浅色渐变背景，只改变背景，不改变产品形状、比例、颜色、孔位和结构。' },
  ],
  构图角度测试: [
    { title: '正面居中构图', purpose: '测试标准主体识别', detail: '正面居中展示，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '45度角构图', purpose: '测试立体感', detail: '使用45度角构图，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '俯拍构图', purpose: '测试平铺展示效果', detail: '使用俯拍构图，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '微距局部构图', purpose: '测试细节吸引力', detail: '使用微距局部构图，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '左侧留白构图', purpose: '测试版面呼吸感', detail: '产品偏右并保留左侧留白，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '右侧留白构图', purpose: '测试版面平衡', detail: '产品偏左并保留右侧留白，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '多件平铺构图', purpose: '测试批量采购感', detail: '多件产品平铺展示，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '对角线构图', purpose: '测试画面动势', detail: '使用对角线构图，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '近景主体构图', purpose: '测试主体冲击力', detail: '使用近景主体构图，构图变化不能导致产品变形，主体必须清晰完整。' },
    { title: '主次层次构图', purpose: '测试层次感', detail: '使用主次层次构图，构图变化不能导致产品变形，主体必须清晰完整。' },
  ],
  卖点方向测试: [
    { title: '现货供应感', purpose: '测试现货卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '源头工厂感', purpose: '测试工厂供应卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '304不锈钢材质感', purpose: '测试材质卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '金属抛光质感', purpose: '测试工艺质感', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '防水耐用感', purpose: '测试耐用卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '批发采购感', purpose: '测试采购卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '跨境电商适用感', purpose: '测试跨境卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '可定制开发感', purpose: '测试定制卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '多规格选择感', purpose: '测试规格卖点', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
    { title: '高性价比采购感', purpose: '测试采购价值感', detail: '卖点只作为画面风格参考，不要生成乱码文字、价格、平台Logo或虚假认证。' },
  ],
  场景使用测试: [
    { title: '饰品DIY桌面场景', purpose: '测试DIY使用联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '项链配件应用场景', purpose: '测试项链应用联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '手链配件应用场景', purpose: '测试手链应用联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '耳饰配件应用场景', purpose: '测试耳饰应用联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '跨境卖家选品场景', purpose: '测试跨境选品联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '工厂打样场景', purpose: '测试打样供应联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '配件收纳盒场景', purpose: '测试收纳和库存联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '包装发货场景', purpose: '测试发货联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '批发采购场景', purpose: '测试批发采购联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
    { title: '成品搭配参考场景', purpose: '测试成品搭配联想', detail: '场景不能抢产品，不能添加错误配件，不能改变产品用途。' },
  ],
  细节图批量生成: [
    { title: '孔位细节', purpose: '测试孔位清晰度', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '边缘切割细节', purpose: '测试边缘工艺', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '厚度细节', purpose: '测试厚度表现', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '金属表面细节', purpose: '测试金属表面', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '抛光反光细节', purpose: '测试抛光反光', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '连接结构细节', purpose: '测试连接结构', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '正反面对比细节', purpose: '测试正反面差异', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '尺寸比例细节', purpose: '测试比例展示', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '材质纹理细节', purpose: '测试材质纹理', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
    { title: '整体与局部组合细节', purpose: '测试整体和局部组合', detail: '细节必须清晰，不要模糊，不要改变孔位和结构。' },
  ],
  SKU图批量生成: [
    { title: '不同颜色整齐排列', purpose: '测试颜色SKU展示', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '不同款式整齐排列', purpose: '测试款式SKU展示', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '同款多数量展示', purpose: '测试批量采购感', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '规格大小对比展示', purpose: '测试规格对比', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '金色/钢色/玫瑰金对比', purpose: '测试常用颜色对比', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '单品与多SKU组合', purpose: '测试主款和组合', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '货盘式排列', purpose: '测试批发陈列', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '九宫格排列', purpose: '测试多规格矩阵展示', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '横向排列', purpose: '测试横向浏览展示', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
    { title: '主款突出+其他SKU辅助', purpose: '测试主次SKU展示', detail: '不要生成不存在的SKU，不要改变颜色和结构，不要让款式差异混乱。' },
  ],
};

const setTemplateItems: Record<SetTemplate, SetItem[]> = {
  '1688基础套图': [
    { name: '主图', purpose: '用于商品首图，突出产品主体和点击率。' },
    { name: '白底图', purpose: '用于干净展示产品，方便买家判断形状、颜色和结构。' },
    { name: '尺寸图', purpose: '用于展示产品尺寸、比例，适合标注 mm 和 inch。' },
    { name: '场景图', purpose: '用于展示产品实际使用场景和搭配效果。' },
    { name: '材质细节图', purpose: '用于展示不锈钢材质、金属质感、表面工艺。' },
    { name: '孔位细节图', purpose: '用于展示孔位、连接结构、开孔位置。' },
    { name: '厚度细节图', purpose: '用于展示产品厚度、边缘、立体感。' },
    { name: 'SKU图', purpose: '用于展示颜色、规格、款式、多SKU选择。' },
    { name: '工厂现货图', purpose: '用于体现现货、批发、源头工厂供应感。' },
    { name: '包装/应用图', purpose: '用于展示包装、库存、应用方式或采购场景。' },
  ],
  '1688增强套图': [
    { name: '点击率主图', purpose: '适合 1688 商品详情页和主图测试，突出点击率。' },
    { name: '白底标准图', purpose: '规范展示产品形状、颜色和结构。' },
    { name: '尺寸标注图', purpose: '展示尺寸比例，适合添加 mm 和 inch 标注。' },
    { name: '多角度展示图', purpose: '展示产品不同角度，结构清晰。' },
    { name: '材质工艺图', purpose: '展示材质、工艺和金属质感。' },
    { name: '孔位结构图', purpose: '展示孔位、连接结构和开孔位置。' },
    { name: '厚度对比图', purpose: '展示产品厚度、边缘和立体感。' },
    { name: '使用场景图', purpose: '展示产品应用方式和搭配效果。' },
    { name: '工厂现货图', purpose: '体现批发采购、现货和源头工厂供应感。' },
    { name: '多SKU展示图', purpose: '展示颜色、规格、款式和多SKU选择。' },
  ],
  'Amazon基础套图': [
    { name: '白底主图', purpose: '适合 Amazon 商品页，规范、清晰、专业。' },
    { name: '尺寸图', purpose: '帮助跨境买家理解产品尺寸。' },
    { name: '佩戴/使用场景图', purpose: '展示真实使用或佩戴效果。' },
    { name: '材质细节图', purpose: '展示材质、金属质感和表面细节。' },
    { name: '工艺细节图', purpose: '展示抛光、边缘和连接结构。' },
    { name: '卖点说明图', purpose: '帮助买家理解材质、工艺或采购优势。' },
    { name: '包装图', purpose: '展示包装和礼品属性。' },
    { name: '礼品场景图', purpose: '展示礼品使用场景。' },
    { name: '多角度展示图', purpose: '展示不同角度和结构。' },
    { name: '品牌感场景图', purpose: '展示干净专业的品牌感场景。' },
  ],
  'Shopify/独立站套图': [
    { name: '品牌主图', purpose: '突出品牌感、高级感和产品质感。' },
    { name: '生活方式场景图', purpose: '展示生活方式和真实使用氛围。' },
    { name: '礼品场景图', purpose: '展示礼品属性和送礼氛围。' },
    { name: '材质细节图', purpose: '展示材质、金属质感和工艺。' },
    { name: '尺寸图', purpose: '展示尺寸和比例。' },
    { name: '佩戴/使用效果图', purpose: '展示真实佩戴或使用效果。' },
    { name: '包装图', purpose: '展示包装、收纳和礼品感。' },
    { name: '工艺细节图', purpose: '展示抛光、边缘和连接结构。' },
    { name: '情绪氛围图', purpose: '展示高级自然的情绪氛围。' },
    { name: '产品合集图', purpose: '展示多款或多SKU组合。' },
  ],
  'TEMU基础套图': [
    { name: '清晰主图', purpose: '适合 TEMU 移动端快速浏览。' },
    { name: '白底图', purpose: '干净展示产品主体。' },
    { name: '尺寸图', purpose: '展示尺寸比例。' },
    { name: '场景图', purpose: '展示真实使用场景。' },
    { name: '细节图', purpose: '展示产品关键细节。' },
    { name: '材质图', purpose: '展示材质和金属质感。' },
    { name: '多角度图', purpose: '展示不同角度。' },
    { name: 'SKU图', purpose: '展示多规格或多颜色选择。' },
    { name: '包装图', purpose: '展示包装和发货状态。' },
    { name: '卖点图', purpose: '表达清晰直接的商品卖点。' },
  ],
  '通用电商套图': [
    { name: '主图', purpose: '用于商品首图，突出产品主体。' },
    { name: '白底图', purpose: '干净展示产品形状、颜色和结构。' },
    { name: '尺寸图', purpose: '展示尺寸和比例。' },
    { name: '场景图', purpose: '展示使用场景和搭配效果。' },
    { name: '细节图', purpose: '展示关键细节和工艺。' },
    { name: '材质图', purpose: '展示材质和质感。' },
    { name: '多角度图', purpose: '展示不同角度。' },
    { name: 'SKU图', purpose: '展示多规格或多颜色。' },
    { name: '包装图', purpose: '展示包装或发货状态。' },
    { name: '应用图', purpose: '展示产品应用方式。' },
  ],
  自定义套图: [],
};
setTemplateItems.自定义套图 = setTemplateItems.通用电商套图;

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
    return raw ? (JSON.parse(raw) as LegacyPromptRecord[]).map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function normalizeRecord(record: LegacyPromptRecord): PromptRecord {
  const preset = getRequirementPreset(record.platform, record.imageType);
  return {
    ...record,
    extraRequirement: record.extraRequirement ?? '',
    positiveRequirements: record.positiveRequirements ?? preset.positive,
    negativeRequirements: record.negativeRequirements ?? preset.negative,
  };
}

function saveRecords(records: PromptRecord[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records.slice(0, 300)));
}

function uniqueLines(lines: string[]) {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

function toNumberedLines(lines: string[]) {
  return uniqueLines(lines).map((line, index) => `${index + 1}. ${line}`).join('\n');
}

function buildPrompt(form: PromptForm) {
  const ratio = ratioLabel(form.ratio);
  const intro = form.platform === '1688' && form.imageType === '1688主图'
    ? `请基于我上传的产品图，生成一张适合1688平台使用的${ratio}产品主图。`
    : `请基于我上传的产品图，生成一张适合${form.platform}平台使用的${ratio}${form.imageType}。`;

  const productLine = `产品是${form.productType}，材质为${form.material}${form.platform === '1688' ? '，适合现货批发销售' : ''}。`;
  const baseRequirements: string[] = [];

  if (form.platform === '1688') {
    baseRequirements.push('画面风格偏真实产品、工厂现货和批发采购，不夸张，适合买家点击。');
  }

  if (form.imageType === '1688主图') {
    baseRequirements.push(
      '请基于我上传的产品图生成一张适合1688平台使用的1:1产品主图。',
      '背景使用暖色系，干净、有质感。',
      '产品要真实，不要卡通，不要过度修饰。',
      '画面突出产品，适合1688买家点击。',
    );
  }

  if (form.imageType === '亚马逊白底主图') {
    baseRequirements.push(
      '使用白色纯背景，产品居中展示。',
      '保持真实电商主图风格。',
    );
  }

  if (form.imageType === '欧美模特佩戴图') {
    baseRequirements.push(
      '使用欧美女性模特和自然光环境。',
      '展示真实佩戴效果，突出饰品但不要让人物抢主体。',
    );
  }

  if (!baseRequirements.some((item) => item.includes(form.backgroundStyle))) {
    baseRequirements.push(`背景使用${form.backgroundStyle}。`);
  }

  const positiveLines = form.positiveRequirements.map((requirement) => positiveRequirementText[requirement]);
  const negativeLines = form.negativeRequirements.map((requirement) => negativeRequirementText[requirement]);

  if (form.extraRequirement.trim()) {
    positiveLines.push(form.extraRequirement.trim());
  }

  return `${intro}\n\n${productLine}\n\n基础要求：\n${toNumberedLines(baseRequirements)}\n\n【正向要求】\n${toNumberedLines(positiveLines)}\n\n【否定要求】\n${toNumberedLines(negativeLines)}\n\n输出真实电商产品图片效果。`;
}

function getBatchDirections(mode: BatchMode, count: BatchCount) {
  return batchDirectionPresets[mode].slice(0, count);
}

function buildVariationInstruction(dimensions: BatchVariationDimension[]) {
  if (dimensions.length === 0) {
    return '本组图片主要围绕图片方向本身做差异化测试。';
  }

  const instructionMap: Record<BatchVariationDimension, string> = {
    背景变化: '每个方向应体现不同背景。',
    构图变化: '每个方向应体现不同构图角度。',
    光线变化: '每个方向应体现柔光、自然光、商业摄影光、侧光、局部高光等差异。',
    卖点变化: '每个方向可以强调不同商业卖点，但不要在图片中生成大段文字。',
    场景变化: '每个方向可以出现不同轻场景，但产品仍然是主体。',
    产品展示重点变化: '每个方向可以强调整体、孔位、边缘、厚度、材质、用途等不同重点。',
  };

  return dimensions.map((dimension) => instructionMap[dimension]).join('\n');
}

function buildBatchPrompt(
  form: PromptForm,
  batchMode: BatchMode,
  batchCount: BatchCount,
  batchVariationDimensions: BatchVariationDimension[],
) {
  const directions = getBatchDirections(batchMode, batchCount);
  const positiveRequirements = form.positiveRequirements.map((requirement) => positiveRequirementText[requirement] ?? requirement);
  const negativeRequirements = form.negativeRequirements.map((requirement) => negativeRequirementText[requirement] ?? requirement);
  const directionText = directions.map((direction, index) => (
    `第${index + 1}张：${direction.title}\n图片目的：${direction.purpose}\n具体要求：${direction.detail}`
  )).join('\n\n');

  return `请基于我上传的产品图，生成${batchCount}张适合${form.platform}平台使用的${ratioLabel(form.ratio)}图片。

产品信息：
产品名称：以上传产品图为准
产品类型：${form.productType}
产品材质：${form.material}
产品颜色：以上传产品图为准
使用平台：${form.platform}
图片类型：${form.imageType}
图片比例：${form.ratio}
背景风格：${form.backgroundStyle}

重要总要求：
1. 必须保持产品原始形状。
2. 必须保持产品真实比例。
3. 必须保持产品颜色准确。
4. 必须保持孔位和结构清晰。
5. 必须保持金属质感真实。
6. 不要改变产品结构。
7. 不要改变产品比例。
8. 不要改变孔位。
9. 不要添加不存在的配件。
10. 不要让产品变形。
11. 不要让产品模糊。
12. 不要出现水印、品牌Logo、乱码文字。
13. 每张图片只改变背景、构图、光线、场景或展示重点，不改变产品本身。
14. 产品主体必须清晰，占画面主要位置。
15. 不要在图片中生成大段文字，卖点只作为画面风格参考。

变化维度：
${buildVariationInstruction(batchVariationDimensions)}

正向要求：
${positiveRequirements.join('；')}

否定要求：
${negativeRequirements.join('；')}

补充要求：
${form.extraRequirement.trim() || '无'}

请按以下${batchCount}个方向分别生成：

${directionText}`;
}

function getDefaultSetTemplateByPlatform(platform: Platform): SetTemplate {
  if (platform === '1688') return '1688基础套图';
  if (platform === 'Amazon') return 'Amazon基础套图';
  if (platform === 'Shopify独立站') return 'Shopify/独立站套图';
  if (platform === 'TEMU') return 'TEMU基础套图';
  return '通用电商套图';
}

function getSetItemsByTemplate(template: SetTemplate, count: SetCount) {
  return setTemplateItems[template].slice(0, count);
}

function getSetItemDetail(name: string) {
  if (['主图', '点击率主图', '清晰主图', '品牌主图'].includes(name)) {
    return '产品居中或主体突出，画面干净，适合平台首图使用，产品占比合理，买家一眼能看清产品。';
  }
  if (['白底图', '白底标准图', '白底主图'].includes(name)) {
    return '白色或接近白色背景，产品完整展示，边缘清晰，颜色准确，适合标准电商商品图。';
  }
  if (['尺寸图', '尺寸标注图'].includes(name)) {
    return '产品正面清晰展示，保持真实比例，预留尺寸标注空间，适合添加 mm 和 inch 标注，不要让标注遮挡产品。';
  }
  if (['场景图', '生活方式场景图', '使用场景图', '佩戴/使用场景图', '佩戴/使用效果图', '应用图'].includes(name)) {
    return '展示产品实际使用或应用场景，场景自然真实，道具不能抢产品，产品仍然是画面主体。';
  }
  if (['详情图', '细节图', '材质细节图', '材质图', '材质工艺图', '工艺细节图'].includes(name)) {
    return '展示产品表面、材质、金属质感、抛光效果和细节，画面高清清晰，不要模糊。';
  }
  if (['孔位细节图', '孔位结构图'].includes(name)) {
    return '重点展示孔位、连接孔、开孔位置、连接结构，孔位必须清晰，不要改变孔位和结构。';
  }
  if (['厚度细节图', '厚度对比图'].includes(name)) {
    return '展示产品边缘、厚度、立体感，可使用侧面或局部角度，但不能改变产品真实比例。';
  }
  if (['SKU图', '多SKU展示图', '产品合集图'].includes(name)) {
    return '展示不同颜色、规格、款式或多件排列，排列整齐，颜色区分清楚，不要生成不存在的SKU。';
  }
  if (name === '工厂现货图') {
    return '适度体现源头工厂、现货供应、批发采购感，可以有库存、托盘、包装等元素，但背景不能杂乱，产品仍然突出。';
  }
  if (['包装图', '包装/应用图'].includes(name)) {
    return '展示包装、收纳、发货或应用方式，包装元素简洁真实，不要出现错误文字、错误Logo或虚假品牌。';
  }
  if (['卖点说明图', '功能卖点图', '卖点图'].includes(name)) {
    return '围绕产品材质、工艺、使用场景或采购优势表达卖点，但不要生成大段文字，不要生成乱码，不要生成未经确认的认证信息。';
  }
  if (['多角度展示图', '多角度图'].includes(name)) {
    return '展示正面、侧面、局部或不同摆放角度，所有角度必须保持同一个产品，不要变形。';
  }
  if (['礼品场景图', '品牌感场景图', '情绪氛围图'].includes(name)) {
    return '适合独立站或 Amazon 使用，画面高级自然，有礼品感或品牌感，但不要过度奢侈，不要让场景抢产品。';
  }
  return '根据图片用途生成对应画面，保持同一个产品，突出产品主体，不改变产品形状、比例、颜色、孔位、结构和材质表现。';
}

function getPlatformSetStyle(platform: Platform) {
  if (platform === '1688') return '适合1688批发采购场景，突出产品主体、现货、批发、源头工厂和点击率，不要过度品牌海报化。';
  if (platform === 'Amazon') return '适合Amazon商品页，画面干净规范，主体清晰专业，不要复杂背景，不要促销标签，不要不合规文字。';
  if (platform === 'Shopify独立站') return '适合独立站品牌展示，突出品牌感、高级感、礼品属性和生活方式场景。';
  if (platform === 'TEMU') return '适合TEMU移动端快速浏览，画面直接清晰，产品主体突出，卖点表达明确。';
  return '适合电商商品展示，产品清晰、真实、干净、专业。';
}

function buildSetPrompt(
  form: PromptForm,
  selectedItems: SetItem[],
  setConsistencyRequirements: SetConsistencyRequirement[],
) {
  const setCount = selectedItems.length;
  const positiveRequirements = form.positiveRequirements.map((requirement) => positiveRequirementText[requirement] ?? requirement);
  const negativeRequirements = form.negativeRequirements.map((requirement) => negativeRequirementText[requirement] ?? requirement);
  const itemText = selectedItems.map((item, index) => (
    `第${index + 1}张：${item.name}\n图片用途：${item.purpose}\n具体要求：${getSetItemDetail(item.name)}`
  )).join('\n\n');

  return `请基于我上传的产品图，生成一套适合${form.platform}平台使用的${setCount}张商品图片。

这${setCount}张图片属于同一个产品的系列套图，不是随机测试图。
请分别生成主图、尺寸图、场景图、细节图等不同用途图片。
全套图片必须保持同一个产品的形状、比例、颜色、孔位、结构和材质表现一致。

平台风格说明：
${getPlatformSetStyle(form.platform)}

产品信息：
产品名称：以上传产品图为准
产品类型：${form.productType}
产品材质：${form.material}
产品颜色：以上传产品图为准
使用平台：${form.platform}
图片比例：${form.ratio || '方形1:1'}
背景风格：${form.backgroundStyle}

重要总要求：
1. 必须保持产品原始形状。
2. 必须保持产品真实比例。
3. 必须保持产品颜色准确。
4. 必须保持孔位和结构清晰。
5. 必须保持金属质感真实。
6. 不要改变产品结构。
7. 不要改变产品比例。
8. 不要改变孔位。
9. 不要添加不存在的配件。
10. 不要让产品变形。
11. 不要让产品模糊。
12. 不要出现水印、品牌Logo、乱码文字。
13. 不要每张图都生成成不同产品。
14. 不要在图片中生成大段文字。
15. 如果需要表达卖点，只作为画面方向参考，不要生成乱码文字。

正向要求：
${positiveRequirements.join('；')}

否定要求：
${negativeRequirements.join('；')}

系列一致性要求：
${setConsistencyRequirements.join('；')}

补充要求：
${form.extraRequirement.trim() || '无'}

请按以下${setCount}张图片分别生成：

${itemText}`;
}

function AIImagePromptCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [form, setForm] = useState<PromptForm>(defaultForm);
  const [prompt, setPrompt] = useState('');
  const [records, setRecords] = useState<PromptRecord[]>([]);
  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');
  const [imageTypeFilter, setImageTypeFilter] = useState<'all' | ImageType>('all');
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const [batchMode, setBatchMode] = useState<BatchMode>('主图点击测试');
  const [batchCount, setBatchCount] = useState<BatchCount>(10);
  const [batchVariationDimensions, setBatchVariationDimensions] = useState<BatchVariationDimension[]>(['背景变化', '构图变化', '光线变化']);
  const [batchPromptText, setBatchPromptText] = useState('');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('single');
  const [setTemplate, setSetTemplate] = useState<SetTemplate>(getDefaultSetTemplateByPlatform(defaultForm.platform));
  const [setCount, setSetCount] = useState<SetCount>(10);
  const [selectedSetItems, setSelectedSetItems] = useState<SetItem[]>(getSetItemsByTemplate(getDefaultSetTemplateByPlatform(defaultForm.platform), 10));
  const [setConsistencyRequirements, setSetConsistencyRequirements] = useState<SetConsistencyRequirement[]>(defaultSetConsistencyRequirements);
  const [setPromptText, setSetPromptText] = useState('');

  useEffect(() => {
    setRecords(readRecords());
  }, []);

  const positiveRequirementOptions = useMemo(
    () => uniqueItems([...getRequirementPreset(form.platform, form.imageType).positive, ...form.positiveRequirements]),
    [form.imageType, form.platform, form.positiveRequirements],
  );
  const negativeRequirementOptions = useMemo(
    () => uniqueItems([...getRequirementPreset(form.platform, form.imageType).negative, ...form.negativeRequirements]),
    [form.imageType, form.platform, form.negativeRequirements],
  );

  const filteredRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return records
      .filter((record) => platformFilter === 'all' || record.platform === platformFilter)
      .filter((record) => imageTypeFilter === 'all' || record.imageType === imageTypeFilter)
      .filter((record) => !normalizedKeyword || record.prompt.toLowerCase().includes(normalizedKeyword))
      .slice(0, visibleRecordLimit);
  }, [imageTypeFilter, keyword, platformFilter, records]);
  const batchDirections = useMemo(() => getBatchDirections(batchMode, batchCount), [batchCount, batchMode]);
  const setItemOptions = useMemo(() => getSetItemsByTemplate(setTemplate, setCount), [setCount, setTemplate]);

  const updateRecords = (nextRecords: PromptRecord[]) => {
    setRecords(nextRecords);
    saveRecords(nextRecords);
  };

  const applyScenarioRequirements = (platform: Platform, imageType: ImageType) => {
    const preset = getRequirementPreset(platform, imageType);
    return {
      positiveRequirements: preset.positive,
      negativeRequirements: preset.negative,
    };
  };

  const updatePlatform = (platform: Platform) => {
    setForm((current) => ({
      ...current,
      platform,
      ...applyScenarioRequirements(platform, current.imageType),
    }));
    const nextSetTemplate = getDefaultSetTemplateByPlatform(platform);
    setSetTemplate(nextSetTemplate);
    setSelectedSetItems(getSetItemsByTemplate(nextSetTemplate, setCount));
  };

  const updateImageType = (imageType: ImageType) => {
    setForm((current) => ({
      ...current,
      imageType,
      ...applyScenarioRequirements(current.platform, imageType),
    }));
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

  const toggleBatchVariationDimension = (dimension: BatchVariationDimension) => {
    setBatchVariationDimensions((current) => (
      current.includes(dimension)
        ? current.filter((item) => item !== dimension)
        : [...current, dimension]
    ));
  };

  const handleGenerateBatchPrompt = () => {
    const nextBatchPromptText = buildBatchPrompt(form, batchMode, batchCount, batchVariationDimensions);
    setBatchPromptText(nextBatchPromptText);
    setMessage('批量提示词已生成。');
  };

  const handleClearBatchPrompt = () => {
    setBatchPromptText('');
    setMessage('批量提示词已清空。');
  };

  const updateSetTemplate = (template: SetTemplate) => {
    setSetTemplate(template);
    setSelectedSetItems(getSetItemsByTemplate(template, setCount));
  };

  const updateSetCount = (count: SetCount) => {
    setSetCount(count);
    setSelectedSetItems(getSetItemsByTemplate(setTemplate, count));
  };

  const toggleSetItem = (item: SetItem) => {
    setSelectedSetItems((current) => (
      current.some((currentItem) => currentItem.name === item.name)
        ? current.filter((currentItem) => currentItem.name !== item.name)
        : [...current, item]
    ));
  };

  const toggleSetConsistencyRequirement = (requirement: SetConsistencyRequirement) => {
    setSetConsistencyRequirements((current) => (
      current.includes(requirement)
        ? current.filter((item) => item !== requirement)
        : [...current, requirement]
    ));
  };

  const handleGenerateSetPrompt = () => {
    if (selectedSetItems.length === 0) {
      setMessage('请至少选择一张套图内容。');
      return;
    }
    setSetPromptText(buildSetPrompt(form, selectedSetItems, setConsistencyRequirements));
    setMessage('系列套图提示词已生成。');
  };

  const handleClearSetPrompt = () => {
    setSetPromptText('');
    setMessage('系列套图提示词已清空。');
  };

  const togglePositiveRequirement = (requirement: PositiveRequirement) => {
    setForm((current) => {
      const hasRequirement = current.positiveRequirements.includes(requirement);
      return {
        ...current,
        positiveRequirements: hasRequirement
          ? current.positiveRequirements.filter((item) => item !== requirement)
          : [...current.positiveRequirements, requirement],
      };
    });
  };

  const toggleNegativeRequirement = (requirement: NegativeRequirement) => {
    setForm((current) => {
      const hasRequirement = current.negativeRequirements.includes(requirement);
      return {
        ...current,
        negativeRequirements: hasRequirement
          ? current.negativeRequirements.filter((item) => item !== requirement)
          : [...current.negativeRequirements, requirement],
      };
    });
  };

  const applyTemplate = (template: PromptTemplate) => {
    setForm((current) => {
      const nextPlatform = template.patch.platform ?? current.platform;
      const nextImageType = template.patch.imageType ?? current.imageType;
      return {
        ...current,
        ...template.patch,
        ...applyScenarioRequirements(nextPlatform, nextImageType),
      };
    });
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
            <select value={form.platform} onChange={(event) => updatePlatform(event.target.value as Platform)}>
              {platformOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <strong>图片类型</strong>
            <select value={form.imageType} onChange={(event) => updateImageType(event.target.value as ImageType)}>
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
          <strong>图片生成要求</strong>
          <p>系统会根据平台和图片类型自动匹配要求，也可以手动勾选或取消。</p>
          <div className="ai-prompt-requirement-group ai-prompt-positive-group">
            <h3>正向要求：希望图片做到</h3>
            <div className="ai-prompt-requirement-tags">
              {positiveRequirementOptions.map((requirement) => (
                <label key={requirement} className={form.positiveRequirements.includes(requirement) ? 'active' : ''}>
                  <input
                    type="checkbox"
                    checked={form.positiveRequirements.includes(requirement)}
                    onChange={() => togglePositiveRequirement(requirement)}
                  />
                  <span>{requirement}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="ai-prompt-requirement-group ai-prompt-negative-group">
            <h3>否定要求：禁止图片出现</h3>
            <div className="ai-prompt-requirement-tags">
              {negativeRequirementOptions.map((requirement) => (
                <label key={requirement} className={form.negativeRequirements.includes(requirement) ? 'active' : ''}>
                  <input
                    type="checkbox"
                    checked={form.negativeRequirements.includes(requirement)}
                    onChange={() => toggleNegativeRequirement(requirement)}
                  />
                  <span>{requirement}</span>
                </label>
              ))}
            </div>
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

        <section className="ai-prompt-mode-card">
          <strong>生成模式</strong>
          <div>
            {generationModes.map((mode) => (
              <button
                key={mode.key}
                className={generationMode === mode.key ? 'active' : ''}
                type="button"
                onClick={() => setGenerationMode(mode.key)}
              >
                <b>{mode.title}</b>
                <span>{mode.description}</span>
              </button>
            ))}
          </div>
        </section>

        {generationMode === 'single' && (
          <section className="ai-prompt-mode-panel">
            <div className="ai-prompt-actions">
              <button className="ai-prompt-primary-button" type="button" onClick={generatePrompt}>生成提示词</button>
              <button type="button" onClick={() => void copyText(prompt)}>一键复制</button>
            </div>

            <label className="ai-prompt-result">
              <strong>生成后的提示词</strong>
              <textarea value={prompt} placeholder="点击“生成提示词”后会显示在这里，也可以手动微调后再复制。" onChange={(event) => setPrompt(event.target.value)} />
            </label>
          </section>
        )}

        {generationMode === 'batch' && (
        <section className="ai-prompt-batch-card">
          <header>
            <div>
              <h2>批量提示词生成</h2>
              <p>根据当前产品信息、平台、图片类型和图片生成要求，生成适合复制到 GPT Pro 的批量图片提示词，一次测试多张不同方向的图片。</p>
            </div>
          </header>

          <section className="ai-prompt-batch-controls">
            <label>
              <strong>批量生成模式</strong>
              <select value={batchMode} onChange={(event) => setBatchMode(event.target.value as BatchMode)}>
                {batchModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <strong>生成数量</strong>
              <select value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value) as BatchCount)}>
                {batchCountOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </section>

          <section className="ai-prompt-batch-variations">
            <strong>变化维度</strong>
            <div className="ai-prompt-requirement-tags">
              {batchVariationOptions.map((dimension) => (
                <label key={dimension} className={batchVariationDimensions.includes(dimension) ? 'active' : ''}>
                  <input
                    type="checkbox"
                    checked={batchVariationDimensions.includes(dimension)}
                    onChange={() => toggleBatchVariationDimension(dimension)}
                  />
                  <span>{dimension}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="ai-prompt-actions">
            <button className="ai-prompt-primary-button" type="button" onClick={handleGenerateBatchPrompt}>生成批量提示词</button>
            <button type="button" onClick={() => void copyText(batchPromptText)}>复制批量提示词</button>
            <button className="ai-prompt-danger-button" type="button" onClick={handleClearBatchPrompt}>清空批量提示词</button>
          </div>

          <section className="ai-prompt-batch-result">
            <header>
              <div>
                <h3>批量提示词结果</h3>
                <p>当前将生成 {batchCount} 张图片方向，复制全部后可直接粘贴到 GPT Pro。</p>
              </div>
              <button type="button" onClick={() => void copyText(batchPromptText)}>复制全部</button>
            </header>
            <div className="ai-prompt-batch-direction-list">
              {batchDirections.map((direction, index) => (
                <span key={direction.title}>第{index + 1}张：{direction.title}</span>
              ))}
            </div>
            <textarea
              value={batchPromptText}
              placeholder="点击“生成批量提示词”后会显示完整批量提示词。"
              onChange={(event) => setBatchPromptText(event.target.value)}
            />
          </section>
        </section>
        )}

        {generationMode === 'set' && (
          <section className="ai-prompt-batch-card">
            <header>
              <div>
                <h2>系列套图提示词生成</h2>
                <p>根据当前产品信息，生成一整套适合商品上架使用的图片提示词，适合 1688、Amazon、Shopify、TEMU 等平台的完整商品展示。</p>
              </div>
            </header>

            <section className="ai-prompt-batch-controls">
              <label>
                <strong>套图模板</strong>
                <select value={setTemplate} onChange={(event) => updateSetTemplate(event.target.value as SetTemplate)}>
                  {setTemplateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <strong>套图数量</strong>
                <select value={setCount} onChange={(event) => updateSetCount(Number(event.target.value) as SetCount)}>
                  {setCountOptions.map((option) => <option key={option} value={option}>{option}张</option>)}
                </select>
              </label>
            </section>

            <section className="ai-prompt-set-items">
              <strong>本次套图内容</strong>
              <div>
                {setItemOptions.map((item) => (
                  <label key={item.name} className={selectedSetItems.some((selected) => selected.name === item.name) ? 'active' : ''}>
                    <input
                      type="checkbox"
                      checked={selectedSetItems.some((selected) => selected.name === item.name)}
                      onChange={() => toggleSetItem(item)}
                    />
                    <span>
                      <b>{item.name}</b>
                      <em>{item.purpose}</em>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="ai-prompt-batch-variations">
              <strong>系列一致性要求</strong>
              <div className="ai-prompt-requirement-tags">
                {defaultSetConsistencyRequirements.map((requirement) => (
                  <label key={requirement} className={setConsistencyRequirements.includes(requirement) ? 'active' : ''}>
                    <input
                      type="checkbox"
                      checked={setConsistencyRequirements.includes(requirement)}
                      onChange={() => toggleSetConsistencyRequirement(requirement)}
                    />
                    <span>{requirement}</span>
                  </label>
                ))}
              </div>
            </section>

            <div className="ai-prompt-actions">
              <button className="ai-prompt-primary-button" type="button" onClick={handleGenerateSetPrompt}>生成系列套图提示词</button>
              <button type="button" onClick={() => void copyText(setPromptText)}>复制系列套图提示词</button>
              <button className="ai-prompt-danger-button" type="button" onClick={handleClearSetPrompt}>清空系列套图提示词</button>
            </div>

            <section className="ai-prompt-batch-result">
              <header>
                <div>
                  <h3>系列套图提示词结果</h3>
                  <p>当前已选择 {selectedSetItems.length} 张套图内容，复制后可直接粘贴到 GPT Pro。</p>
                </div>
                <button type="button" onClick={() => void copyText(setPromptText)}>复制全部</button>
              </header>
              <div className="ai-prompt-batch-direction-list">
                {selectedSetItems.map((item, index) => (
                  <span key={item.name}>第{index + 1}张：{item.name}</span>
                ))}
              </div>
              <textarea
                value={setPromptText}
                placeholder="点击“生成系列套图提示词”后会显示完整提示词。"
                onChange={(event) => setSetPromptText(event.target.value)}
              />
            </section>
          </section>
        )}
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
