import { randomUUID } from "node:crypto";
import type { ChatMessage, SessionDetail } from "@campus-ai/shared-types";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/pool.js";
import { HttpError } from "../lib/http-error.js";

interface SessionRow extends RowDataPacket {
  id: string;
  summary: string;
  summary_through: number;
}
interface MessageRow extends RowDataPacket, ChatMessage {}

export async function createSession(): Promise<SessionDetail> {
  const id = randomUUID();
  await getPool().execute(
    "INSERT INTO sessions (id, title, summary, created_at, updated_at) VALUES (?, '学习会话', '', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
    [id],
  );
  return { id, messages: [], summary: "", summaryThrough: 0 };
}

/** 页面读全部历史；模型输入的选择由服务层完成。 */
export async function getSession(id: string): Promise<SessionDetail | null> {
  const [rows] = await getPool().execute<SessionRow[]>(
    "SELECT id, summary, summary_through FROM sessions WHERE id = ?",
    [id],
  );
  if (!rows[0]) return null;
  const [messages] = await getPool().execute<MessageRow[]>(
    "SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY turn_index, FIELD(role, 'user', 'assistant')",
    [id],
  );
  return { id, messages, summary: rows[0].summary, summaryThrough: rows[0].summary_through };
}

/** 完整回答才进入短事务；模型生成过程不占用数据库行锁。 */
export async function saveTurn(
  sessionId: string,
  requestId: string,
  question: string,
  answer: string,
): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [sessions] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM sessions WHERE id = ? FOR UPDATE",
      [sessionId],
    );
    if (!sessions[0]) throw new HttpError(404, "会话不存在，请刷新页面。");
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT session_id, role, content FROM messages WHERE id = ?",
      [requestId],
    );
    if (existing[0]) {
      const old = existing[0];
      if (old.session_id !== sessionId || old.role !== "user" || old.content !== question)
        throw new HttpError(409, "请求编号已经使用，请重新提问。");
    } else {
      const [turns] = await connection.execute<RowDataPacket[]>(
        "SELECT COALESCE(MAX(turn_index), 0) + 1 AS next_turn FROM messages WHERE session_id = ?",
        [sessionId],
      );
      await connection.execute(
        `INSERT INTO messages (id, session_id, turn_index, role, content, created_at)
         VALUES (?, ?, ?, 'user', ?, UTC_TIMESTAMP(3)), (?, ?, ?, 'assistant', ?, UTC_TIMESTAMP(3))`,
        [
          requestId,
          sessionId,
          turns[0]!.next_turn,
          question,
          randomUUID(),
          sessionId,
          turns[0]!.next_turn,
          answer,
        ],
      );
      await connection.execute("UPDATE sessions SET updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [
        sessionId,
      ]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateSummary(id: string, summary: string, through: number): Promise<void> {
  await getPool().execute("UPDATE sessions SET summary = ?, summary_through = ? WHERE id = ?", [
    summary,
    through,
    id,
  ]);
}

/** 清空原文时也清空派生摘要；会话编号不变。 */
export async function clearHistory(id: string): Promise<SessionDetail> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM sessions WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "会话不存在，请刷新页面。");
    await connection.execute("DELETE FROM messages WHERE session_id = ?", [id]);
    await connection.execute(
      "UPDATE sessions SET summary = '', summary_through = 0, updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [id],
    );
    await connection.commit();
    return { id, messages: [], summary: "", summaryThrough: 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
