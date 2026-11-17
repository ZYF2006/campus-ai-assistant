import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { loadNotices } from "../knowledge/loader.js";
import { RAG } from "./config.js";

export interface KnowledgeChunk {
  id: string;
  source: string;
  section: string;
  content: string;
}
export interface RagSource extends KnowledgeChunk {
  score: number;
}

export async function createChunks(): Promise<KnowledgeChunk[]> {
  const text = loadNotices()
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
    .map((line) => (line.trimStart().startsWith("|") ? line.replace(/[ \t]{2,}/g, " ") : line))
    .join("\n")
    .trim();
  if (!text) throw new Error("knowledge.md内容为空");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: RAG.chunkSize,
    chunkOverlap: RAG.chunkOverlap,
    separators: ["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
  });
  const chunks: KnowledgeChunk[] = [];
  for (const sectionText of text.split(/(?=^#{1,6}\s)/m)) {
    if (!sectionText.trim()) continue;
    const section = sectionText.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || "正文";
    for (const content of await splitter.splitText(sectionText)) {
      if (content.trim())
        chunks.push({
          id: `knowledge-${chunks.length + 1}`,
          source: "knowledge.md",
          section,
          content,
        });
    }
  }
  if (!chunks.length || chunks.length > 500) throw new Error("课堂知识库应产生1～500个知识块");
  return chunks;
}
