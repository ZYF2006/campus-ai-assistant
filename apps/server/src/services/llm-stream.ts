// 该模块负责与 LLM 服务提供商交互，并把各家返回的流式数据统一转换为项目自己的事件。
// 项目约定的事件只有两类：delta（一段增量正文）和 done（回答结束及其原因），
// 这样上层路由无需关心底层是 Ollama 还是百炼，只需消费统一的 ModelStreamEvent。
import type { ChatMessage, ModelStreamEvent } from "@campus-ai/shared-types";
import OpenAI from "openai";
import { getContextOptions } from "./context.js";

/** 将 Ollama 的 NDJSON 转为项目统一事件。 */
// async function* 声明一个「异步生成器」：调用它不会一次性拿完结果，
// 而是每 yield 一条事件就暂停，等上层取出后再继续，实现真正的流式输出。
async function* streamOllama(
  // 本轮完整对话历史（含 system / user / assistant），Ollama需要完整上下文来续写。
  messages: ChatMessage[],
  // 浏览器中断生成时用于取消请求的信号，避免已经没人听的连接继续占用资源。
  signal: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
  const baseURL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");

  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "qwen3:8b",
      // 只把 role 与 content 两个字段传给 Ollama，丢弃项目内部多余的元数据。
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: true,
      think: false,
      // 上下文输入之外，还要给本轮回复预留 Token；与第 5 讲预算保持一致。
      options: {
        num_ctx: getContextOptions().windowTokens,
        num_predict: getContextOptions().outputTokens,
      },
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    // 主动取消可能残留的响应体，释放底层连接，避免资源泄漏。
    await response.body?.cancel();
    // 抛出一个带 HTTP 状态码的可读错误，便于前端定位是服务未启动还是模型名写错。
    throw new Error(`Ollama 调用失败，请检查服务与模型名称`);
  }

  // 拿到流式读取器，用于逐块读取原始字节。
  const reader = response.body.getReader();
  // 字节 → 字符串的解码器：fatal=true 让非法 UTF-8 字节直接报错，而不是悄悄替换成乱码。
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // buffer 缓存尚未处理完的文本，跨块拼接使用。
  let buffer = "";

  try {
    // 无限循环读取，直到收到 done 事件或连接关闭。
    while (true) {
      // 读取下一块数据：value 是本块字节，done 表示流是否已经读完。
      const { value, done } = await reader.read();

      // 用同一个解码器连续解码；stream: !done 告知解码器「后面还有数据」，
      // 使跨块的半个汉字先暂存，不会在块边界处被错误拆分。
      buffer += decoder.decode(value, { stream: !done });

      // NDJSON 以换行符分隔，按行切开处理。
      const lines = buffer.split("\n");
      // 最后一段往往是不完整的一行，放回 buffer 等下一个块补全。
      buffer = lines.pop() ?? "";

      // 兼容最后一行没有换行符的情况：流结束时把 buffer 残余内容也当作一行处理。
      if (done && buffer.trim()) {
        lines.push(buffer);
      }

      // 逐行解析 NDJSON。
      for (const line of lines) {
        // 空行直接跳过，不参与解析。
        if (!line.trim()) continue;

        // 每行是一个 JSON 对象，解析并标注其可能的字段结构。
        const chunk = JSON.parse(line) as {
          // message.content：本段增量正文。
          message?: { content?: unknown };
          // done：流是否结束。
          done?: boolean;
          // done_reason：结束原因（如 stop / length）。
          done_reason?: unknown;
          // error：Ollama 在生成过程中报出的错误信息。
          error?: unknown;
        } | null;

        // 若 Ollama 在块里返回了错误，立即中止并把错误抛出给上层。
        if (chunk?.error) {
          throw new Error("Ollama 在生成过程中返回错误");
        }

        // 取出本段增量正文（可能不存在）。
        const text = chunk?.message?.content;

        // 不能 trim 增量文本，否则会丢失空格和换行；确认是字符串且有内容才发出。
        if (typeof text === "string" && text) {
          // 把增量正文包装成 delta 事件交给上层。
          yield { type: "delta", text };
        }

        // 收到结束标志才结束生成；放在正文判断之后，避免遗漏最后一段正文。
        if (chunk?.done === true) {
          // 发出 done 事件，携带结束原因；缺省时用 "unknown" 兜底。
          yield {
            type: "done",
            finishReason: typeof chunk.done_reason === "string" ? chunk.done_reason : "unknown",
          };
          // 生成真正结束，退出整个生成器。
          return;
        }
      }

      // 连接关闭不等于回答完整：若没收到模型的 done 标志就结束，属异常提前断开。
      if (done) {
        throw new Error("Ollama 连接提前结束，回答未完成");
      }
    }
  } finally {
    // 无论正常结束还是异常退出，都取消读取并释放锁，防止连接悬挂。
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** 将百炼 SDK 的流式结果转为项目统一事件。 */
// 同样返回统一事件的异步生成器，底层换成 OpenAI 兼容协议（阿里百炼 / DeepSeek 等复用此分支）。
async function* streamBailian(
  // 本轮完整对话历史。
  messages: ChatMessage[],
  // 取消信号。
  signal: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
  // 读取 API Key；缺失时直接抛出清晰错误，而不是让 SDK 报出晦涩的认证异常。
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("请配置后端 DASHSCOPE_API_KEY");
  }

  // 构造 OpenAI 兼容客户端。
  const client = new OpenAI({
    // 认证密钥。
    apiKey,
    // 服务端点，默认指向百炼兼容模式地址，可被环境变量覆盖。
    baseURL: process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 单次请求最长等待时间；流式场景设大一些，避免长回答中途被 SDK 掐断。
    timeout: 300_000,
    // 本实验由用户主动重试，避免 SDK 隐式自动重复请求打乱逻辑。
    maxRetries: 0,
  });

  try {
    // 发起流式补全请求。
    const stream = await client.chat.completions.create(
      {
        // 模型名，默认 glm-5.1，可被环境变量覆盖。
        model: process.env.DASHSCOPE_MODEL ?? "glm-5.1",
        // 同样只保留 role 与 content，丢弃项目内部字段。
        messages: messages.map(({ role, content }) => ({ role, content })),
        // 采样温度，0.7 在创造性与稳定性之间取得平衡。
        temperature: 0.7,
        // 开启流式返回。
        stream: true,
        max_tokens: getContextOptions().outputTokens,
      },
      // 取消信号必须传给真正的模型请求，否则中断不会生效。
      { signal },
    );

    // 逐块消费 SDK 返回的流。
    for await (const chunk of stream) {
      // 部分数据块可能没有 choices，不能直接连续访问下标。
      const choice = chunk.choices[0];
      // 取出本块的增量正文。
      const text = choice?.delta.content;

      // 有正文就发 delta 事件。
      if (text) {
        yield { type: "delta", text };
      }

      // 出现结束原因即视为本次回答结束。
      if (choice?.finish_reason) {
        // 发出 done 事件，携带结束原因。
        yield {
          type: "done",
          finishReason: choice.finish_reason,
        };
        // 结束生成器。
        return;
      }
    }

    // 流自然结束却没收到结束原因，说明连接被提前关闭，回答不完整。
    throw new Error("在线模型连接提前结束，回答未完成");
  } catch (error: unknown) {
    // 若是 SDK 抛出的 API 错误，转换成不含敏感信息的可读消息。
    if (error instanceof OpenAI.APIError) {
      // 不把完整 SDK 错误对象、请求头或密钥返回给浏览器。
      throw new Error(`在线模型调用失败（HTTP ${error.status ?? "未知"}），请检查后端配置`, {
        cause: error,
      });
    }

    // 其他错误原样抛出，交给上层统一处理。
    throw error;
  }
}

// 导出两个流式生成器，供路由层的 streamConfiguredModel 按 provider 分派调用。
export { streamBailian, streamOllama };
