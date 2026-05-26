# AI 接入配置

默认不需要配置，系统会走 mock 请求层。

如需联调真实 GPT，在启动 Vite 前设置服务端环境变量：

```powershell
$env:AI_PROVIDER = "openai"
$env:OPENAI_API_KEY = "你的 OpenAI API Key"
$env:OPENAI_MODEL = "gpt-4o-mini"
npm.cmd run dev
```

本地代理自检：

```powershell
.\scripts\check-ai-proxy.ps1
```

如端口不是默认 `5176`：

```powershell
.\scripts\check-ai-proxy.ps1 -BaseUrl "http://127.0.0.1:你的端口"
```

安全约束：

- `OPENAI_API_KEY` 只在 `vite.config.js` 服务端代理中读取。
- 前端页面只请求 `/api/ai/operation-advice`，不会直接调用 OpenAI。
- `/api/ai/status` 只返回 `provider`、`hasApiKey`、`model`，不会返回 Key 内容。
- 真实 GPT 请求失败或响应解析失败时，会回退 mock 结构，页面不应崩溃。
