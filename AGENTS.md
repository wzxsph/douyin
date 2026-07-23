# refer/douyin｜Agent 工作约定

本目录是独立的 Vue/Vite/Express 应用仓；父目录 `/home/samsong/Desktop/maybe/caibao`
是产品与 PRD 仓。接手前先读父仓 `AGENTS.md`、`docs/AGENT_HANDOFF.md` 和最新
Review Candidate。任何 Mock 内容不得写成已审核结论。

## 接手检查

```bash
cd /home/samsong/Desktop/maybe/caibao/refer/douyin
git status --short
git branch --show-current
git log -5 --oneline
git remote -v
```

- 当前线上基线：`master@e85de2bfa1743aaea5204f6e1513de6d56c2e310`；同域媒体修复在 `fix/pages-same-origin-media`。
- `origin=https://github.com/wzxsph/douyin.git`；`upstream` 只是公共底座。
- 未获用户当次明确授权，不 push、不 force-push、不创建 PR，也不向 `upstream` 写入。
- 工作树可能包含用户或其他 Agent 的未提交媒体/fixture；禁止 reset、checkout 覆盖或代提交。

## 当前产品不变量

- 关键点先出现“财包 POI 微入口”：约 44px 高、最大 216px、4–6 秒自动收起，可从时间轴重访。
- 邀请出现时继续播放；用户点击进入互动时暂停；关闭、完成或跳过时，仅在进入前正在播放且上下文未变时恢复。
- 半屏最高 48vh、无蒙层；作者头像与财包严格分离。打开半屏后屏蔽视频背景单击播放。
- 自动触点不设独立数量上限，但间隔至少 45 秒、同时最多 1 个；当前 Mock 的六类语义模板自然产生最多 6 个节点，不得恢复“最多 4 个”的截断。
  `delivery: timeline_only` 的节点不得自动弹出，但可主动重访。
- 播放控制不得写 `currentTime`、`muted`、`volume` 或 `playbackRate`；时间轴主动回访是唯一允许的显式 seek。
- 报告无总分、百分比、财富画像和投资建议；未互动只写“尚未观察”。

## 授权媒体单一事实源

唯一推荐源是 Git-ignored 的：

`media-import/authorized-douyin/download-manifest.json`

- 普通推荐只消费 manifest 的有效条目；`?demo=finance-fed` 不决定白名单。运行时只保留推荐流与作者页。
- 当前 schema v2 清单 25 条均有一一对应的 `finance-showcase-<videoId>` Mock 内容；清单、内容种子和体验映射必须精确同集，缺失时生成失败关闭。
- 公开 Pages 只展示 `src/showcase/public-video-ids.json` 中 10 条，两位作者各 5 条。它是 manifest 有效集合的显式子集，不得由旧 mock 补位；缩减公开带宽不能破坏 25 条生成管线。
- catalog/API 失败、授权过期、文件/bytes/SHA/FFprobe 校验失败时 fail closed，绝不回退 `posts6.json`、
  `videos.md`、旧媒体或随机评论。
- 25 条内容均为 `internal_poc` / `mock`，基于标题与 manifest 元数据的估算触点；不代表公开生产审核通过。
- 权利状态为用户声明、项目未独立核验，截至 2026-08-22 上海日末。用户已直接要求建立带作者归属的 GitHub Pages 展示；代码中必须保留原作品链接、Mock/非投资建议/非官方声明。媒体不进入 Git 历史，浏览器派生只发布为独立 Release 资产。
- 浏览器派生文件只写入 `.analysis-work/showcase-media/<batchId>/`，不覆盖 `public/demo/`。Pages 构建先生成前端，再用 `stage:showcase-pages-media` 将 10 条已校验媒体复制进临时 `dist/media/`；浏览器必须使用 Pages 同域 URL，不再直连 Release：

```bash
pnpm prepare:showcase
VITE_SHOWCASE_MEDIA_BASE_URL=./media/ pnpm build-gp-pages
SHOWCASE_MEDIA_SOURCE_DIRECTORY=.analysis-work/showcase-media/<batchId> pnpm stage:showcase-pages-media
```

## 代码地图

| 路径                                   | 职责                                               |
| -------------------------------------- | -------------------------------------------------- |
| `src/showcase/`                        | 10 条公开推荐、作者页、25 条生成内容与公开子集配置 |
| `src/features/video-extensions/`       | 扩展契约、宿主、类型化播放请求与幂等控制器         |
| `src/features/finance-cues/`           | POI、半屏、六类交互、时间轴与学习足迹              |
| `server/src/showcase/`                 | 内容种子与确定性 LLM Mock 生成器                   |
| `server/src/media/authorized-media.ts` | manifest/来源/派生校验、准备器、catalog 与资产解析 |
| `server/src/app.ts`                    | catalog、GET/HEAD、HTTP Range 与既有分析 API       |
| `server/src/pipeline/`                 | ASR/OCR/语义、确定性 Planner、规则与 Draft 生成    |

## 本地运行

首次或源媒体变化后先准备浏览器媒体，再分别启动 API 与前端：

```bash
pnpm install --frozen-lockfile
pnpm prepare:showcase
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
推荐空态，10 条公开子集、同域 `video/mp4`/Range、自动触点间隔与单实例约束，邀请继续播放、点击暂停、条件恢复、幂等与媒体属性不变。

## 禁止事项

- 不提交 `.env*`、token、Cookie、`media-import/`、`.analysis-work/`、`public/demo/` 大视频、`dist/media/` 或模型产物；公开展示媒体只允许从带归属和声明的 Release 在 Actions 中暂存到 Pages artifact。
- 不把公开可见等同于有权下载/处理，不绕过登录、验证码、签名或风控。
- 不把 `internal_poc`、估算时间码、静态 fixture 或 HTTP 客户端存在写成生产审核/真实模型验证。
- 不恢复“互动不停播”、自动触点独立数量上限、旧推荐池 fallback 或用财包替换作者头像的旧口径。
