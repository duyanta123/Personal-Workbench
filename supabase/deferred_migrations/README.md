# 延迟迁移

这里的 SQL 已纳入版本控制和 CI，但不会被 Supabase CLI 自动应用。达到 `DEPLOYMENT.md` 中的发布条件后，一次只把对应文件原样移入 `supabase/migrations/`，再通过正常迁移流程发布。

禁止改写、压缩、重命名或直接在生产 SQL 控制台执行这些文件。
