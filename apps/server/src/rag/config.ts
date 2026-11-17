import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

export const RAG = {
  model: process.env.RAG_EMBEDDING_MODEL || "bge-m3",
  baseUrl: process.env.RAG_EMBEDDING_URL || "http://127.0.0.1:11434",
  port: Number(process.env.RAG_CHROMA_PORT || 8006),
  collection: process.env.RAG_COLLECTION || "campus-assistant",
  chunkSize: 500,
  chunkOverlap: 80,
  topK: 3,
  minScore: 0.35,
};

if (!Number.isInteger(RAG.port) || RAG.port < 1 || RAG.port > 65535) {
  throw new Error("RAG_CHROMA_PORT必须是有效端口");
}
