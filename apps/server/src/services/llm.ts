import type { ChatMessage } from "@campus-ai/shared-types";

/**
 * 大模型统一入口。
 *
 * 目的：给上层路由一个「稳定的接缝」。路由只负责
 *   - 传入 messages: ChatMessage[]
 *   - 接收一个 string
 * 不关心底层用的是哪家模型服务，也不判断厂商。
 * 供应商差异（请求地址、鉴权方式、响应结构、错误文案）全部隔离在本文件里。
 *
 * 本实验的在线方案使用「阿里百炼（DashScope）」的 OpenAI 兼容接口。
 */

/* ------------------------------------------------------------------ *
 * 1. 兼容接口的报文类型
 * ------------------------------------------------------------------ */

/** OpenAI 兼容接口只接受这三种 role。 */
type WireRole = "system" | "user" | "assistant";

interface WireMessage {
  role: WireRole;
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: WireMessage[];
  /** 本实验不使用流式输出，一次性拿到完整回答。 */
  stream: false;
  temperature: number;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
}

/* ------------------------------------------------------------------ *
 * 2. 配置读取
 * ------------------------------------------------------------------ */

/** 百炼兼容接口的默认地址（华北2·北京地域）。 */
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** 调用大模型的超时时间：120 秒。 */
const REQUEST_TIMEOUT_MS = 120_000;

interface BailianConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * 从环境变量读取百炼配置。
 *
 * 关键知识点1：真实 Key 只能从后端 .env 读取，不能硬编码，
 * 更不能通过任何接口发送给前端。这里只读取，不打印、不回传。
 */
function readBailianConfig(): BailianConfig {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const baseURL = process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.DASHSCOPE_MODEL?.trim() || "glm-5.1";

  if (!apiKey) {
    throw new Error("未配置阿里百炼DASHSCOPE_API_KEY");
  }

  return { apiKey, baseURL, model };
}

/** 去掉地址结尾的斜杠，避免拼出 //chat/completions。 */
function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/* ------------------------------------------------------------------ *
 * 3. 在线方案：调用阿里百炼
 * ------------------------------------------------------------------ */

/**
 * 通过 OpenAI 兼容的 /chat/completions 接口调用百炼，返回模型生成的纯文本。
 *
 * 本工程刻意不安装 openai 依赖，用原生 fetch 发送完全相同的报文，
 * 因此代码里能看到「协议本身」长什么样；换成 SDK 只是把这段报文
 * 交给 client.chat.completions.create({ model, messages, stream, temperature })。
 */
export async function chatWithBailian(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseURL, model } = readBailianConfig();

  const requestBody: ChatCompletionRequest = {
    model,
    // 关键知识点2：只发送 role 和 content，不透传 id 等前端字段。
    // 传入全部 messages，模型才能理解本轮对话的上下文。
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream: false,
    temperature: 0.7,
  };

  let response: Response;

  try {
    response = await fetch(`${trimTrailingSlash(baseURL)}/chat/completions`, {
      method: "POST",
      headers: {
        // 关键知识点3：Key 只在后端向百炼发出的这个请求头里出现，
        // 浏览器永远看不到它。
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
    // 只回传业务化文案与状态码，不透传可能含内部信息的完整报文。
    throw new Error(`阿里百炼调用失败：HTTP ${response.status} ${response.statusText}`.trim());
  }

  // 关键知识点4：OpenAI 兼容响应的正文位于 choices[0].message.content。
  const content = payload?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("阿里百炼没有返回有效内容");
  }

  return content;
}

/* ------------------------------------------------------------------ *
 * 4. 统一入口
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
    return chatWithBailian(messages);
  }

  // 本实验不接入本地 Ollama；如需本地模型，在这个分支里补一个
  // chatWithOllama(messages) 实现即可，上层路由无需改动。
  throw new Error("LLM_PROVIDER只能填写bailian");
}
