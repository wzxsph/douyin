# refer/douyin Agent 交接规则

先阅读两级父目录的 `../../docs/AGENT_HANDOFF.md`、`../../docs/ARCHITECTURE.md`、`../../docs/TDD_TEST_PLAN.md` 和 `../../财经推演室_PRD_V2.0.md`。

## 仓库安全

- 当前分支：`feat/caibao-analysis-pipeline`。
- `upstream` 是公共上游 `zyronon/douyin`，不得 push；项目 `origin` 尚未配置。
- 工作树包含底座稳定化、财经前端和分析服务；不要 reset、checkout 或批量格式化未理解的文件。
- 服务端密钥只放 `.env.minimax`/`.env.doubao`，不要提交或打印。

## 修改顺序

1. 先写/更新 `server/test` 或 `src/features/finance-cues/__tests__` 的失败用例。
2. 实现最小改动。
3. 执行 `pnpm test && pnpm type-check && pnpm type-check:server && pnpm build`。
4. 涉及视频时钟、半屏或底座交互时，再执行 `pnpm test:e2e`。

## 产品不变量

- 财包半屏最高 48vh、无蒙层，交互时视频继续播放。
- 自动触点最多 6 个、最小间隔 45 秒、同一时刻最多 1 个。
- 匿名抖音主页失败必须显式返回，不绕过风控。
- 没有 MediaAsset 与权利声明不得分析；模型只生成 draft。
