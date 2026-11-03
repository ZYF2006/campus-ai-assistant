import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler } from "express";
import { initializeDatabase, getPool } from "./db/pool.js";
import { toHttpError } from "./lib/http-error.js";
import { chatStreamRouter } from "./routes/chat-stream.js";
import { sessionsRouter } from "./routes/sessions.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/download", express.static(fileURLToPath(new URL("../download", import.meta.url))));
app.use(sessionsRouter, chatStreamRouter);

app.get("/api/health", async (_request, response) => {
  await getPool().query("SELECT 1");
  response.json({ message: "server and database are ready" });
});

//在所有 /api 路由之后、错误处理中间件之前
app.use("/api", (_request, response) => {
  response.status(404).json({ code: 1, message: "接口不存在", data: null });
});

const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) return;
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ code: 1, message: "请求JSON格式错误", data: null });
    return;
  }
  if (error instanceof Error && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ code: 1, message: "请求内容过长", data: null });
    return;
  }
  const problem = toHttpError(error);
  response.status(problem.status).json({ code: 1, message: problem.message, data: null });
};
app.use(handleError);

// 先确认数据库可用，再启动HTTP服务，避免页面打开后才发现配置错误。
initializeDatabase()
  .then(() => {
    const port = Number(process.env.PORT ?? 3000);
    app.listen(port, () =>
      console.log(`Server running at http://localhost:${port}（数据库已就绪）`),
    );
  })
  .catch((error: unknown) => {
    console.error(toHttpError(error).message);
    process.exitCode = 1;
  });
