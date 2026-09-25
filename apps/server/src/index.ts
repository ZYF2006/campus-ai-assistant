// 必须最先加载：把 apps/server/.env 里的配置（含 API Key）注入 process.env。
import "dotenv/config";

import type { ChatRequest, ChatResponse } from "@campus-ai/shared-types";
import express from "express";

import { chatWithConfiguredModel } from "./services/llm.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

// 解析 JSON 请求体；限制大小可以避免客户端提交过多数据。
app.use(express.json({ limit: "1mb" }));

// 健康检查：用于确认 Express 与 Vite 代理已经连通。
app.get("/api/health", (_request, response) => {
  response.json({ message: "server is ready" });
});

/** 统一构造一条助手消息（成功与失败都复用，保证响应结构一致）。 */
function createAssistantMessage(content: string): ChatResponse["data"] {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
  };
}

/**
 * POST /api/chat —— 真实调用大模型。
 *
 * Express 只负责 HTTP：运行时校验请求、把模型调用交给 services/llm.ts、
 * 再把模型返回的 string 包装成 ChatResponse。
 */
app.post("/api/chat", async (request, response) => {
  // 关键知识点：TypeScript 不能验证外部 JSON，所以仍需做运行时检查。
  const requestBody = request.body as Partial<ChatRequest> | undefined;
  const messages = Array.isArray(requestBody?.messages) ? requestBody.messages : [];
  const latestMessage = messages.at(-1);

  const userQuestion =
    latestMessage?.role === "user" && typeof latestMessage.content === "string"
      ? latestMessage.content.trim()
      : "";

  if (!userQuestion) {
    const errorResponse: ChatResponse = {
      code: 1,
      message: "消息不能为空",
      data: createAssistantMessage("请输入问题后再发送。"),
    };

    response.status(400).json(errorResponse);
    return;
  }

  try {
    // 关键知识点：模型调用交给独立服务，由 LLM_PROVIDER 决定用哪个模型服务。
    const assistantContent = await chatWithConfiguredModel(messages);

    const successResponse: ChatResponse = {
      code: 0,
      message: "ok",
      data: createAssistantMessage(assistantContent),
    };

    response.json(successResponse);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "大模型服务异常";

    // 关键知识点：错误文案必须能被用户看懂，且绝不能包含 API Key。
    const errorResponse: ChatResponse = {
      code: 1,
      message: errorMessage,
      data: createAssistantMessage(errorMessage),
    };

    // 502 表示 Express 本身正常，但它调用的上游大模型服务失败。
    response.status(502).json(errorResponse);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
