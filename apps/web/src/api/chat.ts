import type { ChatRequest, ChatResponse } from "@campus-ai/shared-types";

/**
 * 向后端发送聊天请求。
 *
 * 前端所有与后端交互的 HTTP 细节都集中在这个模块里：
 * 组件不直接编写 fetch，只调用这里导出的函数。
 *
 * @param request 聊天请求，包含消息列表。
 * @returns 后端返回的统一聊天响应。
 * @throws HTTP 请求失败或业务状态码不为 0 时抛出异常。
 */
export async function requestChat(request: ChatRequest): Promise<ChatResponse> {
  // 向 Express 后端的聊天接口发送 POST 请求（/api 由 Vite 开发代理转发）。
  const response = await fetch("/api/chat", {
    method: "POST",
    // 将 JavaScript 对象转换成 JSON 字符串。
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
    },
  });

  // 将后端返回的 JSON 转换为 JavaScript 对象。
  // as ChatResponse 只做 TypeScript 类型断言，不会校验运行时数据。
  const result = (await response.json()) as ChatResponse;

  // response.ok 检查 HTTP 状态码是否为 2xx；
  // result.code 检查项目约定的业务状态码是否为 0。
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message);
  }

  return result;
}
