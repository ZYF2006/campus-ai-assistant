/**
 * 模型流式适配模块。
 *
 * 职责：调用不同模型服务，把不同格式的返回数据转换成项目统一的事件。
 *
 * 本项目统一使用两类事件：
 * - delta：新增的一段回答正文，上层将其追加到已有文字后面。
 * - done：模型生成结束，携带结束原因finishReason。
 *
 * 注意：
 * - done表示“生成结束”，不一定表示“回答完整成功”。
 * - stop通常表示正常结束；length通常表示达到输出限制。
 * - 是否接受本轮回答、是否保存，由上层业务代码判断。
 *
 * 数据流：
 * 已组装的消息 → 本模块 → 模型服务
 * 模型返回数据 → 本模块转换 → 上层路由 → SSE → 浏览器
 *
 * 本模块不负责读取历史、生成摘要、保存数据库或操作页面。
 */

// 只导入类型，用于检查消息结构与事件结构；编译后会被移除。
import type { ChatMessage, ModelStreamEvent } from "@campus-ai/shared-types";

import OpenAI from "openai";
import { getContextOptions } from "./context.js";

/**
 * 调用Ollama，并将其NDJSON响应转换成统一事件。
 *
 * NDJSON：每一行都是一个独立的JSON对象，以换行符分隔。
 *
 * async function* 表示“异步生成器”：
 * - await：等待网络数据等异步操作；
 * - yield：向调用方交付一条事件；
 * - return：结束整个生成器。
 *
 * 调用方通过for await...of逐条读取事件。
 * 一段delta不一定对应一个Token，也不一定对应一个完整汉字或句子。
 *
 * @param messages 上层组装好的本轮输入，例如系统提示词、
 *                 可选摘要、选中的近期历史和当前问题。
 *                 不要求传入数据库中的全部历史。
 * @param signal 上层提供的取消信号，用于停止或超时中断。
 */
