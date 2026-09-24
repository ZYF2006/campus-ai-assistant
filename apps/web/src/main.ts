import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";

const app = createApp(App);

// 注册 Pinia，聊天状态由 stores/chat.ts 统一管理。
app.use(createPinia());

app.mount("#app");
