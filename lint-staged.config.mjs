// 只检查已经 git add 的文件，避免每次提交都扫描整个项目。
export default {
  "*.{js,mjs,cjs,ts,vue}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yaml,yml,css,html}": "prettier --write",
};
