import { readFileSync } from "node:fs";

const noticeFile = new URL("../../knowledge/knowledge.md", import.meta.url);

export function loadNotices(): string {
  return readFileSync(noticeFile, "utf-8").trim();
}