import { randomUUID } from "node:crypto";
import type { ChatMessage, SessionDetail } from "@campus-ai/shared-types";
//mysql2查询结果行的基础类型，仅用于TypeScript类型检查。
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/pool.js";
import { HttpError } from "../lib/http-error.js";

/**
 * sessions表中本模块需要读取的字段。
 *
 * 数据库使用下划线命名summary_through；
 * 返回给前端时转换为驼峰命名summaryThrough。
 */
interface SessionRow extends RowDataPacket {
  id: string;
  summary: string;
  summary_through: number; // 3表示覆盖第1～3轮，不是3条消息，也不是消息ID。
}

/**
 * messages表的查询结果类型。
 * 同时满足：
 * - mysql2对结果行类型的要求；
 * - 项目ChatMessage的字段约定。
 * 类型声明不会自动检查数据库实际内容，
 * 正确的数据仍需要输入校验、写入逻辑和数据库约束共同保证。
 */
interface MessageRow extends RowDataPacket, ChatMessage {}

//创建一个新的空会话，并返回给调用方。
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

/**
 * 保存一轮完整问答。
 *
 * @param sessionId 问答所属的会话编号
 * @param requestId 本次逻辑提问的编号；重试同一提问时应保持不变
 * @param question 用户问题正文
 * @param answer 模型最终回答正文
 *
 * 调用前提：
 * 上层已经确认回答正常结束、正文有效，才调用此函数。
 * 本函数没有finishReason参数，不能自行判断模型是否完整回答。
 *
 * 保存原则：
 * - 问题与回答成对写入；
 * - 整轮成功才提交，失败则回滚；
 * - 同一个请求编号不重复插入；
 * - 模型生成在调用本函数之前完成，避免长时间占用数据库锁。
 */
export async function saveTurn(
  sessionId: string,
  requestId: string,
  question: string,
  answer: string,
): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    /**
     * 查询并锁定当前会话行。
     * FOR UPDATE的作用：
     * 当另一个事务也尝试锁定同一会话行时，需要等待当前事务结束
     */
    const [sessions] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM sessions WHERE id = ? FOR UPDATE",
      [sessionId],
    );
    if (!sessions[0]) throw new HttpError(404, "会话不存在，请刷新页面。");
    /**
     * requestId同时作为本轮user消息的id。
     *
     * 通过它判断本次提问是否已经保存。
     * 例如：数据库已提交，但浏览器没收到完成通知，随后发起重试。
     */
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
/**
 * 保存摘要正文及其覆盖进度。
 *
 * @param id 会话编号
 * @param summary 新的摘要正文
 * @param through 摘要已覆盖到第几轮完整问答
 *
 * 例如through=3：
 * 表示summary概括了第1～3轮，而不是概括了3条消息。
 *
 * 正文与覆盖进度在同一条UPDATE中修改，避免分成两条SQL后只成功一条。
 * 这里只更新摘要，不删除原始历史，也不调用模型。
 */
export async function updateSummary(id: string, summary: string, through: number): Promise<void> {
  await getPool().execute("UPDATE sessions SET summary = ?, summary_through = ? WHERE id = ?", [
    summary,
    through,
    id,
  ]);
}

/**
 * 清空指定会话的历史与摘要，保留会话本身。
 *
 * 为什么同时清空摘要？
 * 摘要来源于历史问答。如果只删原文，旧摘要仍可能在后续回答中
 * 携带已经清空的信息，导致用户感觉“历史并没有真正清空”。
 *
 * 此操作完成后：
 * - 会话id不变；
 * - 消息列表为空；
 * - 摘要为空；
 * - 摘要覆盖轮次归零。
 */
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
