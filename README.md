# 📋 工作日报一键总结工具

自动扫描项目中 Claude Code 的对话记录和 Git 代码变更，调用 AI 生成每日工作报告，支持一键导出到飞书文档。

## ✨ 功能

- **📊 一键生成日报** — 扫描指定项目的 JSONL 对话记录 + Git 提交记录，AI 自动总结当日进展、问题与解决方案
- **🤖 多模型支持** — 兼容 DeepSeek / Claude / OpenAI 兼容 API，自动识别 API 类型
- **📈 Token 统计** — 自动计算每轮对话 Token 消耗、缓存命中率、费用（支持自定义模型定价）
- **💻 代码变更追踪** — 读取本地 Git 提交记录，AI 生成代码变更描述
- **📤 飞书导出** — 一键导出日报到飞书文档（可选）
- **📁 多项目管理** — 支持添加多个项目、勾选追踪、独立生成日报
- **📅 历史记录** — 日报归档，支持按日期查看和删除
- **⚙️ 可配置** — API Key、模型定价、工作日起始时间、摘要粒度均可调
- **🔄 自动 Git 提交** — 生成日报前自动 `git add . && git commit`，确保代码变更被捕获
- **📝 持续监控** — 文件监控，检测新对话自动提醒

## 🖼️ 界面预览

```
┌──────────┬──────────────────────────────────────────┐
│ 📋 工作日报 │ 2026年7月20日 星期日                      │
│          │                                          │
│ 今日日报   │ deepseek-v4-pro                          │
│ 历史记录   │ 项目数 3  对话轮数 1182  花费 ¥10.24       │
│          │                                          │
│ 项目管理   │ 🔧 工作日报工具（Electron）                 │
│ 设置      │ 📝 今日进展                                │
│          │ 1. 修复 Token 去重...                       │
│ □ 项目1   │                                          │
│ □ 项目2   │ ⚠️ 遇到的问题                              │
│ □ 项目3   │ 💡 解决方案                                │
│          │                                          │
│          │ 🤖 AI 对话摘要                             │
└──────────┴──────────────────────────────────────────┘
```

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 31 + electron-vite |
| 前端 | React 18 + TypeScript + Arco Design |
| 数据库 | SQLite (better-sqlite3) |
| AI SDK | @anthropic-ai/sdk + axios (OpenAI 兼容) |
| Git | simple-git |
| 文件监控 | chokidar |
| 飞书 | 飞书开放平台 API (docx) |

## 🚀 快速开始

### 前置条件

- Node.js >= 18
- Git
- DeepSeek / Claude / OpenAI 兼容 API Key

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/work-daily-report.git
cd work-daily-report

# 安装依赖
npm install

