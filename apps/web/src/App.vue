<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MessageItem from "./components/MessageItem.vue";
import { useChatStore } from "./stores/chat";

const chatStore = useChatStore();
const input = ref("");
const messageList = ref<HTMLElement | null>(null);
const followLatest = ref(true);

async function submit() {
  const content = input.value.trim();
  if (!content || chatStore.isBusy || !chatStore.currentSessionId) return;

  input.value = "";
  followLatest.value = true;

  // 发送未成功发起时，恢复输入内容。
  if (!(await chatStore.sendMessage(content))) input.value = content;
}

async function retry() {
  followLatest.value = true;
  await chatStore.retryMessage();
}

async function clearConversation() {
  if (window.confirm("确定清空本次对话的全部问答和旧对话摘要吗？")) {
    await chatStore.clearConversation();
  }
}

// 向上翻看历史时暂停自动滚动，回到底部后继续跟随新文字。
function updateFollowLatest() {
  const element = messageList.value;
  if (element) {
    followLatest.value =
      element.scrollHeight - element.scrollTop - element.clientHeight < 64;
  }
}

watch(
  () => [
    chatStore.messages.length,
    chatStore.messages.at(-1)?.content.length,
    chatStore.messages.at(-1)?.notice,
    chatStore.isBusy,
  ],
  async () => {
    await nextTick();

    if (followLatest.value && messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight;
    }
  },
);

// 页面打开时恢复当前会话，关闭时停止生成。
onMounted(chatStore.initialize);
onBeforeUnmount(chatStore.stopGenerating);
</script>

<template>
  <main class="page">
    <!-- 装饰花瓣，不参与交互。 -->
    <span
      v-for="n in 5"
      :key="n"
      class="petal"
      aria-hidden="true"
    ></span>

    <section class="chat" aria-label="校园 AI 助手">
      <header>
        <div class="header-top">
          <div class="heading">
            <h1>校园 AI 助手</h1>
            <p>在同一次对话中连续提问，观察历史窗口和旧对话摘要的作用。</p>
          </div>
          <span class="badge">实验 5 · 多轮记忆</span>
        </div>

        <div class="toolbar">
          <span>已保存 {{ chatStore.savedTurns }} 轮问答 · 刷新页面可继续</span>

          <button
            type="button"
            :disabled="chatStore.isBusy"
            @click="chatStore.initialize"
          >
            重新加载
          </button>

          <button
            type="button"
            :disabled="chatStore.isBusy || !chatStore.currentSessionId"
            @click="clearConversation"
          >
            清空本次对话
          </button>
        </div>
      </header>

      <details class="summary">
        <summary>
          查看旧对话摘要 · 已覆盖
          {{ chatStore.session?.summaryThrough ?? 0 }} 轮问答
        </summary>
        <p>
          {{
            chatStore.session?.summary ||
            "尚无摘要。采用摘要策略时，较早对话超出窗口后会生成摘要。"
          }}
        </p>
      </details>

      <div
        ref="messageList"
        class="messages"
        @scroll="updateFollowLatest"
      >
        <p
          v-if="!chatStore.messages.length && !chatStore.isLoading"
          class="welcome"
        >
          先告诉我一些背景，再连续追问，看看我能否记住这些信息。
        </p>

        <template
          v-for="message in chatStore.messages"
          :key="message.id"
        >
          <MessageItem :message="message" />
          <p v-if="message.notice" class="status">
            {{ message.notice }}
          </p>
        </template>

        <p v-if="chatStore.isSending" class="status" role="status">
          {{
            chatStore.messages.at(-1)?.content
              ? "正在生成……"
              : "正在连接模型，请稍候……"
          }}
        </p>

        <p v-else-if="chatStore.isLoading" class="status" role="status">
          正在同步已保存的对话……
        </p>
      </div>

      <p v-if="chatStore.sessionError" class="error" role="alert">
        {{ chatStore.sessionError }}
      </p>

      <p v-if="chatStore.errorMessage" class="error" role="alert">
        {{ chatStore.errorMessage }}
      </p>

      <div v-if="chatStore.canRetry" class="retry">
        <button
          type="button"
          :disabled="chatStore.isBusy"
          @click="retry"
        >
          重试本次回答
        </button>
        <small>可重试当前问题；未完成的回答不会作为新问题的历史。</small>
      </div>

      <form class="composer" @submit.prevent="submit">
        <input
          v-model="input"
          maxlength="2000"
          autocomplete="off"
          aria-label="聊天内容"
          placeholder="输入问题，按 Enter 发送（最多 1000 字）"
          :disabled="chatStore.isBusy || !chatStore.currentSessionId"
        />

        <button
          v-if="chatStore.isSending"
          type="button"
          @click="chatStore.stopGenerating"
        >
          停止生成
        </button>

        <button
          v-else
          type="submit"
          :disabled="
            chatStore.isBusy ||
            !chatStore.currentSessionId ||
            !input.trim() ||
            Array.from(input.trim()).length > 1000
          "
        >
          发送
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  color: #3e5148;
  font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

