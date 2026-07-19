# 工作日报一键总结工具 — 完整设计方案

> 最后更新: 2026-07-19 | 决策数: 38

---

## 一、总览

| 维度 | 决策 |
|---|---|
| **工具形态** | Electron 桌面应用 (独立窗口、跨编辑器) |
| **前端技术栈** | React + TypeScript + Arco Design |
| **构建工具** | Electron-Vite |
| **AI 引擎** | Claude API 直连 (默认)，支持多模型可插拔 |
| **本地存储** | SQLite (日报数据) + JSON 配置文件 (~/.work-report/config.json) |
| **打包分发** | P0 dev 模式开发 → P1 electron-builder Windows 安装包 |

---

## 二、功能矩阵

### P0 — MVP (最小可用版本)
- Electron 基础界面 (项目列表 + 日报预览)
- Claude Code JSONL 解析 (会话边界 + token 提取)
- Git diff 采集 + AI 代码变更总结 (A+C)
- AI 日报一键生成 (一键触发，生成即草稿保存)
- SQLite 本地存储 + 基础 CRUD (项目/日报/条目全层级)
- Markdown 导出 (基础飞书兼容格式)

### P1 — 核心体验
- D 模式持续记录 (chokidar 文件监控 → 每 5 轮 + 会话结束触发微摘要)
- 多项目配置管理 (从 Claude Code 项目列表导入 + 手动添加)
- 日历热力图导航 (含日报日期高亮)
- 原地编辑 + AI 学习反馈 (编辑对存为 few-shot，下次 prompt 附带)
- 飞书多维表格导出 (甘特图，每个工作片段独立一行)
- 飞书文档导出 (长篇日报格式)
- 系统托盘最小化

### P2 — 锦上添花
- 本地甘特图预览
- 全文搜索
- 多模型可插拔
- 自定义 Token 定价 (RMB)
- 开机自启
- 网页版 AI 手动记录入口

---

## 三、触发模式: A + D

| 模式 | 描述 |
|---|---|
| **A. 手动触发** | 下班前点「一键生成」按钮，扫描当日数据生成日报 |
| **D. 持续记录** | chokidar 监听 `~/.claude/projects/` JSONL 增量，自动触发微摘要；轮询每 2-3 分钟兜底 |

**工作日定义**: 可配置，默认 05:00 起算 (凌晨 5 点前的对话算前一日)

---

## 四、数据采集

### 4.1 Claude Code 对话
- 来源: `~/.claude/projects/<project-slug>/<sessionId>.jsonl`
- 自动匹配: 通过 JSONL 中 `cwd` 字段前缀匹配已配置的项目路径
- 话题边界: 按 `sessionId` (一个文件 = 一次会话 = 一个话题)
- 微摘要策略: 每 5 轮 + 会话结束时触发，只读摘要级别内容
- 精读策略: 用户手动触发时 或 AI 认为摘要不够用时

### 4.2 项目 MD 文件
- 方式: 每个项目自由配置 MD 文件路径 (支持通配符)
- 全量扫描为默认行为，配置后精准读取

### 4.3 代码变更
- 方式: Git diff (`simple-git` 封装)
- AI 摘要: 把 diff 内容发给 AI，生成功能描述
- 格式: `文件路径 | 变更类型 | +/-行数 | AI 功能描述`

### 4.4 网页版 AI 工具 (ChatGPT/DeepSeek/豆包)
- 不自动获取
- 用户手动总结后在日报中补充

---

## 五、JSONL 解析 (已验证)

直接可提取字段:
```
sessionId     → 会话边界
timestamp     → ISO 8601 UTC
cwd           → 项目匹配 (前缀)
model         → 模型名称
usage.input_tokens / output_tokens / cache_read_input_tokens
              → Token 三要素
usage.cache_creation.ephemeral_{1h,5m}_input_tokens
              → 缓存写入统计
usage.service_tier → 服务等级
gitBranch     → 分支
isSidechain   → 是否 subagent
attributionAgent → agent 类型
attributionSkill → skill 类型
```

