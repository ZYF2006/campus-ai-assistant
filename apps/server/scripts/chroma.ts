import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { RAG } from "../src/rag/config.js";
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("本启动脚本适用于Windows x64");
const require = createRequire(import.meta.url);
const binding = require("chromadb-js-bindings-win32-x64-msvc") as { cli(args: string[]): void };
const directory = fileURLToPath(new URL("../chroma-data", import.meta.url));
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
binding.cli([
  "chroma",
  "run",
  "--path",
  directory,
  "--host",
  "127.0.0.1",
  "--port",
  String(RAG.port),
]);
