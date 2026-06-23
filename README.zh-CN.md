# Smart Bookmark（智能书签）

> [English](./README.md) | **简体中文**

一款隐私优先的浏览器扩展：**一键**收藏当前页面，借助**本地 RAG + 云端 LLM** 推荐合适的文件夹，或建议新建文件夹。它直接写入**浏览器原生书签**，可将**已有书签集合自动重组**为全新的文件夹结构，并把数据备份到 **WebDAV / S3**。

> 当前状态：**设计阶段**。完整规格见 [`docs/`](./docs)，暂无运行时代码。

## 功能特性

- **一键收藏** —— 页面内悬浮按钮 *与* 工具栏弹窗双入口。
- **智能文件夹推荐** —— 本地嵌入召回最相关的候选文件夹，再由云端 LLM 选择其一或建议新建。只把少量候选发给 LLM，绝不发送整棵书签树。
- **原生书签联动** —— 使用 `chrome.bookmarks`，收藏即写入浏览器书签，不存在需要同步的第二份数据。
- **书签重组** —— 对全部书签做嵌入，用 HDBSCAN 自动聚类，由 LLM 为每个簇命名，预览后再应用。破坏性操作一律"预览—确认"，并在执行前自动安全备份。
- **备份与导入导出** —— 以标准 HTML 书签格式单向覆盖快照到 WebDAV 或 S3，支持手动与定时触发。
- **中英双优** —— 使用 `multilingual-e5-small` 嵌入模型，中英文效果都好。
- **隐私优先** —— 嵌入在本地完成；嵌入环节中文件夹名与标题不会离开本机。只有 LLM 精排调用会把页面标题/URL + 候选文件夹名发往你配置的端点。

## 工作原理

```
点击 → 抓取页面 → 本地嵌入 (multilingual-e5-small)
     → HNSW 召回 Top-K 文件夹 → 云端 LLM 精排 (chat/completions, JSON schema)
     → 用户确认 → chrome.bookmarks.create → （可选）备份
```

浏览器原生书签树是唯一数据源；IndexedDB 中的本地向量索引是可随时重建的派生缓存。

## 技术栈

- [WXT](https://wxt.dev) + TypeScript —— 跨浏览器扩展框架（面向 Chrome/Edge，MV3）。
- [Domicile](https://github.com/kyrillosishak/Domicile) 骨架 —— 浏览器端嵌入（Transformers.js）+ HNSW + IndexedDB。
- `multilingual-e5-small` —— 多语言本地嵌入模型。
- HDBSCAN —— 重组时的自动聚类。
- OpenAI 兼容 `/v1/chat/completions` —— 云端 LLM 精排与命名。

## 文档

- [设计概览](./docs/design-overview.md) —— 目标、范围、关键决策、风险。
- [详细设计](./docs/detailed-design.md) —— 模块、数据模型、流程、MV3 约束、里程碑。
- [启动与测试指南](./docs/getting-started.md) —— 构建、加载、手动测试清单、单元测试。
- [TODO / 进度](./docs/TODO.md) —— 里程碑清单。

## 开发

```bash
pnpm install
pnpm dev        # 启动开发构建（Chrome，带 HMR）
pnpm build      # 生产构建 → .output/chrome-mv3
pnpm compile    # 类型检查（tsc --noEmit）
```

加载未打包扩展：打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择 `.output/chrome-mv3`（或开发产物目录）。

## 使用

1. 打开**设置**（扩展选项页），可选地配置 OpenAI 兼容的 LLM 端点、Key 和模型。无 Key 时推荐回退为本地关键词规则。
2. 点击**构建/更新索引**，在本地为已有文件夹生成嵌入（首次会下载嵌入模型）。
3. 打开任意页面，点击悬浮按钮或工具栏图标收藏——选择推荐的文件夹或自行改选。
4. 用**重组书签**把已有书签聚类成新结构（先预览再应用，应用前自动安全备份）。
5. 配置 **Backup**（WebDAV/S3）做单向快照，或在本地导出/导入标准 HTML 书签文件。

## 范围（本期）

**包含：** Chrome/Edge（MV3）、双收藏入口、本地多语言 RAG、云端 chat-completions 精排、单向 WebDAV/S3 备份（手动 + 定时）、HTML 导入导出、书签重组。

**不包含：** Firefox/Safari、双向同步、浏览器内 LLM（WebLLM）、Responses API、自建后端、凭据加密。

## 隐私

嵌入在本地计算。唯一发往第三方的数据发生在 LLM 精排/命名环节：页面标题/URL 和 Top-K 候选文件夹名，发送到**你自己**配置的 OpenAI 兼容端点。API Key 与备份凭据存储在本地（本期为明文），扩展自身绝不上传。

## 许可证

MIT
