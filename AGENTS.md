# refer/douyin｜Agent 工作约定

本目录是独立的 Vue/Vite/Express 应用仓；父目录 `/home/samsong/Desktop/maybe/caibao`
是产品与 PRD 仓。接手前先读父仓 `AGENTS.md`、`docs/AGENT_HANDOFF.md` 和
`财经推演室_PRD_V2.6.md`。V2.6 当前是 Review Candidate，不得写成已批准版本。

## 接手检查

```bash
cd /home/samsong/Desktop/maybe/caibao/refer/douyin
git status --short
git branch --show-current
git log -5 --oneline
git remote -v
```

- 当前应用分支：`refactor/moneybaby-v2.4-foundation`。
- `origin=https://github.com/wzxsph/douyin.git`；`upstream` 只是公共底座。
- 未获用户当次明确授权，不 push、不 force-push、不创建 PR，也不向 `upstream` 写入。
- 工作树可能包含用户或其他 Agent 的未提交媒体/fixture；禁止 reset、checkout 覆盖或代提交。

## V2.6 产品不变量

- 关键点先出现“财包 POI 微入口”：约 44px 高、最大 216px、4–6 秒自动收起，可从时间轴重访。
- 邀请出现时继续播放；用户点击进入互动时暂停；关闭、完成或跳过时，仅在进入前正在播放且上下文未变时恢复。
- 半屏最高 48vh、无蒙层；作者头像与财包严格分离。打开半屏后屏蔽视频背景单击播放。
- 自动触点不设独立数量上限，但间隔至少 45 秒、同时最多 1 个；内容包总时间轴节点最多 6 个。
  `delivery: timeline_only` 的节点不得自动弹出，但可主动重访。
- 播放控制不得写 `currentTime`、`muted`、`volume` 或 `playbackRate`；时间轴主动回访是唯一允许的显式 seek。
- 报告无总分、百分比、财富画像和投资建议；未互动只写“尚未观察”。

## 授权媒体单一事实源

唯一推荐源是 Git-ignored 的：

`media-import/authorized-douyin/download-manifest.json`

- 普通推荐、财经 Demo 和长视频推荐都只消费服务端 catalog 的有效子集；
  `?demo=finance-fed` 不决定白名单。
- manifest schema v1/v2 均可解析，但 schema 升级或新增条目不得扩大四个固定 finance videoId 白名单；
  其他条目必须以 `AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED` 排除。
- catalog/API 失败、授权过期、文件/bytes/SHA/FFprobe 校验失败时 fail closed，绝不回退 `posts6.json`、
  `videos.md`、旧媒体或随机评论。
- 四条内容仅为 `approvalScope: internal_poc`，估算时间码由用户接受；不代表公开生产审核通过。
- 当前授权截至 2026-08-22 上海日末，仅限本地 PoC。视频、派生文件、封面和分析产物不得提交或公开部署。
- 浏览器派生文件只写入 `.analysis-work/authorized-media/<batchId>/`，不覆盖 `public/demo/`：

```bash
pnpm prepare:authorized-media
```

## 代码地图

| 路径                                   | 职责                                               |
| -------------------------------------- | -------------------------------------------------- |
| `src/features/authorized-media/`       | catalog 校验、四 ID 白名单、推荐卡适配与空态       |
| `src/mock/index.ts`                    | manifest-only 推荐与长视频推荐；未知评论为空       |
| `src/components/slide/BaseVideo.vue`   | 真实媒体时钟、互动暂停/条件恢复、背景点击门禁      |
| `src/features/video-extensions/`       | 扩展契约、宿主、类型化播放请求与幂等控制器         |
| `src/features/finance-cues/`           | POI、半屏、六类交互、时间轴、学习足迹与四套内容    |
| `server/src/media/authorized-media.ts` | manifest/来源/派生校验、准备器、catalog 与资产解析 |
| `server/src/app.ts`                    | catalog、GET/HEAD、HTTP Range 与既有分析 API       |
| `server/src/pipeline/`                 | ASR/OCR/语义、确定性 Planner、规则与 Draft 生成    |

## 本地运行

首次或源媒体变化后先准备浏览器媒体，再分别启动 API 与前端：

```bash
pnpm install --frozen-lockfile
pnpm prepare:authorized-media
pnpm start:api:minimax
pnpm dev
```

- API 默认 `127.0.0.1:18787`，Vite 默认 `127.0.0.1:3000` 并代理 `/api/finance`。
- 可用 `VITE_FINANCE_API_BASE_URL` 指向独立 API；不配置时使用同源路径。
- `.env.minimax` / `.env.doubao` 只存本地密钥；只能记录变量名和位置，禁止输出值。
- 准备授权媒体不调用模型；创建分析任务可能产生费用，须另行确认素材权利与费用。

## TDD 与交付门禁

默认测试必须离线、不得消耗模型额度：

```bash
pnpm test
pnpm type-check
pnpm type-check:server
pnpm build
pnpm test:e2e
pnpm audit --prod
git diff --check
git status --short
```

专项至少覆盖：manifest 路径穿越/重复 ID/过期/缺失/指纹与时长错误，Range/HEAD，
推荐空态，自动触点间隔与单实例约束，邀请继续播放、点击暂停、条件恢复、幂等与媒体属性不变。

## 禁止事项

- 不提交 `.env*`、token、Cookie、`media-import/`、`.analysis-work/`、`public/demo/` 大视频或模型产物。
- 不把公开可见等同于有权下载/处理，不绕过登录、验证码、签名或风控。
- 不把 `internal_poc`、估算时间码、静态 fixture 或 HTTP 客户端存在写成生产审核/真实模型验证。
- 不恢复“互动不停播”、自动触点独立数量上限、旧推荐池 fallback 或用财包替换作者头像的旧口径。
