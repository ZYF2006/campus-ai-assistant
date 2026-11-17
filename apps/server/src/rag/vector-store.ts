import { createHash } from "node:crypto";
import {
  ChromaClient,
  ChromaNotFoundError,
  registerEmbeddingFunction,
  type EmbeddingFunction,
} from "chromadb";
import type { KnowledgeChunk } from "./chunk.js";
import { RAG } from "./config.js";

class ExternalEmbedding implements EmbeddingFunction {
  name = "graduation-external";
  async generate(): Promise<number[][]> {
    throw new Error("请在应用中生成向量后传入");
  }
  getConfig(): Record<string, unknown> {
    return {};
  }
  static buildFromConfig(): ExternalEmbedding {
    return new ExternalEmbedding();
  }
}
registerEmbeddingFunction("graduation-external", ExternalEmbedding);
const externalEmbedding = new ExternalEmbedding();
function client(): ChromaClient {
  return new ChromaClient({
    host: "127.0.0.1",
    port: RAG.port,
    ssl: false,
    fetchOptions: { signal: AbortSignal.timeout(30_000) },
  });
}
function signature(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: RAG.model,
        baseUrl: RAG.baseUrl,
        chunkSize: RAG.chunkSize,
        overlap: RAG.chunkOverlap,
        version: 1,
      }),
    )
    .digest("hex");
}

export async function saveKnowledge(
  chunks: KnowledgeChunk[],
  vectors: number[][],
): Promise<number> {
  if (!chunks.length || chunks.length !== vectors.length) throw new Error("知识块与向量数量不一致");
  try {
    await client().deleteCollection({ name: RAG.collection });
  } catch (error) {
    if (!(error instanceof ChromaNotFoundError)) throw error;
  }
  const collection = await client().createCollection({
    name: RAG.collection,
    embeddingFunction: externalEmbedding,
    configuration: { hnsw: { space: "cosine" } },
    metadata: { signature: signature(), state: "loading" },
  });
  await collection.add({
    ids: chunks.map((c) => c.id),
    documents: chunks.map((c) => c.content),
    embeddings: vectors,
    metadatas: chunks.map((c) => ({ source: c.source, section: c.section })),
  });
  await collection.modify({ metadata: { signature: signature(), state: "ready" } });
  return collection.count();
}
export async function openKnowledge() {
  const collection = await client()
    .getCollection({ name: RAG.collection, embeddingFunction: externalEmbedding })
    .catch(() => {
      throw new Error("请确认Chroma已启动，并先完成知识导入");
    });
  if (collection.metadata?.state !== "ready" || collection.metadata?.signature !== signature())
    throw new Error("资料未就绪或嵌入配置变化，请重新导入");
  if (!(await collection.count())) throw new Error("知识库为空，请重新导入");
  return collection;
}
