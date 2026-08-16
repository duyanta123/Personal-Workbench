# ADR 0005：E2E 测试基建（Playwright mock 层契约）

状态：已采用（2026-08-16）

## 决策

E2E 统一使用 `e2e/mocks.ts` 的共享 mock 层，契约如下：

- **CORS 头必须显式设置**：dev server（:4173）与 supabase URL（:54321）跨源，`Content-Range` 不在 CORS 安全头列表，必须以 `Access-Control-Expose-Headers: Content-Range` 暴露，否则 supabase-js 的 count 解析恒为 null（统计归零、已完成分组不渲染）。
- **page.route 优先于 setOffline**：被 route 拦截的请求在离线模拟下仍会 fulfill；断言"离线不发请求"应监听 request 事件而非假设全部失败。
- **dev server E2E 模式**（`E2E=1`）：禁用 HMR（离线模拟切断 HMR websocket 触发 vite 整页刷新破坏断言）并放宽 `server.fs.strict`（中文项目路径下带编码查询参数的 SPA 路由会被误判 403）。
- **离线 reload 不可测**：dev 模式无 Service Worker，页面资源无法离线加载。持久化语义以"断言 IndexedDB 命令队列 + 联网收敛后 reload"验证。
- 动态服务端状态（如 todos 列表）用 `todosRef` 引用传递，路由每次请求读取 `ref.current`。

## 原因与后果

三个看似产品缺陷的失败（离线创建挂起、统计恒零、share 页 403）根因分别是 React Query 网络门控、mock 缺 CORS 头、vite fs 严格检查——mock 层与真实 Supabase 网关行为不一致会制造假阴性，契约必须成文。代价是 mock 层需跟随真实网关行为演进（如新增 RPC 时同步 payloads 注册表）。
