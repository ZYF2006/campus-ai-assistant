import { retrieve } from "../src/rag/retrieve.js";
try {
  const question = process.argv
    .slice(2)
    .filter((v) => v !== "--")
    .join(" ")
    .trim();
  if (!question || Array.from(question).length > 1000) throw new Error("请提供1～1000字的完整问题");
  const sources = await retrieve(question);
  for (const item of sources)
    console.log(
      `\n${item.id} | ${item.score.toFixed(3)}\n${item.source} / ${item.section}\n${item.content}`,
    );
  console.log(`\n返回${sources.length}块，未调用回答模型。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
