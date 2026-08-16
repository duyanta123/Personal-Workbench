# ADR 0004：客户端离线写路径与本地投影

状态：已采用（2026-08-16）

## 决策

写操作一律由 React Query mutation 承载，但全局 `mutations.networkMode` 设为 `always`：mutationFn 不受 React Query 在线状态门控，离线时立即执行并进入 commands.ts 的本地命令队列（IndexedDB outbox），由 `useCommandSync` 在联网后 flush。

缓存投影（`domainCommands.ts`）遵循两条硬规则：

1. **先算后写**：投影结果与缓存同引用时绝不调用 `setQueryData`。QueryCache 的 subscribe 回调由 setQueryData 同步触发，"写回原值"也会引发 notify → replay → 写回的同步无限递归（栈溢出）。
2. **subscribe 防重入**：`useCommandSync` 的 QueryCache 订阅回调在重放期间置位标志，嵌套回调直接返回。

编辑类表单提交最小 diff patch（仅实际变化字段），避免把其他设备已变更的字段以过时的 expected 值重发，造成多设备假冲突。

## 原因与后果

离线创建原先静默挂起：默认 `networkMode: 'online'` 在 `navigator.onLine === false` 时暂停 mutationFn，本地队列根本拿不到命令，UI 无投影、无报错。本地队列本身即离线策略，React Query 的网络门控与之职责重叠，必须让位。

最小 diff patch 的代价是编辑表单需记录原始行（`editingOriginal`）；收益是字段级自动合并真正可用。投影规则违反时表现为"保存后页面崩溃（栈溢出）"，E2E quick capture 流程是该回归的守卫。
