import type { ChatMessage, ModelStreamEvent } from "@campus-ai/shared-types";
import { streamOllama, streamBailian } from "./llm-stream.js";

/** 复用第4讲模型适配器，对外统一为delta和done事件。 */
export async function* streamConfiguredModel(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
  const provider = process.env.LLM_PROVIDER ?? "ollama";
  if (provider === "ollama") yield* streamOllama(messages, signal);
  else if (provider === "bailian") yield* streamBailian(messages, signal);
  else throw new Error(`不支持的模型提供商：${provider}`);
}