async function* streamOllama(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
  // 去掉末尾的一个斜杠，避免拼接时出现“//api/chat”。
  const baseURL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");

  // fetch返回Response后，可以继续从response.body逐块读取数据，
  // 不必等待模型把整段回答生成完。
  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // 必须是目标Ollama服务中可用的模型名称。
      model: process.env.OLLAMA_MODEL ?? "qwen3:8b",
      messages: messages.map(({ role, content }) => ({
        role,
        content,
      })),
      stream: true,
      // 请求关闭支持该选项的模型的思考输出。
      // 是否支持及具体行为，取决于Ollama与所选模型。
      think: false,

      options: {
        // 请求使用的上下文窗口配置。
        // 应与模型实际能力匹配，不能仅靠调大数字扩大模型能力。
        num_ctx: getContextOptions().windowTokens,

        // 本次最多生成的Token数。
        // 这是上限，不代表一定会生成这么多。
        num_predict: getContextOptions().outputTokens,
      },
    }),
    // 上层调用controller.abort()后，可中断请求及响应流读取。
    signal,
  });

  // response.ok表示HTTP状态码在200～299之间。
  // body为空时，即使HTTP请求成功，也没有可供读取的响应流。
  if (!response.ok || !response.body) {
    // 如果还有响应体，取消它，停止继续读取无用数据。
    await response.body?.cancel();

    // 这里只返回可理解的提示，不把服务端原始响应直接展示给用户。
    throw new Error(`Ollama 调用失败，请检查服务与模型名称`);
  }

  // getReader取得响应流的读取器，并锁定该流供当前读取器使用。
  const reader = response.body.getReader();

  // 同一个汉字的UTF-8字节可能分散在不同网络块中。
  // 必须复用解码器，才能正确拼接这些字节。
  // fatal:true表示遇到非法UTF-8编码时抛错，避免静默生成乱码。
  const decoder = new TextDecoder("utf-8", { fatal: true });

  // 保存尚未凑成完整JSON行的文本。
  // 解码器处理“字节边界”，buffer处理“JSON行边界”，两者职责不同。
  let buffer = "";

  try {
    while (true) {
      /**
       * value：本次读到的字节块。
       * done：响应字节流是否已经读完。
       *
       * 注意：这里的done是网络流状态，
       * 与后面chunk.done表示的模型生成状态不是一回事。
       */
      const { value, done } = await reader.read();

      // 网络流尚未结束时，保留未凑齐的字符字节，等待下一块。
      // 网络流结束时，以非流式模式完成最后的解码检查。
      buffer += decoder.decode(value, { stream: !done });

      /**
       * 网络块与JSON行并不一一对应：
       * - 一个网络块可能包含多行；
       * - 一行JSON也可能被拆到多个网络块。
       *
       * 因此不能直接对每次read()的结果执行JSON.parse。
       */
      const lines = buffer.split("\n");

      // 最后一段可能是不完整的JSON行，先留到下一次读取。
      // 如果buffer恰好以换行结尾，最后一段就是空字符串。
      buffer = lines.pop() ?? "";

      // 流已经结束时，不会再有下一块数据。
      // 如果最后一行没有换行符，也应尝试解析这段剩余文本。
      if (done && buffer.trim()) {
        lines.push(buffer);
      }

      for (const line of lines) {
        if (!line.trim()) continue;

        /**
         * 解析一行JSON
         * as只告诉TypeScript预期的数据形状
         */
        const chunk = JSON.parse(line) as {
          message?: {
            content?: unknown;
          };
          done?: boolean;
          // 结束原因，例如stop、length。
          done_reason?: unknown;
          // 模型服务可能在流中返回错误。
          error?: unknown;
        } | null;

        // 即使HTTP状态码成功，后续流中仍可能出现业务错误。
        if (chunk?.error) {
          throw new Error("Ollama 在生成过程中返回错误");
        }

        // 可选链避免在chunk或message缺失时直接访问属性。
        const text = chunk?.message?.content;

        // 只接受非空字符串。
        // 不对正文trim，否则可能丢掉单独传来的空格或换行。
        if (typeof text === "string" && text) {
          yield {
            type: "delta",
            text,
          };
        }

        /**
         * 先处理正文，再处理结束标志：
         * 同一个数据块可能同时带有最后一段文字和结束信息。
         *
         * chunk.done为true，只能证明模型报告“生成已结束”。
         * 回答是否完整，还要由上层检查finishReason。
         */
        if (chunk?.done === true) {
          yield {
            type: "done",

            // 没有明确结束原因时使用unknown，
            // 不擅自把未知情况当成正常stop。
            finishReason: typeof chunk.done_reason === "string" ? chunk.done_reason : "unknown",
          };
          // return结束整个生成器，而不是只跳出当前for循环。
          return;
        }
      }

      // 字节流结束，但一直没有收到模型的结束标志：
      // 不能把“连接关闭”误判成“回答成功完成”。
      if (done) {
        throw new Error("Ollama 连接提前结束，回答未完成");
      }
    }
  } finally {
    /**
     * 正常返回、抛出异常或调用方结束迭代时，执行资源清理。
     *
     * cancel：取消尚未消费完的响应流。
     * releaseLock：解除读取器对响应流的锁定。
     */
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * 使用OpenAI兼容接口调用在线模型，并转换成统一事件。
 *
 * 函数名称沿用项目中的“百炼”命名。
 * 实际服务由baseURL指定；使用其他兼容服务时，
 * 模型名称、密钥以及请求参数必须与该服务匹配。
 *
 * 与Ollama分支不同：
 * SDK已经处理了底层流式协议，这里直接读取解析后的数据块，
 * 不需要再次手动拆分NDJSON或SSE。
 */
async function* streamBailian(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
  // 密钥只在后端读取，不应发送给浏览器或写入公开源码。
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("请配置后端 DASHSCOPE_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",

    // SDK请求超时配置，单位为毫秒，300_000即300秒。
    timeout: 300_000,
    // 禁用SDK自动重试，由用户或上层业务明确决定是否重试。
    maxRetries: 0,
  });

  try {
    const stream = await client.chat.completions.create(
      {
        model: process.env.DASHSCOPE_MODEL ?? "glm-5.1",
        messages: messages.map(({ role, content }) => ({
          role,
          content,
        })),
        temperature: 0.7,
        stream: true,

        // 复用应用预留的输出预算。
        // 这个参数限制输出，不会调整在线模型自身的上下文窗口。
        max_tokens: getContextOptions().outputTokens,
      },

      // 将上层取消信号传给SDK请求，才能实际停止模型连接。
      { signal },
    );

    // 等待并逐个读取SDK提供的响应块。
    for await (const chunk of stream) {
      // choices是候选结果数组，本项目只处理第一个候选。
      const choice = chunk.choices[0];
      // delta.content是本块新增正文，不是已经生成的全部回答。
      const text = choice?.delta.content;
      if (text) {
        yield {
          type: "delta",
          text,
        };
      }
      // finish_reason出现时，表示这个候选的生成已经结束。
      // 同样先发正文，再发结束事件，避免遗漏最后一段文字。
      if (choice?.finish_reason) {
        yield {
          type: "done",
          finishReason: choice.finish_reason,
        };
        return;
      }
    }

    // 流迭代结束，却没有拿到明确的结束原因，视为异常。
    throw new Error("在线模型连接提前结束，回答未完成");
  } catch (error: unknown) {
    // unknown要求先判断错误类型，再访问SDK特有字段。
    if (error instanceof OpenAI.APIError) {
      throw new Error(`在线模型调用失败（HTTP ${error.status ?? "未知"}），请检查后端配置`, {
        cause: error,
      });
    }
    // 其他错误继续向上传递，由上层区分取消、超时或业务失败。
    throw error;
  }
}

export { streamBailian, streamOllama };
