import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 浏览器请求 /api 时由 Vite 转发给 Express，开发阶段无需在前端写死后端地址。
      // 页面必须通过 http://localhost:5173 访问，不能双击 HTML 使用 file://。
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
