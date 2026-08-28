# Phase 1 生产基线记录

这份记录模板用于在第一次生产发布前填写；仓库不保存生产数据、数据库 URL、签名 URL 或任何密钥。发布人应把填好的副本存入受限的变更记录，并在这里保留记录编号和校验摘要。

## 发布元数据

| 字段 | 值 |
| --- | --- |
| 生产提交 SHA | `待填写` |
| Supabase 项目/环境 | `待填写` |
| `supabase migration list --linked` 摘要 SHA | `待填写` |
| 快照对象/保留期限 | `待填写` |
| V7 导出 SHA-256 | `待填写` |
| 记录编号/复核人 | `待填写` |

## 数据一致性快照

使用 service role/管理员连接在隔离终端执行以下只读查询，并把结果和 SHA-256 放入受限记录：

```sql
select table_name, row_count
from private.get_user_table_counts('<USER_ID>');

select revision, restore_epoch
from public.user_data_revisions
where user_id = '<USER_ID>';

select name, metadata->>'size' as bytes, created_at
from storage.objects
where bucket_id = 'avatars'
  and (storage.foldername(name))[1] = '<USER_ID>'
order by name;

select currency_code, count(*)
from public.ledger_entries
where user_id = '<USER_ID>'
group by currency_code;
```

如果当前项目没有 `private.get_user_table_counts`，应使用同等的逐表 `count(*)` 查询；该查询结果必须覆盖 `private.workbench_backup_tables_v7()` 返回的全部表。账本结果必须为单一币种或空集；否则先停止发布并修复数据。

## 发布前门槛

- [ ] 快照可在隔离环境列出并读取。
- [ ] 当前 V7 JSON 导出可解析，SHA-256 已记录。
- [ ] 头像对象清单与应用表记录一致。
- [ ] 账本本位币单一且与 `user_preferences.currency_code` 一致。
- [ ] `database.types.ts` 注释基线提交已先于功能迁移。

生产证据缺失时只能继续本地/CI 验证，不能将 Phase 1 验收标记为已完成。