# （可选）如果 better-sqlite3 编译报错，重建原生模块
npx @electron/rebuild
```

### 配置

1. 启动开发环境：

```bash
npm run dev
```

2. 在应用左侧菜单点击「设置」：

   **AI 模型配置：**
   - `API Key`：填入你的 API 密钥
     - DeepSeek：`sk-xxxxxxxx`
     - Anthropic：`sk-ant-api-xxxxxxxx`
   - `API 地址`：留空使用默认地址，或用代理/中转地址
   - `默认模型`：如 `deepseek-v4-flash`

   **模型定价（可选）：**
   - 自定义每个模型每百万 Token 的价格，用于费用统计
   - 默认预置了 DeepSeek V4 Flash/Pro 和 Claude 系列定价

   **飞书导出（可选）：**
   - 在[飞书开放平台](https://open.feishu.cn)创建企业自建应用
   - 获取 App ID 和 App Secret
   - 按页面提示填写文档导出文件夹 Token

3. 点击「💾 保存配置」

### 添加项目

1. 左侧菜单 → 「项目管理」→「添加项目」
2. 输入项目名称、项目根目录路径
3. 可选：添加项目中的 MD 文档路径（日报生成时会读取）
4. 在项目列表中勾选要追踪的项目

### 生成日报

1. 在「今日日报」页面，点击「🔄 一键生成日报」
2. 等待 AI 分析对话记录和代码变更
3. 日报生成完成后会显示概览和各项目详情

### 导出飞书

生成日报后，点击「📤 导出飞书」即可创建飞书文档。

## 📁 项目结构

```
work-daily-report/
├── electron/              # Electron 主进程
│   ├── main/
│   │   └── index.ts       # 窗口管理、IPC 处理
│   └── preload/
│       └── index.ts       # 预加载脚本（contextBridge）
├── src/
│   ├── main/              # 主进程逻辑
│   │   ├── ai-engine.ts   # AI 调用（Anthropic SDK + OpenAI 兼容）
│   │   ├── config.ts      # 配置读写（~/.work-report/config.json）
│   │   ├── db.ts          # SQLite 数据库初始化
│   │   ├── feishu-exporter.ts  # 飞书文档导出
│   │   ├── git-collector.ts    # Git 提交扫描 + 自动提交
│   │   ├── jsonl-parser.ts     # Claude Code JSONL 解析
│   │   ├── markdown-exporter.ts # Markdown 导出
│   │   ├── report-generator.ts # 日报生成核心流程
│   │   └── watcher.ts     # 文件监控
│   ├── renderer/          # 渲染进程（React UI）
│   │   ├── App.tsx        # 主布局
│   │   ├── components/
│   │   │   ├── AddProjectPage.tsx  # 添加项目页
│   │   │   ├── HistoryPage.tsx     # 历史记录页
│   │   │   ├── ProjectList.tsx     # 项目列表
│   │   │   ├── ReportPreview.tsx   # 日报预览
│   │   │   └── SettingsPage.tsx    # 设置页
│   │   └── styles/
│   └── shared/
│       └── types.ts       # 共享类型定义
├── electron-builder.yml   # 打包配置
├── electron.vite.config.ts
└── package.json
```

## ⚙️ 配置说明

所有配置保存在 `~/.work-report/config.json`，包括：

```json
{
  "apiKey": "你的 API Key（加密存储建议）",
  "apiBaseUrl": "自定义 API 地址（可选）",
  "defaultModel": "deepseek-v4-flash",
  "modelPricing": {
    "deepseek-v4-flash": {
      "inputPerMTok": 1.0,
      "cacheHitPerMTok": 0.02,
      "outputPerMTok": 2.0
    }
  },
  "workdayStartHour": 5,
  "closeToTray": true,
  "chunkSize": 100,
  "trackedProjectIds": []
}
```

> ⚠️ **注意**：API Key 和飞书密钥存储在本地 `~/.work-report/config.json`，不会提交到 Git。请勿将配置文件分享给他人。

## 🔒 隐私说明

- **所有数据存储在本地**：项目配置、日报记录均保存在本地 SQLite 数据库
- **API Key 本地保存**：密钥存储在 `~/.work-report/config.json`，仅用于调用 AI API
- **不上传任何数据**：除了你主动导出到飞书外，不会上传任何数据到第三方服务器
- **Git 提交仅本地**：自动 Git 提交功能只在你本地的 Git 仓库执行

## 🤔 常见问题

**Q: 代码变更显示 0 处？**
A: 确保项目是 Git 仓库（`git init`）。工具会在生成日报前自动执行 `git add . && git commit`。

**Q: Token 消耗数据不准确？**
A: Token 数据直接从 Claude Code 的 JSONL 对话记录中提取，按 `message.id` 去重（避免 thinking + text 重复统计）。费用按你在设置中配置的模型定价计算。

**Q: 日报对话记录串到其他项目了？**
A: 确保各项目的根目录路径不同。工具通过完整路径 slug 精确匹配项目。

**Q: 飞书导出失败？**
A: 检查飞书开放平台中应用的权限是否包含 `docx:document`。

**Q: 如何添加自定义 AI 模型？**
A: 在设置页的「模型定价」区域直接添加模型名称和价格即可。

## 📄 许可证

MIT License

Copyright (c) 2026 work-report-team
