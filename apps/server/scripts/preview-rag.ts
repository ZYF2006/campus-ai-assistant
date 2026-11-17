import { createChunks } from "../src/rag/chunk.js";
try {
  const chunks = await createChunks();
  for (const chunk of chunks)
    console.log(`\n${chunk.id} | ${chunk.section} | 长度${chunk.content.length}\n${chunk.content}`);
  console.log(`\n共${chunks.length}块，未调用模型或写库。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
