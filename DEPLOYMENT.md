# 部署约定

所有环境都必须先在 Supabase Auth 中配置精确的站点 URL 与 `/update-password` 回调 URL，并保持公开注册关闭。若使用 Supabase 自定义域名，需要把该域名加入 CSP 的 `connect-src` 与 `img-src`。

## 数据库发布顺序

`supabase/migrations/` 只包含可立即应用的核心迁移，CI 会从零重建并验证这些迁移。任何生产变更前先创建数据库快照并运行 `npm run check:migrations`，确认本地/远程历史一致；再执行 `supabase db push --dry-run` 审阅，禁止修改已应用的历史文件。该检查只比较核心迁移，延迟目录按下方发布步骤单独处理。

`supabase/deferred_migrations/` 中的 SQL 不会被常规 `supabase db reset` 或 `supabase db push` 自动执行。按以下顺序发布：

1. 先发布当前前端和核心迁移，确认签名头像 URL、IndexedDB 头像缓存、outbox 与新操作 RPC 正常工作。
2. 前端稳定后，把 `20260811000001_private_avatars.sql` 原样移入 `supabase/migrations/`，经 CI 后发布，从而关闭头像公开读取。
3. 至少观察一个完整发布周期，并确认旧恢复、番茄和写入 RPC 连续 30 天无调用；然后把 `20260811000002_post_rollout_lockdown.sql` 原样移入 `supabase/migrations/`，经 CI 后发布最终撤权。

不得直接在生产 SQL 控制台执行延迟文件，否则 Supabase 迁移历史不会记录该变更。CI 会临时复制并从零执行延迟迁移，同时运行 `supabase/deferred_tests/`，因此延迟 SQL 的语法和最终权限状态仍在合并前受验证。

## Vercel

仓库根目录的 `vercel.json` 已提供 SPA 回退和安全头。`index.html`、`sw.js` 不应长期缓存，带内容哈希的 `/assets/*` 可永久缓存。

## Netlify

`public/_redirects` 和 `public/_headers` 会由 Vite 复制到产物根目录，提供首次深链接回退、缓存策略和安全头。

## COS / OSS

将 `dist/` 上传到存储桶并启用静态网站托管：入口和错误文档均设为 `index.html`。在 CDN 控制台配置：

- `index.html`、`sw.js`、`manifest.webmanifest`：`Cache-Control: no-cache`
- `/assets/*`：`Cache-Control: public, max-age=31536000, immutable`
- 全局响应头：与 `public/_headers` 相同的 CSP、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`
- 404 回源或错误页返回 `index.html`，HTTP 状态按平台能力设为 200

发布新版本时先上传带哈希资源，再上传 `index.html` 和 Service Worker，避免旧页面引用的资源提前消失。
