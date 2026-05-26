# AI 接入阶段总结

本文记录第 9 步至当前阶段的 AI 接入状态，便于后续开发和交接。

## 当前链路

运营诊断页：

1. 规则引擎生成异常结果。
2. 前端调用 `buildAiContext` 生成 `AiContext`。
3. 前端只调用 `aiRequestClient.generateOperationAdvice`。
4. `openAiRequestClient` 请求本地代理 `/api/ai/operation-advice`。
5. Vite middleware 根据服务端环境变量决定：
   - 默认或缺少 Key：返回 mock。
   - `AI_PROVIDER=openai` 且存在 `OPENAI_API_KEY`：调用 OpenAI。
6. OpenAI 请求失败或解析失败：服务端回退 mock。
7. 前端收到异常响应或代理失败：前端回退 `mockAiRequestClient`。

## 安全边界

- 页面不直接调用 OpenAI。
- 前端源码不读取、不保存、不展示 `OPENAI_API_KEY`。
- API Key 只从 `vite.config.js` 服务端环境变量读取。
- `/api/ai/status` 只返回 `provider`、`configuredProvider`、`hasApiKey`、`model`。
- 代理日志只记录 provider、requestId、fallback 原因，不记录完整 prompt 或 Key。

## 已有文件

AI 请求层：

- `src/ai/aiRequestClient.ts`
- `src/ai/mockAiRequestClient.ts`
- `src/ai/request/openAiRequestClient.ts`
- `src/ai/request/buildAiSuggestionPrompt.ts`
- `src/ai/request/validateAiAdviceResponse.ts`
- `src/ai/request/aiRuntimeStatusClient.ts`

服务端代理：

- `vite.config.js`
  - `/api/ai/status`
  - `/api/ai/operation-advice`

说明与工具：

- `AI_SETUP.md`
- `AI_FEEDBACK_GUIDE.md`
- `scripts/check-ai-proxy.ps1`

## 页面能力

运营诊断页：

- 生成 AI Context。
- 生成 AI 建议。
- 显示 AI runtime 状态。
- 显示 provider / model。
- 复制 AI Context。
- 复制 AI 建议预览。
- 复制完整 AI 响应 JSON。
- 将单条 AI 推荐动作生成任务草稿。

任务中心：

- AI 任务显示 `AI 建议生成` 标签。
- 支持按 AI 来源筛选。
- 顶部显示 `AI 未完成`。
- 复盘区显示 `AI 完成率`。
- AI 任务填写结果时预填结构化模板。
- AI 任务填写复盘时预填结构化模板。
- 支持复制单条 AI 反馈 JSON。
- 支持按当前筛选批量复制 AI 反馈 JSON。
- 任务日报中 AI 任务追加 `[AI]` 标记。

## 环境变量

默认走 mock。

真实 GPT 联调需要在启动 Vite 前设置：

```powershell
$env:AI_PROVIDER = "openai"
$env:OPENAI_API_KEY = "你的 OpenAI API Key"
$env:OPENAI_MODEL = "gpt-4o-mini"
npm.cmd run dev
```

## 验证方式

类型检查：

```powershell
npx.cmd tsc -b
```

代理自检：

```powershell
.\scripts\check-ai-proxy.ps1
```

非默认端口：

```powershell
.\scripts\check-ai-proxy.ps1 -BaseUrl "http://127.0.0.1:你的端口"
```

## 后续建议

1. 真实环境联调 OpenAI 返回质量。
2. 根据 AI 反馈样本评估 Prompt 是否需要调整。
3. 如需长期留痕，再设计 AI 响应和 AI 反馈样本池的数据结构。
4. 如需生产部署，建议把 AI 代理从 Vite middleware 迁移到正式后端服务。
