# 备份与恢复 Runbook

## 生产每日备份

应用侧备份分为两个兼容层：V8 使用流式 ZIP/NDJSON，默认恢复容量为单表 500,000 行、总计 2,000,000 行；V1-V7 仍按 40 MiB、单表 50,000 行和总计 200,000 行的旧 JSON 限制校验。V8 按模块或按年份的导出只用于查阅，不可直接恢复。移动 Safari 预测全量输出超过 64 MiB 时应改用桌面端，或选择模块/年份范围。

`production-backup.yml` 原定每日 18:30 UTC（北京时间次日 02:30）定时执行；当前定时触发已移除，仅保留手动 `workflow_dispatch`（所需 GitHub Secrets 尚未配置）。若恢复定时调度，必须保留这个 UTC 时刻并在变更记录中注明时区换算。

1. 用 `pg_dump` 导出 `public` 与 `private` 应用数据库 schema，不包含 Supabase Auth/Storage 内部表；脚本通过两个 `--schema` 参数固定这一范围。
2. 下载 `avatars` bucket 对象，分别用生产 `age` 公钥加密。
3. 把加密的数据库转储、头像对象和清单上传到 S3 兼容存储。
4. 保留最近 30 个每日版本和 12 个每月版本；清理前先完成清单和 SHA-256 校验。

所需环境变量：`SUPABASE_DB_URL`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`AGE_RECIPIENT`、`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`，可选 `S3_REGION`、`S3_PREFIX`、`AGE_BIN`、`PG_DUMP_BIN`。生产 `AGE_SECRET_KEY` 不得出现在 GitHub、Supabase、Sentry 或工作流环境中。

## CI 月度加密链路演练

`npm run backup:drill` 使用一次性 `age-keygen` 密钥对，在专用 `drill/` 前缀执行真实临时 PostgreSQL 的 `pg_dump → age → 上传 → 下载 → 解密 → pg_restore → 行校验 → 清理`，然后检查生产清单、SHA-256、生命周期和版本数。CI 只注入测试 S3 凭据和测试公钥。

## 季度真实恢复

1. 从生产清单选择一个真实每日或月度版本，记录对象键、创建时间和 SHA-256。
2. 在隔离环境离线下载对象；断开网络后用离线保存的生产 `age` 私钥解密。
3. 用 `pg_restore` 恢复到临时 PostgreSQL；将头像对象恢复到临时私有 bucket。
4. 运行 `supabase test db`、关键行数/修订号校验、账本本位币一致性校验和头像签名 URL 校验。
5. 记录 RPO（最后成功备份到故障点）和 RTO（开始恢复到可读状态），由两名维护者复核后销毁临时环境。

## 失败处理

- 任何 `pg_dump`、age、上传、清单校验或生命周期检查失败都应使任务失败，不得删除旧版本。
- `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... LEGACY_LOCAL_QUEUE_COUNT=0 RESTORE_RUNBOOK_VERIFIED=true npm run check:v1-retirement -- --require-eligible` 直接读取私有 `legacy_rpc_usage_daily` 的服务端证据 RPC。只有连续 30 天无缺口、无 stats_reset、无正增量，本地 V1 队列为零且季度恢复 runbook 已验证时才通过；缺少 service-role 凭据时 fail closed，不得删除 V1。
- 每 5 分钟的提醒调度运行会把超过 15 分钟的 queued/running 运行标记为 `timeout`；监控系统应对该状态和备份任务失败创建 Sentry 告警。
- 修改保留数量、加密算法或 S3 前缀必须先更新本 Runbook 和 CI 演练，再发布生产。
