import type { ChatMessage } from "@campus-ai/shared-types";

import {
  chatWithBailianOpenAI,
  readBailianConfig,
  REQUEST_TIMEOUT_MS,
  toWireMessages,
  trimTrailingSlash,
} from "./bailian.js";

/**
 * 大模型统一入口。
 *
 * 目的：给上层路由一个「稳定的接缝」。路由只负责
 *   - 传入 messages: ChatMessage[]
 *   - 接收一个 string
 * 不关心底层用的是哪家模型服务，也不判断厂商。
 * 供应商差异（请求地址、鉴权方式、响应结构、错误文案）全部隔离在 services 层。
 */

/* ------------------------------------------------------------------ *
 * 1. 统一入口
 * ------------------------------------------------------------------ */

/**
 * 上层只调用这个函数。
 *
 * 切换模型服务只需要改后端 .env 中的 LLM_PROVIDER 并重启服务：
 * 前端使用的 ChatRequest、ChatResponse 和 /api/chat 都没有变化，
 * 因此前端代码一行都不用改。
 */
export async function chatWithConfiguredModel(messages: ChatMessage[]): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? "bailian").trim().toLowerCase();

  if (provider === "bailian") {
    // 方案二：在线大模型（阿里百炼），实现见 ./bailian.ts。
    return chatWithBailianOpenAI(messages);
  }

  // 本实验不接入本地 Ollama；如需本地模型，在这个分支里补一个
  // chatWithOllama(messages) 实现即可，上层路由无需改动。
  throw new Error("LLM_PROVIDER只能填写bailian");
}

/* ------------------------------------------------------------------ *
 * 2. 对照实现：原生 fetch 版本
 * ------------------------------------------------------------------ */

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
}

/**
 * 与 ./bailian.ts 的 SDK 实现完全等价的「原生 fetch」写法，
 * 保留用于对照 HTTP 与 SDK 两种实现。
 *
 * 它把 SDK 隐藏的细节摊开：POST <baseURL>/chat/completions、
 * Authorization: Bearer <Key>、JSON 报文、choices[0].message.content。
 * 业务代码不调用本函数，仅作为学习对照与排错参考。
 */
export async function chatWithBailian(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseURL, model } = readBailianConfig();

  const requestBody = {
    model,
    messages: toWireMessages(messages),
    stream: false,
    temperature: 0.7,
  };

  let response: Response;

  try {
    response = await fetch(`${trimTrailingSlash(baseURL)}/chat/completions`, {
      method: "POST",
      headers: {
        // Key 只在「后端 → 百炼」这一段出现，浏览器永远看不到它。
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("阿里百炼调用超时，请稍后重试", { cause: error });
    }

    const reason = error instanceof Error ? error.message : "未知错误";
    throw new Error(`阿里百炼调用失败：${reason}`, { cause: error });
  }

  // 先取文本再解析：出错时上游可能返回纯文本，而不是 JSON。
  const rawText = await response.text();
  let payload: ChatCompletionResponse | undefined;

  try {
    payload = JSON.parse(rawText) as ChatCompletionResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw new Error(`阿里百炼调用失败：HTTP ${response.status} ${response.statusText}`.trim());
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("阿里百炼没有返回有效内容");
  }

  return content;
}
