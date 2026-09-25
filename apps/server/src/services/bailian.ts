import type { ChatMessage } from "@campus-ai/shared-types";
import OpenAI from "openai";

/**
 * 方案二：使用在线大模型 API（阿里百炼 / DashScope）。
 *
 * 百炼提供 OpenAI 兼容接口，因此用 OpenAI 客户端读取后端 Key、Base URL 和模型名，
 * 传入完整 messages，再从 choices[0].message.content 取回答。
 *
 * 本文件只负责「怎么调用百炼」；「用哪家模型服务」由 ./llm.ts 的统一入口决定。
 */

/** 百炼兼容接口的默认地址（华北2·北京地域）。 */
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** 调用大模型的超时时间：120 秒。 */
export const REQUEST_TIMEOUT_MS = 120_000;

export interface BailianConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * 从环境变量读取百炼配置。
 *
 * 关键知识点1：真实 Key 只能从后端 .env 读取，不能硬编码或发送到前端。
 * 这里只读取，不打印、不回传。
 */
export function readBailianConfig(): BailianConfig {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const baseURL = process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.DASHSCOPE_MODEL?.trim() || "glm-5.1";

  if (!apiKey) {
    throw new Error("未配置阿里百炼DASHSCOPE_API_KEY");
  }

  return { apiKey, baseURL, model };
}

/**
 * 关键知识点2：messages 只发送 role 和 content，不透传 id 等前端字段；
 * 同时传入全部消息，模型才能理解本轮对话的上下文。
 *
 * 这里把 role 显式声明成 ChatMessage 的 role 类型（而不是 string），
 * 既满足 OpenAI SDK 的字面量联合要求，也保证不会把非法角色传出去。
 */
export function toWireMessages(
  messages: ChatMessage[],
): { role: ChatMessage["role"]; content: string }[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

/** 去掉地址结尾的斜杠，避免拼出 //chat/completions。 */
export function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * 通过 OpenAI 兼容 SDK 调用阿里百炼，并返回模型生成的文本。
 *
 * 百炼兼容 OpenAI 协议，因此只需替换 Key、Base URL 和模型名称，
 * 其余调用方式与 OpenAI 官方 SDK 用法完全一致。
 */
export async function chatWithBailianOpenAI(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseURL, model } = readBailianConfig();

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: toWireMessages(messages),
      // 本实验不使用流式输出，一次性拿到完整回答。
      stream: false,
      temperature: 0.7,
    });

    // 关键知识点4：OpenAI 兼容响应的正文位于 choices[0].message.content。
    const content = completion.choices[0]?.message.content?.trim();

    if (!content) {
      throw new Error("阿里百炼没有返回有效内容");
    }

    return content;
  } catch (error: unknown) {
    // 统一包装成可理解的错误文案；绝不把 API Key 拼进错误信息。
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`阿里百炼调用失败：${message}`, { cause: error });
  }
}
