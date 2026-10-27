import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { initializeDatabase } from "../src/db/pool.js";
import { toHttpError } from "../src/lib/http-error.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
initializeDatabase()
  .then(() => console.log("实验数据库就绪，已有数据保留。"))
  .catch((error: unknown) => {
    console.error(toHttpError(error).message);
    process.exitCode = 1;
  });