button:focus-visible,
summary:focus-visible {
  outline: 2px solid #6d9b7f;
  outline-offset: 3px;
}

/* 晨雾绿背景，点缀樱花粉。 */
.page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 18%, rgb(223 182 176 / 38%), transparent 40%),
    radial-gradient(circle at 88% 82%, rgb(183 210 180 / 48%), transparent 42%),
    linear-gradient(160deg, #f4f9f0 0%, #eaf3e6 55%, #fdf7f2 100%);
}

/* 花瓣位于聊天卡片后方，不阻挡操作。 */
.petal {
  position: fixed;
  z-index: 0;
  top: -6vh;
  width: 15px;
  height: 15px;
  background: linear-gradient(135deg, #f4d3c7, #e8b9ad);
  border-radius: 100% 0 100% 0;
  opacity: 0.55;
  pointer-events: none;
  animation: fall linear infinite;
}

.petal:nth-child(1) {
  left: 12%;
  animation-duration: 18s;
}

.petal:nth-child(2) {
  left: 32%;
  width: 11px;
  height: 11px;
  animation-duration: 24s;
  animation-delay: 4s;
}

.petal:nth-child(3) {
  left: 58%;
  width: 18px;
  height: 18px;
  animation-duration: 20s;
  animation-delay: 8s;
}

.petal:nth-child(4) {
  left: 78%;
  width: 12px;
  height: 12px;
  animation-duration: 22s;
  animation-delay: 2s;
}

.petal:nth-child(5) {
  left: 90%;
  animation-duration: 26s;
  animation-delay: 10s;
}

@keyframes fall {
  from {
    transform: translateY(-6vh) rotate(0deg);
  }
  to {
    transform: translateY(112vh) rotate(360deg);
  }
}

/* 沿用前一个文件的卡片尺寸、圆角和投影。 */
.chat {
  position: relative;
  z-index: 1;
  width: min(880px, 100%);
  height: min(760px, calc(100vh - 48px));
  height: min(760px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(109 155 127 / 18%);
  border-radius: 26px;
  background: #fdfcf9;
  box-shadow:
    0 24px 70px rgb(86 122 96 / 16%),
    0 2px 8px rgb(86 122 96 / 6%);
}

header {
  padding: 22px 26px;
  color: #3e5148;
  background: linear-gradient(120deg, #ddebd6 0%, #cde0c4 55%, #f6e4dd 120%);
  border-bottom: 1px solid rgb(109 155 127 / 15%);
}

.header-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.heading {
  flex: 1;
  min-width: 0;
}

header h1,
header p {
  margin: 0;
}

header h1 {
  font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 1px;
}

header p {
  margin-top: 6px;
  color: #5b735f;
  font-size: 13px;
  line-height: 1.6;
}

.badge {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 20px;
  background: rgb(255 255 255 / 55%);
  color: #6d9b7f;
  font-size: 12px;
}

/* 新增工具栏沿用绿色描边按钮。 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.toolbar > span {
  flex: 1;
  color: #5b735f;
  font-size: 13px;
  line-height: 1.6;
}

.toolbar button,
.retry button {
  padding: 6px 14px;
  border: 1px solid #6d9b7f;
  border-radius: 8px;
  color: #3e5148;
  background: #fff;
}

.toolbar button:hover:not(:disabled),
.retry button:hover:not(:disabled) {
  background: #f0f7ec;
}

/* 摘要区域限制高度，避免挤占整个消息区。 */
.summary {
  max-height: 25%;
  overflow-y: auto;
  padding: 12px 24px;
  border-bottom: 1px solid #e3ede0;
  background: #f5f9f0;
}

.summary summary {
  color: #5b735f;
  font-size: 14px;
  line-height: 1.6;
  cursor: pointer;
}

.summary p {
  margin: 10px 0 0;
  color: #3e5148;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 消息区独立滚动，输入区始终留在底部。 */
.messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 24px;
}

.welcome,
.status {
  color: #7a8a7d;
  text-align: center;
  line-height: 1.8;
}

.welcome {
  margin: auto;
}

.status {
  margin: 0;
  font-size: 13px;
}

.error {
  margin: 0;
  padding: 8px 24px;
  color: #b3544b;
  background: #fdeeee;
  overflow-wrap: anywhere;
}

.retry {
  padding: 8px 24px;
  text-align: center;
}

.retry small {
  display: block;
  margin-top: 5px;
  color: #7a8a7d;
  font-size: 12px;
  line-height: 1.6;
}

.composer {
  display: flex;
  gap: 12px;
  padding: 18px 24px;
  border-top: 1px solid #e3ede0;
  background: #fff;
}

.composer input {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid #cfe0cc;
  border-radius: 14px;
  outline: none;
  background: #fbfdf8;
  color: #3e5148;
}

.composer input:focus {
  border-color: #6d9b7f;
  box-shadow: 0 0 0 3px rgb(109 155 127 / 14%);
}

.composer input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.composer button {
  flex-shrink: 0;
  padding: 0 22px;
  border: 0;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #7fa98a, #5e8b6d);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.composer button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgb(94 139 109 / 30%);
}

header,
.summary,
.error,
.retry,
.composer,
.messages > .status {
  flex-shrink: 0;
}

/* 同步消息子组件的配色，避免遗留蓝色样式。 */
:deep(.role) {
  color: #7a8a7d;
}

:deep(.bubble) {
  color: #3e5148;
  border-color: #e3ede0;
  background: #fff;
  box-shadow: none;
}

:deep(.message.user .bubble) {
  color: #fff;
  background: linear-gradient(135deg, #7fa98a, #5e8b6d);
}

:deep(.download-card) {
  color: #5b735f;
  border-color: #cfe0cc;
  background: #f0f7ec;
}

/* 尊重系统的减少动态效果设置。 */
@media (prefers-reduced-motion: reduce) {
  .petal {
    display: none;
  }

  .composer button {
    transition: none;
  }

  .composer button:hover:not(:disabled) {
    transform: none;
  }
}

/* 小屏幕下铺满可用高度。 */
@media (max-width: 640px) {
  .page {
    padding: 0;
  }

  .chat {
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
  }

  header,
  .messages,
  .summary {
    padding: 14px;
  }

  header h1 {
    font-size: 21px;
  }

  .toolbar > span {
    flex-basis: 100%;
  }

  .composer {
    gap: 8px;
    padding: 12px;
  }

  .composer input {
    padding: 12px;
  }

  .composer button {
    padding: 0 14px;
  }

  .error,
  .retry {
    padding: 8px 14px;
  }
}
</style>
