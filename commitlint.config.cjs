// 特意使用 .cjs 展示 CommonJS 配置文件；项目业务代码统一使用 ESM。
module.exports = {
  // conventional 规范要求提交信息形如：feat: 完成消息组件
  extends: ["@commitlint/config-conventional"],
};
