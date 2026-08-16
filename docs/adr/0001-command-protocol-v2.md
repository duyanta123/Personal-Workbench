# ADR 0001：WorkbenchCommandV2

状态：已采用（2026-08-13）

## 决策

所有核心结构化实体写入统一进入显式命令注册表。命令包含客户端生成的 `commandId`、`entityId`、`restoreEpoch`、字段级 `expected`、`baseVersion` 和父命令依赖。服务端 RPC 只接受枚举命令与字段白名单。

更新仅在同一字段的远端值偏离 `expected` 时冲突；不同字段可自动合并。删除要求精确版本。恢复导致 epoch 改变时命令进入 `stale`，不自动丢弃。

## 原因与后果

目标是单用户多设备的可解释收敛，不引入 CRDT、事件溯源或协作文档复杂度。客户端必须持久化 pending/conflict/failed/stale 状态，并提供保留远端或基于当前版本重放的解决方式。旧 RPC 在延迟锁定迁移完成前保留。
