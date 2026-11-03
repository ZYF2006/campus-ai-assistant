import type { ApiResponse, SessionDetail } from "@campus-ai/shared-types";

export class SessionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 普通 JSON 接口负责创建、读取和清空；流式接口沿用第 4 讲。 */
async function request(path = "", method = "GET", body?: object): Promise<SessionDetail> {
  const response = await fetch(`/api/sessions${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json().catch(() => null)) as ApiResponse<SessionDetail> | null;
  if (!response.ok || !result || result.code !== 0) {
    throw new SessionApiError(
      response.status,
      result?.message || `请求失败：HTTP ${response.status}`,
    );
  }
  return result.data;
}

export const createSession = () => request("", "POST", {});
export const getSession = (id: string) => request(`/${encodeURIComponent(id)}`);
export const clearMessages = (id: string) =>
  request(`/${encodeURIComponent(id)}/messages`, "DELETE");
