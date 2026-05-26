# AI 文档入口

本文档用于快速定位当前项目的 AI 接入资料。

## 推荐阅读顺序

1. [AI_INTEGRATION_SUMMARY.md](./AI_INTEGRATION_SUMMARY.md)
   - 了解当前 AI 请求链路、安全边界、已完成能力。
   - 适合接手开发或回顾阶段成果时先读。

2. [AI_SETUP.md](./AI_SETUP.md)
   - 查看本地 mock、真实 OpenAI 联调、代理自检脚本的配置方式。
   - 适合准备启动项目或切换 `AI_PROVIDER=openai` 前阅读。

3. [AI_OPENAI_CHECKLIST.md](./AI_OPENAI_CHECKLIST.md)
   - 按清单检查真实 OpenAI 接入是否安全、可回退、页面不崩溃。
   - 适合真实 Key 联调前后逐项验收。

4. [AI_FEEDBACK_GUIDE.md](./AI_FEEDBACK_GUIDE.md)
   - 记录和评估 AI 建议质量。
   - 适合完成任务闭环后，把反馈整理给后续 prompt 或模型优化使用。

## 当前原则

- 开发环境默认走 mock。
- 只有 `AI_PROVIDER=openai` 且存在 `OPENAI_API_KEY` 时才走真实 GPT。
- 页面只调用 `aiRequestClient.generateOperationAdvice`。
- 页面不直接调用 OpenAI，也不暴露 API Key。
- 真实请求失败或解析失败时必须回退 mock 或显示可控错误。

## 常用命令

类型检查：

```powershell
npx.cmd tsc -b
```

真实代理自检：

```powershell
.\scripts\check-ai-proxy.ps1
```

指定端口自检：

```powershell
.\scripts\check-ai-proxy.ps1 -BaseUrl "http://127.0.0.1:5176"
```

## 下一阶段建议

优先做真实联调记录，不急着扩大功能面：

- 使用真实 Key 跑一次 `/api/ai/status` 和 `/api/ai/operation-advice`。
- 保存一组 AI 响应 JSON 和任务反馈 JSON。
- 根据反馈再决定是否优化 prompt、解析结构或页面提示。
