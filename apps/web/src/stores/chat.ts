import type { ChatEvent, ChatMessage, NewChatMessage } from "@campus-ai/shared-types";
import { describeChatEvent } from "@campus-ai/shared-types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { requestChat } from "../api/chat";

/** 校园场景的示例问题，用于界面上的快捷提问。 */
export const SUGGESTED_QUESTIONS = [
  "图书馆周末开放时间是几点？",
  "选修课什么时候可以退选？",
  "校园卡丢失了怎么补办？",
] as const;

/**
 * 由「不含 id 的新消息」补齐 id，得到完整 ChatMessage。
 *
 * 使用 NewChatMessage 约束入参：调用者既不会忘记 id，也无法多传一个 id。
 */
function createMessage(message: NewChatMessage): ChatMessage {
  return {
    id: crypto.randomUUID(),
    ...message,
  };
}

export const useChatStore = defineStore("chat", () => {
  // 关键知识点1：Store 中的响应式状态只定义一次，由所有组件共享读取。
  const messages = ref<ChatMessage[]>([]);
  const isSending = ref(false);
  const errorMessage = ref<string | null>(null);

  /** 是否还没有任何聊天记录（用于展示引导态）。 */
  const isEmpty = computed(() => messages.value.length === 0);

  /**
   * 把 Store 状态映射成「判别联合」ChatEvent。
   * 这样界面只需要消费一个联合类型，分支字段由 TypeScript 保证齐全。
   */
  const currentEvent = computed<ChatEvent>(() => {
    if (errorMessage.value !== null) {
      return { status: "failure", reason: errorMessage.value, retryable: true };
    }

    if (isSending.value) {
      return { status: "pending" };
    }

    const latest = messages.value.at(-1);

    return latest ? { status: "success", message: latest } : { status: "pending" };
  });

  /** 当前状态对应的界面文案（由共享函数对判别联合做穷尽 switch）。 */
  const statusText = computed(() => describeChatEvent(currentEvent.value));

  async function sendMessage(content: string): Promise<void> {
    const text = content.trim();

    // 关键知识点2：阻止空消息和重复提交。
    if (!text || isSending.value) {
      return;
    }

    const userMessage = createMessage({
      role: "user",
      content: text,
    });

    messages.value.push(userMessage);
    isSending.value = true;
    errorMessage.value = null;

    try {
      // 关键知识点3：发送聊天记录快照，为以后多轮对话保留结构。
      const result = await requestChat({
        messages: [...messages.value],
      });

      messages.value.push(result.data);
    } catch (error: unknown) {
      // 关键知识点4：unknown 经过类型守卫后才能安全读取 message。
      errorMessage.value = error instanceof Error ? error.message : "发送失败，请稍后重试";
    } finally {
      // 无论成功或失败，都必须恢复发送状态，否则输入框会一直处于禁用状态。
      isSending.value = false;
    }
  }

  /** 清空当前会话，回到最初的引导态。 */
  function clearMessages(): void {
    messages.value = [];
    errorMessage.value = null;
  }

  // 关键知识点5：只有在这里返回的内容，才能被 Vue 组件使用。
  return {
    messages,
    isSending,
    errorMessage,
    isEmpty,
    statusText,
    sendMessage,
    clearMessages,
  };
});
