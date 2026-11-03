# 下载目录（/download）

把需要提供给前端下载的文件（.docx / .pdf / .zip 等）放进本目录，
服务端会通过 `express.static` 把它们映射到 `/download/<文件名>`。

在模型回复里用 Markdown 链接指向文件即可，前端 MessageItem.vue 会把它渲染成下载卡片：

[附件2：广州软件学院毕业实习（分散）申请表](/download/fensanshixi-shenqingbiao.docx)
[附件3：广州软件学院学生校外实践教学安全责任书](/download/anquanzherenshu.docx)
[附件5：广州软件学院本科毕业实习报告](/download/shixi-baogao.docx)
