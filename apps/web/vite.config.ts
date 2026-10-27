import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],

  server: {
    // 页面必须通过 http://localhost:5173 访问，不能双击 HTML 使用 file://。
    port: 5173,

    proxy: {
      // 普通聊天和流式聊天都包含在 /api 下。
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },

      // 保留第三讲已有的文件下载功能：
      // 否则页面访问 5173 时，下载链接不会自动进入 3000 的 Express 服务。
      "/download": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
