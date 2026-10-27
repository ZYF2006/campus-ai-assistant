import type { ChatMessage } from "@campus-ai/shared-types";
import { HttpError } from "../lib/http-error.js";

export interface ContextOptions {
  recentTurns: number;
  windowTokens: number;
  outputTokens: number;
  useSummary: boolean;
}

export const SUMMARY_MAX_CHARS = 1200;

function readInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(500, `后端 ${name} 配置不正确`);
  }
  return value;
}

/** 在请求时读取配置，避免模块初始化早于 dotenv 加载。 */
export function getContextOptions(): ContextOptions {
  const windowTokens = readInteger("CONTEXT_WINDOW_TOKENS", 32768, 1024, 131072);
  const outputTokens = readInteger("MODEL_MAX_OUTPUT_TOKENS", 2048, 64, 8192);
  if (outputTokens >= windowTokens) throw new HttpError(500, "上下文窗口必须大于回复预留量");
  const strategy = process.env.CONTEXT_STRATEGY ?? "window";
  if (strategy !== "window" && strategy !== "summary") {
    throw new HttpError(500, "CONTEXT_STRATEGY 只能是 window 或 summary");
  }
  return {
    recentTurns: readInteger("CONTEXT_RECENT_TURNS", 4, 1, 20),
    windowTokens,
    outputTokens,
    useSummary: strategy === "summary",
  };
}

/** 教学用估算：UTF-8 字节数 / 2 + 消息开销。实际 Token 数取决于模型分词器。 */
export function estimateTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + Math.ceil(Buffer.byteLength(message.content, "utf8") / 2) + 8,
    0,
  );
}

/** 按完整问答轮次从后往前选，既限制轮数，又给系统提示词、摘要和回复留出空间。 */
export function selectHistory(
  history: ChatMessage[],
  current: ChatMessage,
  systemMessages: ChatMessage[],
  options: ContextOptions,
): { recent: ChatMessage[]; older: ChatMessage[] } {
  if (history.length % 2 !== 0) throw new Error("数据库中的对话轮次不完整");
  // 最多 1200 个 Unicode 字符的摘要预留 2500 个估算 Token，包含包装提示。
  const summaryReserve = options.useSummary && history.length > 0 ? 2500 : 0;
  let remaining =
    options.windowTokens -
    options.outputTokens -
    summaryReserve -
    estimateTokens([...systemMessages, current]);
  if (remaining < 0) {
    throw new HttpError(400, "系统资料与当前问题超过上下文预算，请缩短问题或调整后端窗口配置");
  }

  let start = history.length;
  for (let turns = 0; start >= 2 && turns < options.recentTurns; turns++) {
    const pair = history.slice(start - 2, start);
    if (pair[0]?.role !== "user" || pair[1]?.role !== "assistant") {
      throw new Error("数据库中的对话轮次不完整");
    }
    const cost = estimateTokens(pair);
    if (cost > remaining) break;
    remaining -= cost;
    start -= 2;
  }
  return { recent: history.slice(start), older: history.slice(0, start) };
}
