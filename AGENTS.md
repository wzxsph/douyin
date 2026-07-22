# refer/douyin｜Agent 工作约定

本目录是独立应用代码仓，不是父目录产品仓的一部分。任何修改前先读
`../../docs/AGENT_HANDOFF.md`；产品争议以 `../../财经推演室_PRD_V2.0.md` 为准。

## 5 分钟接手

```bash
cd /home/samsong/Desktop/maybe/caibao/refer/douyin
git status --short
git branch --show-current
git remote -v
```

- 正确分支：`feat/caibao-analysis-pipeline`。
- `upstream=https://github.com/zyronon/douyin` 只是公共上游；没有项目 `origin`。
- 不 push `upstream`，不 reset/checkout 用户工作树，不批量格式化未理解的底座文件。
- 真实密钥只在 Git-ignored 的 `.env.minimax` / `.env.doubao`；禁止读取后打印、复制到日志或提交。
- 本地凭据状态与安全事件见父目录交接文档，不在本文件记录任何值。

## 当前第一任务

先修正本地开发启动脚本的监听边界并加验证：`package.json` 中 `vite --host` 会覆盖
`vite.config.ts` 的回环配置，可能监听 `0.0.0.0`。在修复前不要运行 `pnpm dev`、`pnpm start`
或 `pnpm serve`；统一使用：

```bash
pnpm exec vite --host 127.0.0.1 --port 3001 --strictPort
# http://127.0.0.1:3001/?demo=finance-fed
```

完成定义：默认脚本只监听回环地址，普通推荐流与财经 Demo 均通过，相关文档同步更新。

## 代码地图

| 路径 | 职责 | 状态 |
|---|---|---|
| `src/components/slide/BaseVideo.vue` | 毫秒媒体时钟、扩展宿主挂载 | 已实现 |
| `src/features/video-extensions/` | 通用视频扩展契约与宿主 | 已实现 |
| `src/features/finance-cues/` | 财包触点、半屏、状态机、足迹与总结 | 已实现三类模板 |
| `src/mock/index.ts` | `?demo=finance-fed` 固定工程占位视频 | 仅 Demo |
| `server/src/sources/` | 公开页合规探测、创作者 OAuth 元数据 | 已实现契约 |
| `server/src/media/` | FFmpeg/FFprobe、指纹、音轨与关键帧 | 已实现；本机缺二进制 |
| `server/src/providers/` | MiniMax/方舟、豆包 ASR、火山 OCR | 真实 HTTP 客户端，未做真实付费验证 |
| `server/src/pipeline/` | 证据门禁与确定性 Cue Planner | 已实现 |
| `server/src/jobs/` | 内存任务和 DraftExperience | 已实现；无持久化 |
| `server/test/` | 默认离线的服务端测试 | 25 项基线 |
| `e2e/finance-cues.spec.ts` | 半屏不停播、多视口、总结与隔离 | 6 项基线 |

## 产品不变量

- 财包在视频时间轴上多次轻量出现；半屏最高 48vh、无蒙层，交互期间不得自动暂停或静音。
- 自动触点最多 6 个、最小间隔 45 秒、同时最多 1 个；忽略只记为“未观察”。
- 作者头像不被财包替换；报告无总分、无虚假百分比、无买卖建议。
- 匿名抖音主页失败必须显式返回，不绕过验证码、签名、登录或风控。
- 没有 MediaAsset、处理权声明和 evidenceId 不得分析；模型只能生成 draft，不能直接 approved。
- ASR 时间不得越过媒体时长；OCR 缺失/非法置信度不进入证据；冲突触点高优先级胜出。

## TDD 与交付门禁

先写失败用例，再做最小实现。默认测试不得联网或消耗额度。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
pnpm type-check:server
pnpm build
pnpm test:e2e
pnpm audit --prod
git diff --check
git status --short
```

当前已验证基线：13 个前端 Vitest、25 个服务端 Vitest、6 个 Playwright E2E；两套类型检查、
生产构建和 `pnpm audit --prod` 通过。真实 Provider、真实授权视频和人工审核不在该基线内。

## 环境与运行边界

- `.env.minimax` 当前已有本地语义模型与 ASR 配置；不得输出值，真实调用前按父交接文档执行轮换。
- `.env.doubao` 尚未完成方舟配置；OCR 与抖音 OAuth 尚未配置。
- `LIVE_PROVIDER_TESTS` 只有配置解析，没有 live suite；设为 `true` 也不会自动验证供应商。
- 本机没有 `ffmpeg` / `ffprobe`，不要把媒体流水线写成“已跑通”。
- Docker 路径已按用户要求暂停，当前镜像未验证。原 Compose 会展开 env，原 build context 也未排除
  `.env*`、媒体和分析产物；在单独完成安全加固前不要运行或宣传 Docker 路径。
- 健康检查不产生模型费用；创建真实分析任务可能调用 ASR/模型，必须先获得用户对素材权利和费用的确认。

## 后续队列

1. 修复默认开发监听边界。
2. 建立默认跳过、默认不联网的 live-provider preflight/smoke harness。
3. 获得一条 10–30 秒有处理权视频后，执行 ASR→OCR→语义→draft dry run。
4. 建人工审核与 ApprovedExperience 发布门禁。
5. 前端切为 ApprovedExperience API-first + 明确 Demo fallback。
6. 再补 Session/Event/Summary API 与剩余轻交互模板。

## 禁止事项

- 不 push `upstream`，不创建远端或 PR，除非用户明确授权。
- 不提交 `.env*`、Cookie、token、模型原始响应、用户媒体、音轨、关键帧或 `.analysis-work/`。
- 不把公开可见等同于有权下载/再处理，不接收浏览器 Cookie 做采集。
- 不运行未脱敏的 `docker compose config`；它会展开 `env_file`。
- 不把静态 fixture、占位时间码、HTTP 客户端存在写成真实供应商或真实内容已验证。
