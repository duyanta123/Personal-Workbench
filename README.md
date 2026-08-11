# 个人工作台

一款集每日计划、习惯打卡、记账、长期目标与内容记录于一体的个人效率工作台。支持 PWA 安装、离线写队列与分块数据恢复，数据通过 Supabase（PostgreSQL + RLS）云端同步。账号采用邀请制，仅限受信后台开通。

## 功能特性

- **首页总览**：今日问候、时钟、专注清单、快速记录、习惯周视图、待办进度、月度开销与健身摘要
- **每日计划**：待办管理，支持优先级、置顶、截止日期与拖拽排序
- **习惯打卡**：习惯管理 + 每日打卡，首页提供本周打卡趋势
- **记账**：收入/支出记录、自定义分类、月度预算与开销统计
- **长期目标**：目标进度追踪与可视化进度条
- **内容记录**：笔记/灵感，支持标签、置顶与多种排版（default / feature / quote）
- **刷题记录**：算法题进度管理，支持平台、难度与五种状态
- **健身记录**：训练会话 + 动作明细 + 身体指标（体重/体脂）
- **番茄钟**：自定义专注/短休/长休时长与循环轮数，支持关联今日待办
- **洞察复盘**：多维度数据统计与趋势分析
- **全局搜索**：跨模块快速检索

**数据可靠性**

- **离线写队列（outbox）**：写入先落 IndexedDB，联网后自动同步；带幂等 ID 与恢复纪元校验，弱网不丢写、不重复计数
- **数据备份**：完整 JSON 备份（含头像）、记账/待办 CSV 导出、分块断点式恢复（revision 冲突检测）
- **头像历史**：自定义头像上传，保留 5 张历史，可切换与删除
- **深链接恢复**：路由级持久化，刷新/跳转不丢状态

**账号与安全**

- 邀请制登录（公开注册关闭）、密码找回与重置（`/update-password` 回调）
- 最小 12 位密码强度约束
- 全量 RLS 策略 + security definer RPC 收紧，anon 无任何业务表权限

**体验**

- PWA 可安装，带更新提示（手动刷新）、明暗主题、侧栏折叠
- 全局错误边界，构建产物按供应商分包

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 路由 | React Router v7 |
| 状态管理 | Zustand + TanStack Query |
| 样式 | Tailwind CSS 4 |
| 后端 | Supabase（PostgreSQL + Auth + Storage + RLS） |
| 图标 | lucide-react |
| 单元测试 | Vitest + Testing Library |
| E2E 测试 | Playwright |
| 数据库测试 | pgTAP（Supabase CLI） |
| 静态检查 | ESLint 9 + typescript-eslint + jsx-a11y |
| PWA | vite-plugin-pwa |

## 项目结构

```
├── public/                 # 静态资源（PWA 图标、安全头、SPA 回退）
├── src/
│   ├── components/         # 布局与 UI 组件（含测试）
│   │   ├── ui/             # 通用组件库
│   ├── hooks/              # 数据请求与业务逻辑 hooks
│   ├── lib/                # Supabase 客户端、outbox、本地存储、游标分页
│   ├── pages/              # 页面（按路由划分）
│   ├── stores/             # Zustand 全局状态
│   ├── utils/              # 纯逻辑工具（含测试）
│   ├── test/               # 测试配置
│   ├── App.tsx             # 路由入口
│   └── types.ts            # 全局类型定义
├── e2e/                    # Playwright 端到端测试
├── scripts/                # 迁移一致性检查等脚本（含测试）
├── supabase/
│   ├── migrations/         # 核心迁移（可立即发布）
│   ├── deferred_migrations/ # 延迟迁移（按 DEPLOYMENT.md 节奏发布）
│   ├── deferred_tests/     # 延迟迁移配套测试
│   ├── tests/database/     # pgTAP 数据库测试
│   └── config.toml         # Supabase CLI 本地配置
├── .env.example            # 环境变量示例
├── DEPLOYMENT.md           # 部署顺序与平台说明
├── eslint.config.js
├── playwright.config.ts
├── vercel.json
└── vite.config.ts
```

## 快速开始

### 环境要求

- Node.js 22+
- npm
- supabase CLI（数据库相关操作）

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，填入 Supabase 项目信息（Supabase 控制台 → Project Settings → API）：

```
VITE_SUPABASE_URL=https://你的项目ref.supabase.co
VITE_SUPABASE_ANON_KEY=你的anon公钥
```

> 注意：`VITE_` 前缀的变量会打包进前端，只允许填 anon 公钥，绝不要填 service_role 密钥。

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

> 账号采用邀请制：需在 Supabase Auth 中通过 Invite User 创建账号，公开注册已在配置中关闭。

## 数据库

数据库使用 Supabase CLI 管理：

```bash
# 登录并关联远程项目
supabase login
supabase link --project-ref <你的项目ref>

# 推送迁移前先核对本地/远程历史一致
npm run check:migrations

# 审阅后推送
supabase db push --dry-run
supabase db push
```

- `supabase/migrations/`：核心迁移，CI 从零重建验证，可随时发布。
- `supabase/deferred_migrations/`：延迟迁移（如头像桶转私有、最终撤权），不会自动应用，按 `DEPLOYMENT.md` 的发布节奏移入核心目录后发布。

详细发布顺序与各平台（Vercel / Netlify / COS / OSS）配置见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 测试

```bash
# 单元与组件测试（Vitest）
npm test

# 脚本测试（Node 内置 test runner）
npm run test:scripts

# 端到端测试（Playwright，需本机 Chrome）
npm run test:e2e

# 数据库测试（pgTAP，需 Docker；CI 已覆盖）
supabase db start
supabase test db
```

## 构建与部署

```bash
# 静态检查 + 类型检查 + 全部测试 + 构建（CI 同款）
npm run ci

# 仅构建
npm run build
```

构建产物输出到 `dist/`，可部署到 Vercel、Netlify 或腾讯云 COS / 阿里云 OSS。仓库已内置 `vercel.json`、`public/_headers`、`public/_redirects`（SPA 回退 + 安全头 + CSP）。部署前请先完成 Supabase Auth 的 Site URL / Redirect URL 配置，详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 脚本命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查并构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | ESLint 检查（零警告） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行全部单元/组件测试 |
| `npm run test:watch` | 测试监听模式 |
| `npm run test:scripts` | 运行脚本测试 |
| `npm run test:e2e` | 运行 Playwright E2E 测试 |
| `npm run check:migrations` | 核对本地/远程迁移历史一致 |
| `npm run ci` | 完整质量门禁（lint + typecheck + 测试 + 构建） |
