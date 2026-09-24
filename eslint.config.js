import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

// ESLint 9+ 推荐使用 Flat Config：所有规则集中在一个数组中，执行顺序从上到下。
export default tseslint.config(
  {
    // 构建产物和第三方依赖不属于我们的源代码，不参与检查。
    ignores: ["**/dist/**", "**/node_modules/**", "**/.husky/_/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.{js,mjs,cjs,ts,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // 下划线开头的参数通常表示“接口要求存在，但当前暂不使用”。
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        // 让 Vue 解析器把 <script lang="ts"> 交给 TypeScript 解析器。
        parser: tseslint.parser,
      },
    },
  },
  // 必须放在最后：关闭与 Prettier 冲突的格式规则。
  prettier,
);
