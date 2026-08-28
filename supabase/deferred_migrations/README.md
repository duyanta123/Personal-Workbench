# 延迟迁移

这里的 SQL 已纳入版本控制和 CI，但不会被 Supabase CLI 自动应用。达到 `DEPLOYMENT.md` 中的发布条件后，一次只把对应文件移入 `supabase/migrations/`，再通过正常迁移流程发布。

规则：

- 禁止压缩多个延迟文件为一个，禁止在生产 SQL 控制台直接执行这些文件。
- 文件移入 `supabase/migrations/` 之前允许修订内容（尚未应用，不构成对历史迁移的篡改）；修订必须独立提交并说明原因。一旦移入即视为已应用，此后禁止再修改。
- 文件名时间戳不得与 `supabase/migrations/` 中已有版本重复，且移入时必须严格大于最新已应用版本；不满足时在移入前重命名为新的 UTC 时间戳。`npm run check:migrations:local` 会对重复版本报错、对过期版本告警。
