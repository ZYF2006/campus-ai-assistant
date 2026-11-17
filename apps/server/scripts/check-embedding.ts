import { embedTexts } from "../src/rag/embedding.js";
try {
  const vectors = await embedTexts(["毕业设计选题来源表需要盖章吗？"]);
  console.log(`向量数量：${vectors.length}`);
  console.log(`向量维度：${vectors[0]!.length}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
