<script setup lang="ts">
import type { ChatMessage } from "@campus-ai/shared-types";

defineProps<{
  message: ChatMessage;
}>();

// 角色名称映射：把消息角色（system、user、assistant）翻译成界面上显示的中文。
const roleNames: Record<ChatMessage["role"], string> = {
  system: "系统",
  user: "用户",
  assistant: "助手",
};
</script>

<template>
  <div class="chat-message" :class="message.role">
    <strong>{{ roleNames[message.role] }}</strong>

    <!--
      关键知识点：使用文本插值会自动转义 HTML，
      不使用 v-html，避免不可信内容造成 XSS。
    -->
    <p>{{ message.content }}</p>
  </div>
</template>

<style scoped>
.chat-message {
  max-width: 78%;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.chat-message strong {
  font-size: 12px;
  color: #6b7280;
}

.chat-message p {
  margin: 4px 0 0;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 用户消息靠右，助手消息靠左。 */
.chat-message.user {
  align-self: flex-end;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.chat-message.assistant {
  align-self: flex-start;
}
</style>
