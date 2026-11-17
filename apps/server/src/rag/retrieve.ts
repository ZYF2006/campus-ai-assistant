import type { RagSource } from "./chunk.js";
import { RAG } from "./config.js";
import { embedTexts } from "./embedding.js";
import { openKnowledge } from "./vector-store.js";

/** 用问题中的实词补充向量排序，避免精确材料名称被泛泛相似的段落挤掉。 */
function questionTerms(question: string): string[] {
  const stopWords = new Set([
    "需要",
    "什么",
    "这个",
    "那个",
    "是否",
    "请问",
    "具体",
    "怎么",
    "如何",
  ]);
  return [
    ...new Set(
      [...new Intl.Segmenter("zh", { granularity: "word" }).segment(question.toLowerCase())]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment)
        .filter((term) => term.length >= 2 && !stopWords.has(term)),
    ),
  ];
}

export async function retrieve(question: string, signal?: AbortSignal): Promise<RagSource[]> {
  const collection = await openKnowledge();
  signal?.throwIfAborted();
  const [vector] = await embedTexts([question], signal);
  const result = await collection.query({
    queryEmbeddings: [vector!],
    nResults: Math.min(RAG.topK * 5, await collection.count()),
    include: ["documents", "metadatas", "distances"],
  });
  signal?.throwIfAborted();
  const terms = questionTerms(question);
  return (result.ids[0] ?? [])
    .map((id, index): RagSource => {
      const content = result.documents?.[0]?.[index],
        metadata = result.metadatas?.[0]?.[index],
        distance = result.distances?.[0]?.[index];
      if (
        !content ||
        typeof metadata?.source !== "string" ||
        typeof metadata.section !== "string" ||
        typeof distance !== "number" ||
        !Number.isFinite(distance)
      )
        throw new Error("检索记录不完整，请重新导入");
      return {
        id,
        source: metadata.source,
        section: metadata.section,
        content,
        score: Math.max(-1, Math.min(1, 1 - distance)),
      };
    })
    .filter((item) => item.score >= RAG.minScore)
    .sort((a, b) => {
      const rank = (item: RagSource) =>
        item.score +
        Math.min(
          0.4,
          terms.filter((term) => item.content.toLowerCase().includes(term)).length * 0.08,
        );
      return rank(b) - rank(a);
    })
    .slice(0, RAG.topK);
}
