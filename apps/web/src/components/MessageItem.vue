<script setup lang="ts">
import type { ChatMessage } from "@campus-ai/shared-types";
import { computed } from "vue";

const props = defineProps<{ message: ChatMessage }>();

const roleNames: Record<ChatMessage["role"], string> = {
  system: "系统",
  user: "我",
  assistant: "校园 AI 助手",
};

// 第三讲已经存在的四个下载地址。
const downloadPaths = new Set([
  "/download/anquan-zherenshu.docx",
  "/download/fensanshixi-shenqingbiao.docx",
  "/download/shixi-baogao.docx",
  "/download/xuanti-laiyuanbiao.doc",
]);

// 拆分普通文字和下载链接，不生成 HTML 字符串。
const parts = computed(() =>
  props.message.content.split(/(\[[^\]]+\]\(\/download\/[^)]+\))/g).map((text) => {
    const match = /^\[([^\]]+)\]\((\/download\/[^)]+)\)$/.exec(text);
    const label = match?.[1];
    const href = match?.[2];

    return label && href && downloadPaths.has(href) ? { text: label, href } : { text, href: "" };
  }),
);
</script>

<template>
  <article :class="['message', message.role]">
    <span class="role">{{ roleNames[message.role] }}</span>

    <p v-if="message.content" class="bubble">
      <template v-for="(part, index) in parts" :key="index">
        <a v-if="part.href" :href="part.href" download class="download-card">
          {{ part.text }}
        </a>
        <span v-else>{{ part.text }}</span>
      </template>
    </p>
  </article>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  max-width: 78%;
}

.role {
  margin-bottom: 4px;
  font-size: 12px;
  color: #8aa08f;
}

/* 用户靠右，助手靠左，形成对话气泡。 */
.message.user {
  align-self: flex-end;
  align-items: flex-end;
}

.message.user .bubble {
  color: #ffffff;
  background: linear-gradient(135deg, #7fa98a, #5e8b6d);
  border: none;
  border-bottom-right-radius: 6px;
}

.message.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message.assistant .bubble {
  border-bottom-left-radius: 6px;
}

.message.system {
  align-self: center;
  align-items: center;
}

.message.system .bubble {
  padding: 0;
  color: #8aa08f;
  background: transparent;
  border: none;
  box-shadow: none;
}

.bubble {
  margin: 0;
  padding: 10px 16px;
  border: 1px solid #e3ede0;
  border-radius: 18px;
  color: #3e5148;
  background: #ffffff;
  box-shadow: 0 2px 6px rgb(86 122 96 / 6%);
  line-height: 1.6;
  white-space: pre-wrap;
  color: #1f5c3a;
}
.download-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 2px 0;
  border: 1px solid #e3ede0;
  border-radius: 8px;
  background: #f6faf7;
  text-decoration: none;
  color: #2e7d52;
}
.doc-icon {
  font-size: 18px;
}
@media (max-width: 640px) {
  .message {
    max-width: 88%;
  }
}
.message {
  flex-shrink: 0;
}

.bubble {
  overflow-wrap: anywhere;
}
</style>