---

## 六、AI 流水线 (Prompt Chain)

```
阶段 0: 数据采集 (无需 AI)
  ├─ Git diff 解析
  ├─ JSONL 增量扫描
  └─ MD 文件读取

阶段 1: 对话微摘要 (D 模式触发，每 5 轮 + 会话结束)
  输入: 单段对话摘要
  输出: { 时间, 模型, 主题, 结论, token数据 }

阶段 2: 代码变更总结 (一键触发)
  输入: git diff + 文件名
  输出: { 文件路径, 变更行数, 功能描述 }

阶段 3+4: 日报汇总 + 概览 (合并，一键触发)
  输入: 微摘要列表 + 代码总结 + 项目MD文件 + 编辑反馈
  输出: 完整日报 JSON (进展/问题/解决方案/概览)
```

**编辑反馈学习**: 用户编辑后的 `{original, edited}` 对存入 `edit_feedback` 表，下次 prompt 附带

---

## 七、日报结构

```markdown
📅 2026-07-19 工作日报

┌──────────────────────────────────────┐
│ 📊 概览                              │
│ 项目数: 3 | 对话: 27轮 | 代码变更: 8处 │
│ 总Token: 128K (缓存命中: 45K, 35%)   │
│ 预估费用: ¥24.50 (缓存节省: ¥8.60)  │
│ 待解决问题: 2                        │
└──────────────────────────────────────┘

🔧 项目 A — 机械臂VLA
  ├─ 📝 今日进展
  ├─ 💻 代码产出
  │   ✚ / ✎ / ✖ 文件路径 (+/-行数)
  │     → AI 生成的功能描述
  ├─ ⚠️ 遇到的问题
  ├─ 💡 解决方案
  └─ 🤖 AI 对话摘要
      09:15 标定算法方案讨论 (12轮)
        │ 63K token ┃ 命中 28K (44%) ┃ ¥13.00
```

---

## 八、数据库设计 (SQLite)

```sql
projects (
  id, name, root_path,
  md_files TEXT[],
  created_at, updated_at
)

sessions (
  id, project_id,
  session_id TEXT UNIQUE,
  model TEXT,
  started_at, ended_at,
  round_count INT,
  parent_session_id TEXT
)

session_summaries (
  id, session_id,
  round_range INT4RANGE,
  topic TEXT,
  conclusion TEXT,
  token_input INT, token_output INT,
  token_cache_hit INT, token_cache_write INT,
  model TEXT, cost_rmb REAL,
  generated_at
)

work_snippets (
  id, project_id, date DATE,
  snippet_type TEXT,     -- coding | discussion | debug | docs
  title TEXT,
  description TEXT,
  start_time TIMESTAMP, end_time TIMESTAMP,
  source TEXT            -- session_id / git_commit_hash / manual
)

code_changes (
  id, project_id, date DATE,
  file_path TEXT,
  change_type TEXT,      -- added | modified | deleted
  lines_added INT, lines_removed INT,
  description TEXT,
  commit_hash TEXT, git_diff TEXT
)

daily_reports (
  id, project_id, date DATE UNIQUE,
  raw_json TEXT,          -- AI 生成的原始日报 JSON
  edited_json TEXT,       -- 用户编辑后的版本
  token_total INT, token_cache_hit INT,
  cost_rmb REAL,
  issues_unsolved TEXT[],
  status TEXT,            -- draft | published | exported
  exported_feishu_doc_id TEXT,
  exported_feishu_base_id TEXT,
  created_at, updated_at
)

edit_feedback (
  id, project_id,
  field_path TEXT,
  original TEXT, edited TEXT,
  created_at
)
```

---

## 九、飞书导出

### 导出目标
- 可配置: 个人空间 / 团队共享文件夹
- 单向导出 (本地 → 飞书)，不在飞书端修改

