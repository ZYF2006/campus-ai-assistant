# 校园 AI 助手

这是《AI 大前端项目开发》的贯穿式教学案例。项目采用 pnpm Monorepo，包含 Vue 3 前端、Express 后端和前后端共享的 TypeScript 类型包。

当前进度：已完成类型安全的全栈聊天框架，并在后端接入**真实大模型**——通过统一入口 `services/llm.ts` 调用阿里百炼（DashScope）的 OpenAI 兼容接口。后续课程将在同一项目上逐步加入流式响应、多轮对话、RAG、Agent 和部署功能。

## 本讲学习目标

- 理解 pnpm workspace 与 Monorepo 的项目组织方式；
- 使用 TypeScript 为聊天请求和响应建模；
- 通过 workspace 包实现前后端类型共享；
- 理解 Vue、Pinia、前端 API 模块和 Express 的职责；
- 用「统一入口 + 供应商隔离」的方式接入在线大模型，并守住 API Key 的安全边界。

## 项目结构

```text
campus-ai-assistant/
├─ apps/
│  ├─ web/                  # Vue 3 前端
│  │  ├─ src/
│  │  │  ├─ api/chat.ts     # 封装聊天请求
│  │  │  ├─ components/
│  │  │  │  └─ MessageItem.vue
│  │  │  ├─ stores/chat.ts  # Pinia 聊天状态
│  │  │  ├─ App.vue
│  │  │  ├─ env.d.ts
│  │  │  └─ main.ts
│  │  ├─ index.html
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ vite.config.ts
│  └─ server/               # Express 后端
│     ├─ src/
│     │  ├─ index.ts        # 路由：运行时校验 + 包装 ChatResponse
│     │  └─ services/
│     │     └─ llm.ts       # 大模型统一入口（供应商差异隔离在这里）
│     ├─ .env.example
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  └─ shared-types/         # 前后端共享类型
│     ├─ src/index.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ .husky/                  # Git 提交检查
├─ eslint.config.js
├─ prettier.config.mjs
├─ commitlint.config.cjs
├─ lint-staged.config.mjs
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

## 已配置内容

- pnpm Monorepo；
- Vue 3、Vite、Pinia、TypeScript；
- Express、TypeScript、dotenv；
- `shared-types` workspace 包；
- ESLint、Prettier、Husky、lint-staged、commitlint；
- Vite `/api` 代理；
- Express `/api/health` 健康检查；
- 阿里百炼（OpenAI 兼容接口）在线大模型接入。

## 环境变量

密钥只能保存在后端。复制模板后填写自己的真实值：

```powershell
cd apps/server
Copy-Item .env.example .env
```

`apps/server/.env` 需要包含：

```dotenv
PORT=3000
LLM_PROVIDER=bailian

DASHSCOPE_API_KEY=填写自己的真实Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=glm-5.1
```

- `LLM_PROVIDER`：当前支持 `bailian`。切换模型服务只改这一行并重启后端，前端代码无需修改。
- `DASHSCOPE_MODEL`：请填写自己在百炼控制台已开通、可用的模型名。
- `.env` 已被 `.gitignore` 忽略；仓库里只提交不含密钥的 `.env.example`。

## 环境要求

- Node.js 20.19 或更高版本；
- pnpm 11 或更高版本。

## 获取与运行

```powershell
git clone https://gitee.com/jihongwang/campus-ai-assistant.git
cd campus-ai-assistant
pnpm install
pnpm dev
```

默认地址：

- 前端：<http://localhost:5173>
- 后端健康检查：<http://localhost:3000/api/health>

页面必须通过 HTTP 地址打开，不能双击 HTML 文件使用 `file://`。

## 全栈调用链

```text
App.vue
   ↓
Pinia Store
   ↓
api/chat.ts
   ↓ POST /api/chat
Vite 开发代理
   ↓
Express 后端（apps/server/src/index.ts）
   ↓ services/llm.ts（统一入口，按 LLM_PROVIDER 选择供应商）
   ↓
阿里百炼 /chat/completions（API Key 只在这一段由后端加入）
   ↓
Express 包装成 ChatResponse
   ↓
Pinia Store → Vue 页面
```

