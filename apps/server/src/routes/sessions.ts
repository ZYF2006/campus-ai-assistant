import { Router } from "express";
import { createSession, getSession, clearHistory } from "../repositories/sessions.js";
import { HttpError } from "../lib/http-error.js";
import { acquireSession } from "../services/session-lock.js";

/**
 * 创建并导出会话路由对象。
 * 主程序需要通过类似下面的代码挂载它：
 * app.use(sessionsRouter);
 * 挂载后，下面注册的接口才能接收请求。
 */
export const sessionsRouter = Router();

/**
 * 检查编号是否符合UUID常见的文本形式：
 * 8位-4位-4位-4位-12位十六进制字符。
 *
 * 例如：
 * 550e8400-e29b-41d4-a716-446655440000
 *
 * 正则表达式说明：
 * ^        ：从字符串开头开始匹配；
 * [0-9a-f] ：允许数字0～9及字母a～f；
 * {8}      ：前面的字符连续出现8次；
 * -        ：字面上的连接符；
 * $        ：匹配到字符串末尾；
 * i        ：忽略字母大小写；
 */
function sessionId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new HttpError(400, "会话编号格式不正确。");
  return value.toLowerCase();
}

/**
 * 接口一：创建会话。
 *
 * POST /api/sessions
 *
 * 新会话暂时没有问题、回答和摘要。
 * 编号由后端生成，不需要前端传入。
 */
sessionsRouter.post("/api/sessions", async (_request, response) => {
  /**
   * _request：请求对象，本接口没有使用它。
   * response：响应对象，用于向前端发送状态码和数据。
   * await createSession()：等待数据库创建完成，再组装响应。
   *
   * status(201)：设置HTTP状态码，201表示资源创建成功。
   * json(...)：将对象转换为JSON并发送给前端。
   */
  response.status(201).json({ code: 0, message: "ok", data: await createSession() });
});

/**
 * 接口二：读取会话
 */
sessionsRouter.get("/api/sessions/:id", async (request, response) => {
  /**
   * 这一行按以下顺序执行：
   * 1. request.params.id：取得路径中的编号；
   * 2. sessionId(...)：检查格式并转成小写；
   * 3. getSession(...)：查询数据库；
   * 4. await：等待查询完成，把结果赋给data。
   */
  const data = await getSession(sessionId(request.params.id));
  if (!data) throw new HttpError(404, "会话不存在，请刷新页面。");
  response.json({ code: 0, message: "ok", data });
});

/**
 * 接口三：清空会话历史。
 * DELETE /api/sessions/:id/messages
 *
 * 删除的是会话中的消息，同时清空派生摘要；
 * 会话本身和会话编号仍然保留。
 */
sessionsRouter.delete("/api/sessions/:id/messages", async (request, response) => {
  const id = sessionId(request.params.id);

  //尝试取得当前会话的操作锁。
  const release = acquireSession(id);
  // 没有取得锁，就不执行清空 409：当前请求与会话正在进行的操作发生冲突。
  if (!release) throw new HttpError(409, "正在生成回答，请稍后清空。");
  try {
    //已取得锁，现在执行数据库清空。
    response.json({ code: 0, message: "ok", data: await clearHistory(id) });
  } finally {
    //无论清空成功还是抛出异常，都释放会话锁。
    release();
  }
});
