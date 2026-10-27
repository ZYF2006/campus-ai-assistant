import type { ApiResponse, ChatStreamEvent, SessionChatRequest } from "@campus-ai/shared-types";
import { once } from "node:events";
import { Router, type Response } from "express";
import { HttpError, toHttpError } from "../lib/http-error.js";
import { getSession, saveTurn } from "../repositories/sessions.js";
import { prepareConversation } from "../services/conversation.js";
import { streamConfiguredModel } from "../services/llm.js";
import { acquireSession } from "../services/session-lock.js";

export const chatStreamRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** TypeScript 只检查编译期；来自浏览器的 JSON 还需要运行时校验。 */
function validateBody(body: unknown): SessionChatRequest {
  if (
    !body ||
    typeof body !== "object" ||
    !("sessionId" in body) ||
    !("requestId" in body) ||
    !("content" in body) ||
    typeof body.sessionId !== "string" ||
    !uuid.test(body.sessionId) ||
    typeof body.requestId !== "string" ||
    !uuid.test(body.requestId) ||
    typeof body.content !== "string" ||
    !body.content.trim() ||
    Array.from(body.content.trim()).length > 1000
  ) {
    throw new HttpError(400, "请提交有效的会话编号、请求编号和 1～1000 字的问题");
  }
  return {
    sessionId: body.sessionId.toLowerCase(),
    requestId: body.requestId.toLowerCase(),
    content: body.content.trim(),
  };
}

function encodeEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function startStream(response: Response): void {
  if (!response.headersSent)
    response.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
}

function sendError(response: Response, error: unknown, timedOut: boolean): void {
  if (response.destroyed || response.writableEnded) return;
  const problem = timedOut ? new HttpError(504, "生成超时，请重试") : toHttpError(error);
  if (response.headersSent) {
    response.end(encodeEvent({ type: "error", message: problem.message }));
  } else {
    const result: ApiResponse<null> = { code: 1, message: problem.message, data: null };
    response.status(problem.status).json(result);
  }
}

chatStreamRouter.post("/api/chat/stream", async (request, response) => {
  let body: SessionChatRequest;
  try {
    body = validateBody(request.body);
  } catch (error) {
    sendError(response, error, false);
    return;
  }
  // 单进程教学版：同一会话一次只允许一个生成或修改操作。
  const release = acquireSession(body.sessionId);
  if (!release) {
    sendError(response, new HttpError(409, "该会话正在处理请求，请稍后重试"), false);
    return;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 300_000);
  const onClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on("close", onClose);

  try {
    const session = await getSession(body.sessionId);
    if (!session) throw new HttpError(404, "会话不存在，请重新加载页面");
    const previousQuestion = session.messages.find((message) => message.id === body.requestId);
    if (
      previousQuestion &&
      (previousQuestion.role !== "user" || previousQuestion.content !== body.content)
    ) {
      throw new HttpError(409, "同一请求编号不能用于不同的问题");
    }
    // 成功历史按一问一答排序；已完成编号直接返回原答案。
    const position = session.messages.findIndex((message) => message.id === body.requestId);
    const savedReply = position >= 0 ? session.messages[position + 1] : undefined;
    if (position >= 0 && savedReply?.role !== "assistant")
      throw new Error("历史问答不完整，请检查记录。");
    controller.signal.throwIfAborted();
    if (savedReply) {
      // 回答已经落库但浏览器没收到 done：直接重放，不再调用模型或重复写入。
      startStream(response);
      response.end(
        encodeEvent({ type: "delta", text: savedReply.content }) +
          encodeEvent({ type: "done", finishReason: "stop" }),
      );
      return;
    }

    const messages = await prepareConversation(body, controller.signal);
    let answer = "";
    for await (const event of streamConfiguredModel(messages, controller.signal)) {
      controller.signal.throwIfAborted();
      if (event.type === "delta") {
        answer += event.text;
        if (answer.length > 32000) throw new Error("回答过长，请缩小问题范围后重试");
        startStream(response);
        if (!response.write(encodeEvent(event)))
          await once(response, "drain", { signal: controller.signal });
      } else {
        if (event.finishReason !== "stop")
          throw new Error(`回答未完整结束（${event.finishReason}），本轮未保存，可重试`);
        if (!answer.trim()) throw new Error("模型未返回正文，本轮未保存");
        // 完整的一轮一起提交；只有提交成功，done 才表示“已生成且已保存”。
        await saveTurn(body.sessionId, body.requestId, body.content, answer);
        startStream(response);
        response.end(encodeEvent({ type: "done", finishReason: "stop" }));
        return;
      }
    }
    throw new Error("连接提前结束，本轮未保存，请重试");
  } catch (error) {
    sendError(response, error, timedOut);
  } finally {
    clearTimeout(timer);
    response.off("close", onClose);
    controller.abort();
    release();
  }
});
