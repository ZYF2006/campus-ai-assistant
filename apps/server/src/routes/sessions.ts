import { Router } from "express";
import { createSession, getSession, clearHistory } from "../repositories/sessions.js";
import { HttpError } from "../lib/http-error.js";
import { acquireSession } from "../services/session-lock.js";

export const sessionsRouter = Router();
function sessionId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new HttpError(400, "会话编号格式不正确。");
  return value.toLowerCase();
}

sessionsRouter.post("/api/sessions", async (_request, response) => {
  response.status(201).json({ code: 0, message: "ok", data: await createSession() });
});
sessionsRouter.get("/api/sessions/:id", async (request, response) => {
  const data = await getSession(sessionId(request.params.id));
  if (!data) throw new HttpError(404, "会话不存在，请刷新页面。");
  response.json({ code: 0, message: "ok", data });
});
sessionsRouter.delete("/api/sessions/:id/messages", async (request, response) => {
  const id = sessionId(request.params.id);
  const release = acquireSession(id);
  if (!release) throw new HttpError(409, "正在生成回答，请稍后清空。");
  try {
    response.json({ code: 0, message: "ok", data: await clearHistory(id) });
  } finally {
    release();
  }
});
