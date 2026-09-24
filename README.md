# 校园 AI 助手：课程起始项目

这是《AI 大前端项目开发》的贯穿式教学案例。项目采用 pnpm Monorepo，包含 Vue 3 前端、Express 后端和前后端共享的 TypeScript 类型包。

第 1 讲的目标是完成类型安全的全栈模拟聊天框架。后端暂不调用真实大模型；后续课程将在同一项目上逐步加入大模型 API、流式响应、多轮对话、RAG、Agent 和部署功能。

## 本讲学习目标

- 理解 pnpm workspace 与 Monorepo 的项目组织方式；
- 使用 TypeScript 为聊天请求和响应建模；
- 通过 workspace 包实现前后端类型共享；
- 理解 Vue、Pinia、前端 API 模块和 Express 的职责；
- 完成一次完整的前端请求、后端处理和页面渲染流程。

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
│     ├─ src/index.ts
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
- Express `/api/health` 健康检查。

## 第 1 讲实践内容

- 定义 `ChatMessage`、`ApiResponse<T>` 等共享类型；
- 实现 `POST /api/chat`；
- 创建消息组件、输入区域和聊天页面；
- 创建 Pinia 聊天 Store；
- 完成前后端请求、错误处理和交互细节。

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
Express 后端
   ↓ ChatResponse
Pinia Store → Vue 页面
```

`@campus-ai/shared-types` 同时被前端和后端使用，避免重复定义聊天数据结构。

## 核心接口

### 健康检查

```http
GET /api/health
```

### 模拟聊天

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

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "服务端生成的消息编号",
    "role": "assistant",
    "content": "模拟回复内容"
  }
}
```

## 常用命令

```powershell
pnpm dev          # 同时启动前端和后端
pnpm check        # ESLint + 类型检查 + 构建
pnpm format       # 格式化代码
```

## 开发约定

- 共享类型只定义在 `packages/shared-types` 中；
- 前端组件不直接编写 `fetch`，HTTP 请求统一放在 `src/api`；
- Pinia 只保存当前页面状态，本讲不使用 `localStorage`；
- API Key 只能保存在后端环境变量中，不能写入前端；
- 消息内容使用 Vue 文本插值显示，不使用 `v-html`；
- 每次提交前运行 `pnpm check`。

## 常见问题

### 出现 `file:///api/chat` 或 CORS 错误

不要双击 HTML 文件。执行 `pnpm dev` 后访问 <http://localhost:5173>。

### 页面一直显示“正在回复”

先访问 <http://localhost:3000/api/health> 确认后端已启动，再确认 `/api/chat` 的每个处理分支最终都执行了 `response.json(...)` 或 `response.end()`。

### 端口被占用

关闭占用 3000 或 5173 端口的旧进程，然后重新执行 `pnpm dev`。

提交信息示例：

```powershell
git commit -m "feat: 完成消息组件"
```

完整提交示例：

```powershell
pnpm check
git add .
git commit -m "feat: 完成全栈模拟聊天框架"
git push origin master
```

## 后续演进

```text
模拟聊天 → 真实大模型 → 流式响应 → 多轮会话
        → RAG 知识库 → Agent 工具调用 → 云端部署
```

后续实验继续迭代本项目，不重新创建技术框架。
