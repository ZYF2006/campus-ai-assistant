# RAG 实验运行说明

本说明只针对第 3 题：在原毕业设计问答应用中，使用 `knowledge.md`、Ollama 嵌入模型和 Chroma 实现检索增强问答。

## 第 3 题：毕业设计问答

在项目根目录安装依赖，并在 Ollama 中准备嵌入模型 `bge-m3`。回答模型继续由 `apps/server/.env` 的原有配置决定；MySQL 仍保存会话，Chroma 保存知识向量。`apps/server/.env.example` 已列出 RAG 配置。

```powershell
pnpm install
ollama pull bge-m3
pnpm rag scripts/preview-rag.ts
pnpm rag scripts/check-embedding.ts
```

在终端 A 启动 Chroma，保持运行：

```powershell
pnpm rag scripts/chroma.ts
```

在终端 B 导入资料并检查检索：

```powershell
pnpm rag scripts/import-rag.ts
pnpm rag scripts/search-rag.ts "来源于生产实践的毕业设计选题，选题来源表需要盖章吗？"
```

在终端 C 启动原有 MySQL、回答模型服务以及应用：

```powershell
pnpm dev
```

### 聊天页面验收步骤

开始前保持 Chroma（8006 端口）、MySQL、回答模型服务和 `pnpm dev` 运行。浏览器打开 Vite 终端显示的地址，通常是 `http://localhost:5173/`；如果该端口被占用，以终端实际显示的地址为准。页面应显示“已保存 0 轮问答”或恢复已有会话，且没有连接错误。`apps/server/.env` 中 `LLM_PROVIDER` 决定回答模型；本地 `bge-m3` 只负责嵌入检索。

1. **核对盖章依据。** 在输入框发送“来源于生产实践的毕业设计选题，选题来源表需要盖章吗？”。预期回答说明：这种选题的来源表须加盖实习单位公章，完成后交指导老师。回答末尾应有“本轮参考资料”，至少包含 `knowledge.md / 二、学生需提交的材料`。页面“已保存”轮数增加 1。若结论不对，先运行上面的 `search-rag.ts` 命令检查检索结果是否包含这条原文。
2. **核对资料缺失时不编造。** 在同一会话继续发送“具体交到哪个房间？”。预期回答明确说检索资料没有写具体房间，不应给出房号。这个追问也检查历史对话是否仍被带入模型。基础检索对“那这个呢”等纯代词问题不保证找到原文，验收时用这里的完整追问。
3. **核对停止生成。** 发送一个需要较长回答的问题，例如“请详细说明毕业实习报告的材料和日志要求”，在页面出现“正在生成”时立即点击“停止生成”。页面可保留带“已停止”的临时气泡，但“已保存”轮数不应增加。刷新后这轮不完整的问答应消失；若回答已经正常结束，说明停止点击晚了，需要重新发送再试。
4. **核对刷新恢复。** 对步骤 1 的完整回答，按浏览器刷新键。预期已保存的问答重新出现，回答末尾的“本轮参考资料”仍在，已保存轮数保持不变。停止生成的临时气泡不应恢复。
5. **核对 Chroma 持久化。** 在 Chroma 终端按 Ctrl+C，重新运行 `pnpm rag scripts/chroma.ts`。无需重新导入，另开终端运行上面的 `search-rag.ts` 示例问题；预期仍返回包含盖章条款的知识块。然后回到页面再次问完整的来源表问题，预期仍能回答并附出处。

如果修改了 `knowledge.md`、分块参数或 `RAG_EMBEDDING_MODEL`，请在 Chroma 和 Ollama 运行时重新执行 `pnpm rag scripts/import-rag.ts`，然后再做上述检索和页面验收。单纯重启 Chroma 不需要重新导入。
