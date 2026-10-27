import type { ChatStreamEvent, SessionChatRequest } from "@campus-ai/shared-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 沿用第 4 讲的 SSE 协议；网络数据仍须在运行时校验。 */
function parseEventFrame(frame: string): ChatStreamEvent {
  if (!frame.startsWith("data: ")) throw new Error("事件格式错误");
  const event: unknown = JSON.parse(frame.slice(6));
  if (!isRecord(event)) throw new Error("事件数据错误");

  if (event.type === "delta" && typeof event.text === "string") {
    return { type: "delta", text: event.text };
  }
  if (event.type === "done" && typeof event.finishReason === "string") {
    return { type: "done", finishReason: event.finishReason };
  }
  if (event.type === "error" && typeof event.message === "string") {
    return { type: "error", message: event.message };
  }
  throw new Error("收到未知的流式事件");
}

/** 第 5 讲只提交会话 ID、本次请求 ID 和问题，历史由后端读取。 */
export async function requestChatStream(
  request: SessionChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(310_000)]);
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: requestSignal,
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    throw new Error(
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : `请求失败：HTTP ${response.status}`,
    );
  }
  if (!response.body || !response.headers.get("Content-Type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    throw new Error("服务器没有返回有效的事件流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      // 汉字和 SSE 帧都可能跨网络块：解码器与缓冲区必须持续复用。
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n\n");

      while (boundary !== -1) {
        requestSignal.throwIfAborted();
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEventFrame(frame);

        if (event.type === "delta") onDelta(event.text);
        else if (event.type === "done") return event.finishReason;
        else throw new Error(event.message);

        boundary = buffer.indexOf("\n\n");
      }
      if (done) throw new Error("连接已中断，未收到回答结束标志");
    }
  } catch (error: unknown) {
    requestSignal.throwIfAborted();
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
