<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import MessageItem from "./components/MessageItem.vue";
import { SUGGESTED_QUESTIONS, useChatStore } from "./stores/chat";

const chatStore = useChatStore();

/** 输入框内容。 */
const inputText = ref("");
/** 消息区域 DOM 元素，用于新消息到达后滚动到底部。 */
const messageArea = ref<HTMLElement | null>(null);

/** 发送消息：为空或正在发送时直接返回，避免重复提交。 */
async function submitMessage(): Promise<void> {
  const content = inputText.value.trim();

  if (!content || chatStore.isSending) {
    return;
  }

  inputText.value = "";
  await chatStore.sendMessage(content);
}

/** 点击示例问题时，直接发送该问题。 */
async function askSuggestion(question: string): Promise<void> {
  if (chatStore.isSending) {
    return;
  }

  await chatStore.sendMessage(question);
}

// 消息数量变化后，自动把消息区滚动到最新一条。
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick();

    const element = messageArea.value;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  },
);
</script>

<template>
  <div class="chat">
    <header>
      <h1>校园 AI 助手</h1>
      <button
        v-if="chatStore.messages.length > 0"
        type="button"
        :disabled="chatStore.isSending"
        @click="chatStore.clearMessages()"
      >
        清空会话
      </button>
    </header>

    <!-- 只有消息区域滚动，输入框始终固定在底部。 -->
    <section ref="messageArea" class="message">
      <p v-if="chatStore.isEmpty">请输入问题，开始与校园 AI 助手对话。</p>

      <button
        v-for="question in chatStore.isEmpty ? SUGGESTED_QUESTIONS : []"
        :key="question"
        type="button"
        class="suggestion"
        :disabled="chatStore.isSending"
        @click="askSuggestion(question)"
      >
        {{ question }}
      </button>

      <MessageItem v-for="message in chatStore.messages" :key="message.id" :message="message" />

      <p v-if="chatStore.isSending">正在回复…</p>
    </section>

    <p v-if="chatStore.errorMessage" class="error">{{ chatStore.errorMessage }}</p>

    <form @submit.prevent="submitMessage">
      <input
        v-model="inputText"
        type="text"
        maxlength="1000"
        autocomplete="off"
        placeholder="请输入问题"
        aria-label="聊天内容"
      />
      <button type="submit" :disabled="chatStore.isSending || !inputText.trim()">发送</button>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  height: min(680px, calc(100vh - 48px));
  margin: 24px auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
}

header h1 {
  margin: 0;
  font-size: 18px;
}

header button {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
}

.message {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px;
}

.suggestion {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  cursor: pointer;
  text-align: left;
}

.error {
  margin: 0;
  padding: 8px 18px;
  color: #b91c1c;
  background: #fef2f2;
}

form {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid #e5e7eb;
}

form input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

form button {
  padding: 0 18px;
  border: 0;
  border-radius: 6px;
  color: #ffffff;
  background: #2563eb;
  cursor: pointer;
}

form button:disabled,
header button:disabled,
.suggestion:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
