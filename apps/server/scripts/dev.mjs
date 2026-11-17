import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");
const output = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const children = [];

const build = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

function start(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (stopping) return;
    stop();
    process.exitCode = code || 1;
  });
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
start([compiler, "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"]);
start(["--watch", output]);
