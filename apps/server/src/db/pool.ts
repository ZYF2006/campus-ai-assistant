import { readFile } from "node:fs/promises";
import { createConnection, createPool, type ConnectionOptions, type Pool } from "mysql2/promise";

/** 运行时再读配置，确保 .env 已经加载。 */
export function getDatabaseConfig(): ConnectionOptions & { database: string } {
  const database = process.env.MYSQL_DATABASE ?? "campus_assistant";
  const port = Number(process.env.MYSQL_PORT ?? 3306);
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(database))
    throw new Error("MYSQL_DATABASE 只能包含字母、数字、下划线。");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("MYSQL_PORT 不是有效端口。");
  return {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port,
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database,
    charset: "utf8mb4",
    timezone: "Z",
    connectTimeout: 5000,
  };
}

let pool: Pool | undefined;
export function getPool(): Pool {
  pool ??= createPool({ ...getDatabaseConfig(), connectionLimit: 5 });
  return pool;
}

/** 启动时补建库表；不删除数据，也不修改已有表的结构。 */
export async function initializeDatabase(): Promise<void> {
  const { database, ...config } = getDatabaseConfig();
  const connection = await createConnection(config);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    await connection.changeUser({ database });
    const schema = await readFile(new URL("../../sql/schema.sql", import.meta.url), "utf8");
    for (const statement of schema.split(";")) {
      if (statement.trim()) await connection.query(statement);
    }
  } finally {
    await connection.end();
  }
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}
