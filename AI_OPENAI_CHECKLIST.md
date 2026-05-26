# OpenAI 联调检查清单

本清单用于真实 `AI_PROVIDER=openai` 联调前后人工验收。

## 启动前

- [ ] 已确认本地代码 `npx.cmd tsc -b` 通过。
- [ ] 已确认前端源码中没有 `OPENAI_API_KEY`、`Authorization`、`Bearer`。
- [ ] 已设置服务端环境变量 `AI_PROVIDER=openai`。
- [ ] 已设置服务端环境变量 `OPENAI_API_KEY`。
- [ ] 如需指定模型，已设置 `OPENAI_MODEL`；未设置时默认 `gpt-4o-mini`。
- [ ] 未把 API Key 写入代码、文档、截图或浏览器 localStorage。

## 启动后

- [ ] 启动 Vite dev server。
- [ ] 打开 `/api/ai/status`。
- [ ] 确认 `provider` 为 `openai`。
- [ ] 确认 `hasApiKey` 为 `true`。
- [ ] 确认接口没有返回 Key 内容。
- [ ] 如 `provider` 仍为 `mock`，先检查环境变量是否在启动 Vite 前设置。

## 代理自检

- [ ] 运行 `.\scripts\check-ai-proxy.ps1`。
- [ ] 确认脚本能读取 `/api/ai/status`。
- [ ] 确认脚本能请求 `/api/ai/operation-advice`。
- [ ] 正常 OpenAI 返回时，`Advice provider` 应为 `openai-gpt`。
- [ ] 若 OpenAI 失败，允许返回 `mock-gpt`，但应记录 fallback 原因。

## 页面联调

- [ ] 打开运营诊断页。
- [ ] 顶部 AI 状态显示 `openai / 模型名`。
- [ ] 点击 `生成 AI Context`。
- [ ] 点击 `生成 AI 建议`。
- [ ] AI 建议结果能展示 summary、问题概况、关键原因、推荐动作、风险提示。
- [ ] 结果右上角 provider / model 正确。
- [ ] `复制 AI Context` 可用。
- [ ] `复制 AI 建议预览` 可用。
- [ ] `复制 AI 响应 JSON` 可用。

## 回退验证

- [ ] 临时移除或不设置 `OPENAI_API_KEY` 后重启。
- [ ] `/api/ai/status` 返回 `provider: mock`。
- [ ] 页面仍可生成 AI 建议。
- [ ] 结果 provider 显示 `mock-gpt`。
- [ ] 页面不崩溃。

## 任务闭环验证

- [ ] 在 AI 建议结果里选择单条推荐动作。
- [ ] 点击 `生成任务草稿`。
- [ ] 任务中心能看到新任务。
- [ ] 新任务带 `AI 建议生成` 标签。
- [ ] AI 来源筛选能筛出该任务。
- [ ] 顶部 `AI 未完成` 指标增加。
- [ ] 填写结果时，AI 任务结果模板自动出现。
- [ ] 完成任务后，`AI 完成率` 能更新。
- [ ] 点击 `填写复盘` 时，AI 复盘模板自动出现。
- [ ] 单条 `复制 AI 反馈` 可用。
- [ ] `复制当前 AI 反馈` 可按筛选条件批量复制。
- [ ] 任务日报中该任务带 `[AI]` 标记。

## 日志检查

- [ ] 服务端控制台出现 `[ai-proxy]` 日志。
- [ ] 成功时日志包含 `openai_success` 和 requestId。
- [ ] 回退时日志包含 `fallback` 和 reason。
- [ ] 日志不包含 API Key。
- [ ] 日志不包含完整 prompt。

## 质量观察

- [ ] AI 建议是否具体可执行。
- [ ] 推荐动作是否能明确责任角色。
- [ ] 是否包含不该出现的臆测。
- [ ] 是否过度泛化。
- [ ] 是否需要补充商品、广告、库存、价格、活动、售后等上下文。
- [ ] 将有效和无效样本按 `AI_FEEDBACK_GUIDE.md` 整理。
