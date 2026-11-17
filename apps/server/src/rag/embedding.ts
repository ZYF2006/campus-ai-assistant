import { OllamaEmbeddings } from "@langchain/ollama";
import { RAG } from "./config.js";

export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (!texts.length || texts.some((text) => !text.trim())) throw new Error("嵌入输入不能为空");
  const requestSignal = AbortSignal.any([
    AbortSignal.timeout(120_000),
    ...(signal ? [signal] : []),
  ]);
  const embeddings = new OllamaEmbeddings({
    model: RAG.model,
    baseUrl: RAG.baseUrl,
    truncate: false,
    keepAlive: 0,
    maxRetries: 0,
    fetch: (input, init) => fetch(input, { ...init, signal: requestSignal }),
  });
  let vectors: number[][];
  try {
    vectors = await embeddings.embedDocuments(texts);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("嵌入失败，请检查Ollama、嵌入模型、输入长度和设备资源", { cause: error });
  }
  const dimension = vectors[0]?.length;
  if (
    !dimension ||
    vectors.length !== texts.length ||
    vectors.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== dimension ||
        v.some((n) => !Number.isFinite(n)) ||
        !v.some((n) => n !== 0),
    )
  )
    throw new Error("向量数量、维度或数值异常");
  return vectors;
}
