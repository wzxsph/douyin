# 财经推演室 · 财包

把财经视频变成时间轴上的轻量认知互动：关键点先出现一个可忽略的“财包 POI 微入口”；
用户点击后进入不超过半屏的互动，视频暂时暂停；关闭、完成或跳过后，仅在进入前正在播放时恢复。

本仓库是 Vue/Vite/Express 工程原型，基于 `douyin-vue` 底座重构。产品与 PRD 的权威仓库是
[wzxsph/caibao](https://github.com/wzxsph/caibao)，当前候选口径见父仓
`财经推演室_PRD_V2.6.md`。

> 当前仅限内部、本地 PoC。媒体不进入 Git，不公开分发；不提供投资建议，也不把估算时间码包装成生产审核结论。

## 当前产品形态

1. 视频按已审核的时间轴播放。
2. 到达自动触点时，出现 4–6 秒的 44px 高财包微入口；入口出现期间视频继续播放。
3. 点击入口后暂停真实 `<video>`，展开无蒙层、最高 48vh 的半屏互动。
4. 完成、关闭或跳过时按进入前状态恢复；原本暂停、视频结束、组件卸载或上下文切换时不会误播。
5. 未自动出现或选择“稍后”的节点可从时间轴主动重访。
6. 视频结束后生成无总分、无百分比的过程式学习足迹。

财包从不替换作者头像。播放控制器不修改音量、静音、倍速或播放位置；仅用户主动点击时间轴回访时允许 seek。

## 已实现能力

- 六类轻互动：背景卡、快速判断、因果拼接、条件滑杆、反例翻转、概念辨析。
- 确定性编排：自动触点不设独立数量上限，间隔至少 45 秒、同时最多 1 个；内容包总节点最多 6 个。
- 类型化播放协议：`pause-for-interaction` / `release-interaction`，按 `interactionId` 幂等。
- 四套 `internal_poc` 财经内容：FIFA、AI 电力、自动驾驶、AI 资本。
- 授权 manifest 校验、H.264/AAC 浏览器派生、封面、SHA-256、FFprobe、GET/HEAD 与 HTTP Range。
- MiniMax/方舟 OpenAI-compatible 语义模型、豆包 ASR、火山 OCR 与确定性 Draft 生成管线。
- 前后端 Vitest、Playwright 多视口和离线安全测试。

## 推荐视频：单一事实源

普通推荐、财经 Demo 与长视频推荐只读取服务端：

```text
GET /api/finance/v1/media/catalog
```

服务端的唯一来源是本地、Git-ignored 的：

```text
media-import/authorized-douyin/download-manifest.json
```

catalog 只返回通过以下校验的有效子集：

- manifest Schema、重复 ID、固定内容映射和授权有效期；
- 相对路径 containment 与 realpath/symlink 边界；
- 文件存在、bytes、SHA-256、时长、尺寸和编解码；
- H.264/AAC、`yuv420p`、fast-start 派生与封面完整性。

服务兼容 manifest schema v1/v2。当前本地 v2 清单包含更多采集条目，但推荐白名单不会随
manifest 扩大：只有固定映射到四套 `finance-xiaolin-*` 内容包的 videoId 可进入 catalog，其他条目明确排除。

任何失败都会 fail closed：推荐页显示“暂无可用授权视频”，不会回退 `posts6.json`、`videos.md`、
旧 Demo 视频或随机评论。`?demo=finance-fed` 不改变视频白名单。

当前四条媒体仅获内部 PoC 使用许可，授权截至 **2026-08-22 上海日末**。GitHub Pages 等无本地 API/媒体的公开环境显示空推荐是预期行为。

## 本地运行

要求 Node.js、pnpm、FFmpeg 与 FFprobe。

```bash
git clone https://github.com/wzxsph/douyin.git
cd douyin
git checkout refactor/moneybaby-v2.4-foundation
pnpm install --frozen-lockfile
```

把经授权的源媒体和 `download-manifest.json` 放入上述 Git-ignored 目录，然后生成浏览器派生文件：

```bash
pnpm prepare:authorized-media
```

该命令只写 `.analysis-work/authorized-media/<batchId>/`，不会覆盖 `public/demo/`。若同一 batch 已存在，会拒绝覆盖。

分别启动 API 与前端：

```bash
# 终端 1；只使用媒体接口时无需调用模型
pnpm start:api:minimax

# 终端 2
pnpm dev
```

- 前端：`http://127.0.0.1:3000/`
- API：`http://127.0.0.1:18787/`
- Vite 开发服务器会代理 `/api/finance`；分离部署时配置 `VITE_FINANCE_API_BASE_URL`。

`.env.minimax` 与 `.env.doubao` 只在本地填写，禁止提交。变量说明见
[`server/README.md`](server/README.md) 与两个 `.env.*.example`。

## 媒体 API

```text
GET       /api/finance/v1/media/catalog
GET|HEAD  /api/finance/v1/media/:videoId/video
GET|HEAD  /api/finance/v1/media/:videoId/poster
```

- 视频支持完整响应、单段 Range 和 suffix Range；非法/多段 Range 返回 `416`。
- 未知 ID 返回 `404`；已知但授权过期返回 `410`。
- catalog 不暴露本机路径，也不伪造点赞、评论、播放量或远程头像。

## 代码结构

```text
src/features/authorized-media/   catalog 契约、白名单与推荐适配
src/features/video-extensions/   视频扩展宿主和播放状态机
src/features/finance-cues/       POI、六类互动、时间轴、学习足迹与内容包
src/components/slide/BaseVideo.vue 真实 video 集成
server/src/media/                manifest 校验、派生与媒体服务
server/src/pipeline/             ASR/OCR/语义/规则/Planner/Draft 管线
server/src/app.ts                Express API
```

## 测试门禁

默认测试离线运行，不调用付费模型：

```bash
pnpm test
pnpm type-check
pnpm type-check:server
pnpm build
pnpm test:e2e
pnpm audit --prod
git diff --check
```

媒体准备后的本地验收还应确认四条视频均能 `loadedmetadata`，尤其
`7660817965343870248` 的完整时长约为 341.264 秒，而不是旧的 177 秒截断文件。

## 安全与发布边界

- 不提交 `.env*`、Cookie、token、源视频、派生视频、封面、音轨、关键帧或模型产物。
- 不绕过抖音登录、验证码、签名或风控；公开可见不等于有权下载、处理或再分发。
- 模型只能生成 Draft；方向规则、发布状态与报告事实由确定性逻辑控制。
- 不保存原始语音，不推断财富状况、风险偏好或投资能力。
- 公开部署、CDN 与公开分发授权不在当前范围。

## 许可与致谢

项目基于 [zyronon/douyin](https://github.com/zyronon/douyin) 二次开发，遵循仓库内
[GPL-3.0](LICENSE)；同时继承上游“仅供学习研究、不得商用”的说明。财包新增能力集中在
`src/features/` 与 `server/`。
