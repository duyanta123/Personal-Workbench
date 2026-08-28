# 性能基线与重构门

Phase 1 已把逐 chunk gzip 基线写入 [`config/bundle-budget.json`](../config/bundle-budget.json)。Phase 2 完成后冻结本文件中的导航和请求预算；Phase 3 的每个领域拆分必须通过相同的 Playwright/Chrome 采样，并在独立提交中说明任何预算变化。

- FCP ≤ 2.5 秒，LCP ≤ 3.5 秒（CI 使用冷启动 Chromium 采样三次取中位数）。
- 首次可交互前 Supabase 请求数 ≤ 24；离线启动不得产生网络重试风暴。
- 总 gzip 和已有 chunk 预算继续由 `npm run check:bundle` 强制执行。

预算只用于防止回归，不会自动删除历史数据或降低功能上限。更换浏览器/运行器时先更新采样方法和版本化基线，再批准预算调整。

## Phase 2/3 baseline (2026-08-21)

The controlled post-hardening build records `329953` total gzip bytes. The budget was updated from this measured value and keeps the existing 10% total-growth guard. The increase is approved for Sentry and sensitive-auth UI, Web Push and the `injectManifest` service worker, V8 streaming backup support, runtime contracts, and domain component extraction. The measurement includes the Zod-backed `rpcSchemas` chunk introduced by the runtime contract work.

The original Phase 1 evidence remains in `config/bundle-budget.json` under `history.phase1`: commit `d90e9c958f916895e16fccf3057f1a6bfea724a4`, `281987` total gzip bytes. Future baseline changes must retain that historical record and explain their reason in an independent change.
