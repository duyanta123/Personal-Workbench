# 部署约定

所有环境都必须先在 Supabase Auth 中配置精确的站点 URL 与 `/update-password` 回调 URL，并保持公开注册关闭。若使用 Supabase 自定义域名，需要把该域名加入 CSP 的 `connect-src` 与 `img-src`。

## 数据库发布顺序

`supabase/migrations/` 只包含可立即应用的核心迁移，CI 会从零重建并验证这些迁移。任何生产变更前先创建数据库快照并运行 `npm run check:migrations`，确认本地/远程历史一致；再执行 `supabase db push --dry-run` 审阅，禁止修改已应用的历史文件。该检查只比较核心迁移，延迟目录按下方发布步骤单独处理。

`supabase/deferred_migrations/` 中的 SQL 不会被常规 `supabase db reset` 或 `supabase db push` 自动执行。按以下顺序发布：

1. 先提交并发布 `database.types.ts` 的漂移语义注释基线，再记录生产 SHA、迁移历史、行数、头像对象清单和账本本位币。
2. 签名头像 URL、IndexedDB Blob 缓存和 4 分钟续签已在前端上线；直接发布 `20260811000001_private_avatars.sql`，验证上传、切换、删除、离线缓存和跨用户拒绝后删除旧公开直链测试工具。
3. 配置 Vault 中的 `workbench_send_reminders_url`/`workbench_scheduler_secret`、Edge Function 的 VAPID 密钥、Sentry DSN 和 S3/age 公钥。生产 age 私钥只离线保存。
4. 使用 `private.legacy_rpc_usage_daily` 连续取得 30 天无缺口、无调用、无 stats_reset 的证据，再发布 `post_rollout_lockdown`；偏好 V2 发布并稳定一个周期后再发布 `core_write_lockdown`（其中包含 `user_preferences` 撤权）。

不得直接在生产 SQL 控制台执行延迟文件，否则 Supabase 迁移历史不会记录该变更。CI 会临时复制并从零执行延迟迁移，同时运行 `supabase/deferred_tests/`，因此延迟 SQL 的语法和最终权限状态仍在合并前受验证。

## Vercel

仓库根目录的 `vercel.json` 已提供 SPA 回退和安全头。`index.html`、`sw.js` 不应长期缓存，带内容哈希的 `/assets/*` 可永久缓存。

Sentry 发布追踪依赖构建期环境变量 `VITE_APP_RELEASE`：Vercel 项目环境变量中将 `VITE_APP_RELEASE` 设为 `VERCEL_GIT_COMMIT_SHA` 的系统变量引用；CI 构建由 workflow 注入 `github.sha`。未设置时事件不携带 release，不影响运行。

## Netlify

`public/_redirects` 和 `public/_headers` 会由 Vite 复制到产物根目录，提供首次深链接回退、缓存策略和安全头。

## COS / OSS

将 `dist/` 上传到存储桶并启用静态网站托管：入口和错误文档均设为 `index.html`。在 CDN 控制台配置：

- `index.html`、`sw.js`、`manifest.webmanifest`：`Cache-Control: no-cache`
- `/assets/*`：`Cache-Control: public, max-age=31536000, immutable`
- 全局响应头：与 `public/_headers` 相同的 CSP、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`
- 404 回源或错误页返回 `index.html`，HTTP 状态按平台能力设为 200

发布新版本时先上传带哈希资源，再上传 `index.html` 和 Service Worker，避免旧页面引用的资源提前消失。

## Phase 2 运行时配置

- `VITE_VAPID_PUBLIC_KEY` 只放公钥；`VAPID_SUBJECT`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 和 `WORKBENCH_SCHEDULER_SECRET` 仅配置在 `send-reminders` Edge Function secrets。
- 在 Supabase Vault 写入 `workbench_send_reminders_url` 和 `workbench_scheduler_secret`，`pg_cron + pg_net` 每 5 分钟创建 run ID 并调用 Edge Function；不要改用 GitHub Actions 定时器。
- `vite-plugin-pwa` 已使用 `injectManifest`；发布前执行旧 generateSW 构建离线启动→升级新 SW 的浏览器测试，确保预缓存清单和 `/share` 行为不变。

## 备份

生产每日备份和季度真实恢复按 [`docs/backup-runbook.md`](docs/backup-runbook.md) 执行。CI 的 `npm run backup:drill` 只使用测试 age 密钥和 S3 drill 前缀，绝不读取生产私钥。
