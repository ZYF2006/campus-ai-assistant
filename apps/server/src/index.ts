import express from "express";
import type { ChatRequest, ChatMessage, ChatResponse } from "@campus-ai/shared-types";
import { isChatMessage } from "@campus-ai/shared-types";

const app = express();
const port = Number(process.env.PORT ?? 3000);

// 1. 解析 JSON 请求体；设置大小上限，避免客户端提交过大的数据拖垮服务。
app.use(express.json({ limit: "1mb" }));

// 2. 健康检查：用于确认后端与 Vite 代理已经连通。
app.get("/api/health", (_request, response) => {
  response.json({ message: "server is ready" });
});

// 3. 生成一条符合 ChatMessage 结构的助手消息。
function createAssistantMessage(content: string): ChatMessage {
  return {
    // crypto.randomUUID() 生成唯一消息编号。
    id: crypto.randomUUID(),
    role: "assistant",
    content,
  };
}

// 4. 统一的错误响应：HTTP 状态码 + 项目约定的业务状态码。
function sendError(
  response: express.Response,
  httpStatus: number,
  message: string,
  content: string,
): void {
  const errorResponse: ChatResponse = {
    // 业务状态码：非 0 表示失败。
    code: 1,
    message,
    data: createAssistantMessage(content),
  };

  response.status(httpStatus).json(errorResponse);
}

/**
 * POST /api/chat —— 模拟聊天接口。
 *
 * 后端接收 ChatRequest，读取最后一条用户消息，构造符合 ChatResponse 的模拟回复。
 * 本实验暂不调用真实大模型。
 *
 * 注意：TypeScript 的类型检查不能代替运行时数据校验。
 * 请求体来自外部，因此先按 unknown 处理，再用类型守卫校验，校验通过后才当作共享类型使用。
 */
app.post("/api/chat", (request, response) => {
  // Partial 表示请求中的字段可能缺失，因为外部数据不能完全信任。
  const body = request.body as Partial<ChatRequest> | undefined;

  // 先确认 messages 确实是数组，再取得最后一条消息。
  const lastMessage: unknown = Array.isArray(body?.messages)
    ? body.messages[body.messages.length - 1]
    : undefined;

  // 运行时校验：最后一条消息必须是合法的 ChatMessage，且来自用户。
  if (!isChatMessage(lastMessage)) {
    sendError(response, 400, "消息格式不合法", "消息格式不合法，请检查后重试");
    return;
  }

  const question = lastMessage.role === "user" ? lastMessage.content.trim() : "";

  // 空字符串表示没有收到有效问题。
  if (!question) {
    sendError(response, 400, "提交的消息不能为空", "请输入问题后再提交");
    return;
  }

  // 超出长度上限时直接拒绝，避免把超长输入透传给后续的大模型服务。
  if (question.length > 1000) {
    sendError(response, 413, "问题过长", "问题太长了，请精简到 1000 字以内");
    return;
  }

  // 创建格式符合 ChatResponse 的成功响应。
  const successResponse: ChatResponse = {
    // 业务状态码：0 表示成功。
    code: 0,
    message: "ok",
    data: createAssistantMessage(`我收到了你的问题：“${question}”。这是后端返回的模拟回复。`),
  };

  // 将成功响应转换为 JSON 并发送给前端。
  response.json(successResponse);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
