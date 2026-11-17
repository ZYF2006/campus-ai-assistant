import { createChunks } from "../src/rag/chunk.js";
import { embedTexts } from "../src/rag/embedding.js";
import { saveKnowledge } from "../src/rag/vector-store.js";
try {
  const chunks = await createChunks();
  const vectors: number[][] = [];
  for (let offset = 0; offset < chunks.length; offset += 10) {
    vectors.push(
      ...(await embedTexts(
        chunks.slice(offset, offset + 10).map((c) => `${c.section}\n${c.content}`),
      )),
    );
    console.log(`已向量化 ${vectors.length}/${chunks.length} 块`);
  }
  const count = await saveKnowledge(chunks, vectors);
  console.log(`导入完成：${count}块，${vectors[0]!.length}维`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
