export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 只返回可操作的提示，不向页面泄露SQL、密码或原始数据库错误。 */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    ER_ACCESS_DENIED_ERROR:
      "MySQL认证失败（1045）：请在 apps/server/.env 填写正确的 MYSQL_USER 和 MYSQL_PASSWORD，保存后重启后端。",
    ECONNREFUSED: "服务拒绝连接：请检查MySQL与模型服务是否启动，并核对地址与端口。",
    ETIMEDOUT: "服务连接超时：请核对数据库或模型服务的地址、端口和网络。",
    ER_BAD_DB_ERROR: "数据库不存在：请在项目根目录运行 pnpm db:init。",
    ER_NO_SUCH_TABLE: "实验表不存在：请在项目根目录运行 pnpm db:init。",
    ER_DBACCESS_DENIED_ERROR: "MySQL账号没有访问或创建实验数据库的权限，请检查账号授权。",
    ER_TABLEACCESS_DENIED_ERROR: "MySQL账号没有操作实验表的权限，请检查账号授权。",
    ER_BAD_FIELD_ERROR: "实验表结构与源码不一致，请使用新的实验库名重新初始化，保留旧库供核对。",
  };
  if (code) return new HttpError(503, messages[code] ?? "服务请求失败，请检查后端终端与服务配置。");
  return new HttpError(500, error instanceof Error ? error.message : "服务器处理失败，请重试。");
}