### 飞书多维表格字段 (甘特图)
| 字段 | 类型 | 说明 |
|---|---|---|
| 工作内容 | 文本 | AI 摘要标题 |
| 项目名称 | 单选 | 项目归属 |
| 开始时间 | 日期时间 | 甘特图起点 |
| 结束时间 | 日期时间 | 甘特图终点 |
| 工作类型 | 单选 | 编码/调试/讨论/文档 |
| 详细描述 | 多行文本 | 点击色块查看详情 |
| 相关文件 | 文本 | 代码产出文件 |
| Token消耗 | 数字 | 关联对话 token |
| 问题/解决方案 | 多行文本 | 问题记录 |
| 状态 | 单选 | 进行中/已完成/卡住 |
| Claude Code链接 | 链接 | 原始对话入口 |

- 每个工作片段独立一行
- 时间来源: 对话时间戳 (自动) + 手动拖拽调整

### 认证
- 飞书企业自建应用 (免费，API QPS 限流远超日报需求)
- 权限: `docx:document:write`, `bitable:app`, `drive:drive`

---

## 十、主界面布局

```
┌─────────────────────────────────────────┐
│ 📋 工作日报工具                    ⚙️ │
├──────────┬──────────────────────────────┤
│ 📁 项目  │                              │
│  ├ 机械臂VLA│   📅 2026-07-19           │
│  ├ 项目B   │   ┌──────────────────┐    │
│  ├ 项目C   │   │  📝 日报预览区域  │    │
│  +添加项目 │   │  (原地编辑)      │    │
│          │   │                  │    │
│ 📋 历史  │   └──────────────────┘    │
│  [日历热力图]│                          │
│          │  [🔄 一键生成] [💾 保存]     │
│          │  [📤 导出飞书]             │
└──────────┴──────────────────────────────┘
```

- 交互: Notion 式原地编辑 (点击 → 内联编辑)
- 导航: 日历热力图 + 全文搜索
- 编辑历史: `{original, edited}` 对 → AI 学习

---

## 十一、技术依赖

| 功能 | 库 |
|---|---|
| 文件监控 | chokidar |
| Git 操作 | simple-git |
| Claude API | @anthropic-ai/sdk |
| SQLite | better-sqlite3 |
| 飞书 API | 直接 HTTP + axios |
| Markdown 渲染 | react-markdown + rehype |
| 代码编辑器 | @monaco-editor/react |
| 日历热力图 | 自绘 SVG/CSS Grid |
| 本地甘特图 | gantt-task-react |
| UI 组件 | @arco-design/web-react |

---

## 十二、应用生命周期

- 窗口关闭 → 退出 (默认)
- 设置可开启「关闭到系统托盘」
- 托盘图标显示今日已记录工作片段数
- 可选开机自启 (P2)

---

## 十三、Token 费用与 AI 管理

- 费用货币: RMB
- Claude 定价: 内置自动计算
- 其他模型: 用户在设置页手动输入 input/output 每百万 token 价格
- 不填 = 不显示费用

### API 异常处理
- 失败 → 弹通知，用户手动重试 (不自动降级)

---

## 十四、开发路线

```
Phase 0: 项目初始化
  ├─ Electron-Vite + React + TypeScript 脚手架
  ├─ Arco Design 集成
  └─ SQLite + better-sqlite3 配置

Phase 1: P0 功能
  ├─ JSONL 解析引擎
  ├─ Git diff 采集
  ├─ Claude API 集成 + Prompt Chain
  ├─ 日报生成 + SQLite CRUD
  ├─ 基础 UI (项目列表 + 日报预览 + 一键按钮)
  └─ Markdown 导出

Phase 2: P1 功能
  ├─ 文件监控 + 微摘要系统
  ├─ 日历热力图
  ├─ 原地编辑 + AI 学习
  ├─ 飞书多维表格导出
  ├─ 飞书文档导出
  └─ 系统托盘

Phase 3: P2 功能
  ├─ 本地甘特图
  ├─ 全文搜索
  ├─ 多模型可插拔
  ├─ 自定义定价
  └─ 开机自启
```
