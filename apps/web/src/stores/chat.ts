import type { ChatMessage, SessionChatRequest, SessionDetail } from "@campus-ai/shared-types";
import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { requestChatStream } from "../api/chat-stream";
import * as sessionApi from "../api/sessions";

// 临时气泡只用于展示；历史和摘要的唯一来源是服务器数据库。
type ViewMessage = ChatMessage & { notice: string };
const STORAGE_KEY = "lab05.currentSessionId";
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return "请求失败，请重试";
  return error.name === "TimeoutError" ? "等待超时，请重试" : error.message;
}

export const useChatStore = defineStore("chat", () => {
  const session = ref<SessionDetail | null>(null);
  const messages = ref<ViewMessage[]>([]);
  const isSending = ref(false);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);
  const sessionError = ref<string | null>(null);
  const canRetry = ref(false);
  const currentSessionId = computed(() => session.value?.id ?? "");
  const savedTurns = computed(() => (session.value?.messages.length ?? 0) / 2);
  const isBusy = computed(() => isSending.value || isLoading.value);
  let lastRequest: SessionChatRequest | null = null;
  let lastReply: ViewMessage | null = null;
  let controller: AbortController | null = null;

  function clearRetry(): void {
    lastRequest = null;
    lastReply = null;
    canRetry.value = false;
    errorMessage.value = null;
  }

  function selectDetail(detail: SessionDetail): void {
    session.value = detail;
    messages.value = detail.messages.map((message) => ({ ...message, notice: "" }));
    sessionError.value = null;
    clearRetry();
    try {
      localStorage.setItem(STORAGE_KEY, detail.id);
    } catch {
      // 禁用本地存储时仍可聊天，但刷新页面后无法恢复此会话。
    }
  }

  async function loadSession(action: () => Promise<SessionDetail>): Promise<boolean> {
    if (isBusy.value) return false;
    isLoading.value = true;
    sessionError.value = null;
    try {
      selectDetail(await action());
      return true;
    } catch (error: unknown) {
      sessionError.value = errorText(error);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function initialize(): Promise<void> {
    await loadSession(async () => {
      let id = currentSessionId.value;
      try {
        id ||= localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        // 本地存储不可用时，只使用当前页面已加载的会话。
      }
      if (!id) return sessionApi.createSession();
      try {
        return await sessionApi.getSession(id);
      } catch (error: unknown) {
        // 只有会话确实不存在才新建；断网或数据库故障必须明确报错。
        if (error instanceof sessionApi.SessionApiError && error.status === 404) {
          return sessionApi.createSession();
        }
        throw error;
      }
    });
  }

  async function clearConversation(): Promise<void> {
    if (currentSessionId.value) {
      await loadSession(() => sessionApi.clearMessages(currentSessionId.value));
    }
  }

  /** 重试复用 lastRequest，保留第 4 讲的原编号重试。 */
  async function generateReply(): Promise<void> {
    if (isBusy.value || !lastRequest || !lastReply) return;
    const request = lastRequest;
    const reply = lastReply;
    const requestController = new AbortController();
    controller = requestController;
    isSending.value = true;
    canRetry.value = false;
    errorMessage.value = null;
    reply.content = "";
    reply.notice = "";
    try {
      const reason = await requestChatStream(
        request,
        (text) => {
          reply.content += text;
        },
        requestController.signal,
      );
      if (reason !== "stop") {
        reply.notice = `生成已结束（${reason}），本轮未保存，可重试。`;
        canRetry.value = true;
        return;
      }
      if (!reply.content.trim()) throw new Error("模型未返回可显示的正文");

      // done + stop 表示已完整保存。此后刷新失败也不能再次生成。
      clearRetry();
      controller = null;
      isSending.value = false;
      isLoading.value = true;
      try {
        selectDetail(await sessionApi.getSession(request.sessionId));
      } catch (error: unknown) {
        sessionError.value = `回答已保存，但历史刷新失败：${errorText(error)}。请重新加载，无需再次生成。`;
      }
    } catch (error: unknown) {
      if (requestController.signal.aborted) {
        reply.notice = "已停止，当前显示的回答可能不完整。";
      } else {
        errorMessage.value = errorText(error);
        reply.notice = "生成失败，当前显示的回答可能不完整。";
      }
      canRetry.value = true;
    } finally {
      controller = null;
      isSending.value = false;
      isLoading.value = false;
    }
  }

  async function sendMessage(content: string): Promise<boolean> {
    const text = content.trim();
    if (!text || Array.from(text).length > 1000 || isBusy.value || !currentSessionId.value) {
      return false;
    }
    // 每次新提问先读完整历史；失败或停止留下的气泡不能进入下一轮。
    if (!(await loadSession(() => sessionApi.getSession(currentSessionId.value)))) return false;
    lastRequest = {
      sessionId: currentSessionId.value,
      requestId: crypto.randomUUID(),
      content: text,
    };
    messages.value.push({ id: crypto.randomUUID(), role: "user", content: text, notice: "" });
    lastReply = reactive<ViewMessage>({
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      notice: "",
    });
    messages.value.push(lastReply);
    await generateReply();
    return true;
  }

  function stopGenerating(): void {
    // 等旧请求退出后由 finally 解锁，避免取消瞬间发出新请求。
    controller?.abort();
  }

  return {
    session,
    currentSessionId,
    savedTurns,
    messages,
    isSending,
    isLoading,
    isBusy,
    errorMessage,
    sessionError,
    canRetry,
    initialize,
    clearConversation,
    sendMessage,
    stopGenerating,
    retryMessage: generateReply,
  };
});
