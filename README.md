# 财包 · 财经视频推演

财包把财经长视频变成时间轴上的轻量学习体验：关键点先出现一个可忽略的 POI 微入口；用户点击后，视频在当前位置暂停并展开不超过 `48vh` 的互动；完成、关闭或跳过后，只在进入前正在播放时恢复。

[在线预览](https://wzxsph.github.io/douyin/#/home) · [产品与 PRD](https://github.com/wzxsph/caibao)

> 这是独立参赛学习原型，与抖音及原作者不存在官方隶属关系。当前互动内容由确定性 LLM Mock 仅根据标题和清单元数据生成，尚未使用最终 ASR/OCR，也未经财经审核；内容不构成投资建议。

## 现在包含什么

- 公开展示 10 条清单视频：小Lin说 5 条、大陆姓陆 5 条；完整生成管线仍校验清单全部 25 条，推荐流不会混入旧底座视频。
- 两个产品页面：全屏推荐流与作者作品页；旧商城、消息、发布、个人中心等页面不再进入运行时。
- 六类财包互动：背景卡、快速判断、因果拼接、条件滑杆、反例翻转、概念辨析。
- 过程式学习足迹：记录已观察证据、回答与待回看节点，不显示总分或伪精度。
- Express 媒体与分析服务：manifest 校验、FFmpeg、ASR/OCR/多模态接口、HTTP Range 和确定性生成管线。
- 浏览器首次只能静音自动播放；页面会显示“点击开启声音”。用户点击视频、播放键或声音胶囊后，在同一次手势中解除静音并播放，并在当前站点记住选择。若浏览器拒绝自动播放，会显示可操作的“点击有声播放”，而不是静默失败。

自动邀请没有“最多 4 个”的独立限制。当前内容包最多表达 6 个语义节点；相邻自动触点至少间隔 45 秒，同时只展示一个。邀请出现时视频继续播放，点击进入互动后才暂停。

## 素材、归属与生成状态

媒体来源与原作品链接逐条保存在 `src/showcase/generated/showcase-bundle.json`，页面也为每条作品提供“查看抖音原作品”入口：

- [小Lin说的抖音主页](https://www.douyin.com/user/MS4wLjABAAAAunpkE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pI_GYBVR-Pv23uFyfMPB_9I)
- [大陆姓陆的抖音主页](https://www.douyin.com/user/MS4wLjABAAAA6b3eAQq1k20Z6HyqKmL12qRfa4Ny5HCZ8sT-IsMeYc4H51zhDpYlEXZFb849i4SA)

权利状态按下载清单记录为“用户声明、项目未独立核验”，有效期至 **2026-08-22 上海日末**。公开预览使用从清单源文件生成的 640 长边 H.264/AAC 派生文件；源派生保存在 GitHub Release，部署工作流只选择 `src/showcase/public-video-ids.json` 中两位作者各 5 条复制进 Pages artifact，以同域 `video/mp4` + HTTP Range 播放。媒体不进入 Git 历史，到期未续期时应停止展示。

所有财包内容均为 `internal_poc` / `mock`，不是生产审核结论。真实上线仍需最终 ASR、OCR、多模态证据时间轴、财经人审、作者/媒体一致性校验和适用于目标环境的分发权利。

## 本地运行

要求 Node.js 20+、pnpm 10+、FFmpeg 与 FFprobe。

```bash
git clone https://github.com/wzxsph/douyin.git
cd douyin
pnpm install --frozen-lockfile
```

如果只看远端 Release 媒体，可配置地址后直接启动前端；部分网络或内嵌浏览器不适合直接流式播放 Release，线上 Pages 使用的是同域媒体目录：

```bash
VITE_SHOWCASE_MEDIA_BASE_URL=https://github.com/wzxsph/douyin/releases/download/showcase-media-20260723-v1/ pnpm dev
```

如果本地持有 `media-import/authorized-douyin/download-manifest.json` 及清单视频，先生成浏览器派生文件与内容包，再启动 API 和前端：

```bash
pnpm prepare:showcase

# 终端 1；只访问媒体接口不会调用付费模型
pnpm start:api:minimax

# 终端 2
pnpm dev
```

- 前端：`http://127.0.0.1:3000/`
- API：`http://127.0.0.1:18787/`
- 派生输出：`.analysis-work/showcase-media/<batchId>/`
- MiniMax / 豆包环境变量：见 [`server/README.md`](server/README.md) 和 `.env.*.example`

真实密钥只放 Git-ignored 的 `.env.minimax` / `.env.doubao`，不得写进 `VITE_*`、提交或日志。

## 代码地图

```text
src/showcase/                     推荐流、作者页、25 条目录与生成内容
src/showcase/public-video-ids.json 公开展示的 10 条平衡子集
src/features/finance-cues/        POI、半屏、六类互动、时间轴、学习足迹
src/features/video-extensions/    扩展宿主与幂等播放状态机
server/src/showcase/              25 条内容种子与确定性 LLM Mock 生成器
server/src/media/                 manifest、派生、哈希、ffprobe 与 Range
server/src/pipeline/              ASR/OCR/语义/规则/Planner/Draft 管线
server/src/app.ts                 Express API
```

## 测试与构建

默认门禁离线运行，不调用付费模型：

```bash
pnpm test
pnpm type-check
pnpm type-check:server
pnpm build
pnpm test:e2e
pnpm audit --prod
git diff --check
```

生成与媒体专项：

```bash
pnpm prepare:showcase-media
pnpm generate:showcase-content
pnpm build-gp-pages
SHOWCASE_MEDIA_SOURCE_DIRECTORY=.analysis-work/showcase-media/<batchId> pnpm stage:showcase-pages-media
```

媒体准备会校验路径边界、bytes、SHA-256、时长、尺寸和编解码；Pages 暂存还会复核 10 个 MP4 的派生 SHA/bytes 及封面格式。流程不会覆盖 `public/demo/`，也不会把源视频或派生文件加入 Git。

## 安全边界

- 不提交 token、Cookie、`.env*`、源视频、派生视频、音轨、关键帧或模型原始响应。
- 不绕过抖音登录、验证码、签名或风控；公开可见不等于可任意下载或再分发。
- 模型输出只能形成 Draft/Mock；方向规则、发布状态和报告事实由确定性逻辑控制。
- 不保存原始语音，不推断财富状况、风险偏好或投资能力。

## 许可与致谢

应用基于 [zyronon/douyin](https://github.com/zyronon/douyin) 重构，代码遵循仓库内 [GPL-3.0](LICENSE)，并继承上游仅供学习研究的说明。视频版权归对应原作者/权利人；本项目保留逐条来源链接与作者归属。