`@campus-ai/shared-types` 同时被前端和后端使用，避免重复定义聊天数据结构。
浏览器只知道 `/api/chat`，永远拿不到 `DASHSCOPE_API_KEY`。

## 核心接口

### 健康检查

```http
GET /api/health
```

### 聊天

```http
POST /api/chat
Content-Type: application/json
```

请求体：

```json
{
  "messages": [
    {
      "id": "1",
      "role": "user",
      "content": "你好"
    }
  ]
}
```

成功响应（`data.content` 为模型生成的真实回答）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "服务端生成的消息编号",
    "role": "assistant",
    "content": "模型返回的回答"
  }
}
```

失败响应：

| 情形 | HTTP | `message` |
| --- | --- | --- |
| 消息为空或缺少 user 消息 | 400 | `消息不能为空` |
| `LLM_PROVIDER` 填了不支持的值 | 502 | `LLM_PROVIDER只能填写bailian` |
| 未配置 `DASHSCOPE_API_KEY` | 502 | `未配置阿里百炼DASHSCOPE_API_KEY` |
| 上游返回非 2xx | 502 | `阿里百炼调用失败：HTTP <状态码> <状态说明>` |
| 上游超时（120 秒） | 502 | `阿里百炼调用超时，请稍后重试` |
| 上游返回空内容 | 502 | `阿里百炼没有返回有效内容` |

## 常用命令

```powershell
pnpm dev          # 同时启动前端和后端
pnpm check        # ESLint + 类型检查 + 构建
pnpm format       # 格式化代码
```

## 开发约定

- 共享类型只定义在 `packages/shared-types` 中；
- 前端组件不直接编写 `fetch`，HTTP 请求统一放在 `src/api`；
- 所有网络 HTTP 调用（包括 `fetch`）统一放在 `src/api`，模型调用只允许出现在后端 `services`；
- Pinia 只保存当前页面状态，本讲不使用 `localStorage`；
- API Key 只能保存在后端环境变量中，不能写入前端、不能硬编码、不能提交到仓库；
- 路由只调用 `services/llm.ts` 的 `chatWithConfiguredModel`，不判断厂商；
- 发给模型的 `messages` 只包含 `role` 和 `content`，不 `stream`；
- 消息内容使用 Vue 文本插值显示，不使用 `v-html`；
- 错误文案必须可理解，且绝不含 API Key；
- 每次提交前运行 `pnpm check`。

## 常见问题

### 页面提示「未配置阿里百炼DASHSCOPE_API_KEY」

后端 `apps/server/.env` 里的 `DASHSCOPE_API_KEY` 还是空的。填入真实 Key 后重启后端。

### 页面提示「阿里百炼调用失败：HTTP 401/403」

Key、地域、`DASHSCOPE_BASE_URL` 与模型权限需要属于同一个服务与地域，逐项核对。

### 页面提示「阿里百炼调用失败：HTTP 404」

`DASHSCOPE_MODEL` 通常是控制台里不存在或未开通的模型名，改成自己可用的模型。

### 出现 `file:///api/chat` 或 CORS 错误

不要双击 HTML 文件。执行 `pnpm dev` 后访问 <http://localhost:5173>。

### 端口被占用

关闭占用 3000 或 5173 端口的旧进程，然后重新执行 `pnpm dev`。

提交信息示例：

```powershell
git commit -m "feat: 接入在线大模型"
```

完整提交示例：

```powershell
pnpm check
git status
git ls-files apps/server/.env   # 应输出为空，确认密钥没被跟踪
git add .
git commit -m "feat: 接入在线大模型"
git push origin main
```

## 后续演进

```text
在线大模型 → 流式响应 → 多轮会话 → RAG 知识库
        → Agent 工具调用 → 云端部署
```

后续实验继续迭代本项目，不重新创建技术框架。
