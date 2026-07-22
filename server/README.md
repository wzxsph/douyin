# 财包离线视频分析服务

该服务把具备处理权的视频转换成**待人工审核的触点草稿**。它不会自动发布内容，不会从任意抖音主页下载媒体，也不会把密钥打进 Vite 客户端。

## 本地启动

1. 安装 FFmpeg/FFprobe，或使用 `docker compose -f docker-compose.analysis.yml up --build`。
2. 将有权使用的视频放进 `media-import/`。
3. 填写 Git-ignored 的 `.env.minimax` 或 `.env.doubao`。
4. 启动：

```bash
pnpm start:api:minimax
# 或
pnpm start:api:doubao
```

开发模式默认读 `.env`；也可指定：

```bash
CAIBAO_ENV_FILE=.env.minimax pnpm dev:api
```

健康检查：

```bash
curl http://127.0.0.1:18787/api/finance/v1/health
```

健康检查分别报告语义模型、ASR/OCR 与 FFmpeg/FFprobe 配置，不返回密钥。授权媒体是创建任务时校验的前置条件，不属于健康检查。服务默认只监听 `127.0.0.1`；Docker Compose 虽在容器内监听所有接口，但宿主端口仍只发布到回环地址。

## 授权推荐媒体

推荐流的唯一媒体事实源是：

```text
media-import/authorized-douyin/download-manifest.json
```

首次使用前显式生成浏览器兼容的 H.264/AAC 派生文件和封面：

```bash
pnpm prepare:showcase
```

命令只写入 `.analysis-work/showcase-media/<batchId>/`，不会覆盖 `public/demo`。源文件、派生文件和
`.analysis-work` 均被 Git 忽略。清单、权利有效期、路径边界、bytes、SHA-256 或 FFprobe 任一校验
失败时均 fail closed，不会回退到旧推荐视频。当前 schema v2 清单的 25 个 videoId 必须与
`server/src/showcase/content-seeds.ts` 的内容种子及体验映射精确同集；缺少任一项时内容生成失败关闭。
生成内容为 `internal_poc` / `mock`，不是财经审核或公开生产批准。

只读接口：

```text
GET  /api/finance/v1/media/catalog
GET  /api/finance/v1/media/:videoId/video
HEAD /api/finance/v1/media/:videoId/video
GET  /api/finance/v1/media/:videoId/poster
HEAD /api/finance/v1/media/:videoId/poster
```

视频支持单段 HTTP Range。未知 ID 返回 404，已知但权利到期返回 410，非法 Range 返回 416；
响应不会包含本机路径。运行时路径可用 `AUTHORIZED_DOUYIN_MANIFEST` 和
`AUTHORIZED_MEDIA_ROOT` 覆盖，但仍受清单和实际文件的双重 allowlist 校验。

## 创建分析任务

```bash
curl -X POST http://127.0.0.1:18787/api/finance/v1/analysis/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "有权测试视频",
    "asset": {
      "assetId": "asset-001",
      "source": "user_upload",
      "localPath": "./media-import/authorized-test.mp4",
      "mimeType": "video/mp4",
      "rightsAttested": true,
      "rightsAttestationId": "internal-consent-001"
    }
  }'
```

返回 `202` 后轮询：

```text
GET /api/finance/v1/analysis/jobs/:jobId
GET /api/finance/v1/analysis/jobs/:jobId/draft
```

草稿固定 `publishStatus=draft`、`approvedTriggers=[]`、`blockers=[HUMAN_REVIEW_REQUIRED]`。下一阶段应建设审核台与发布仓库；在此之前播放器继续使用审核过的静态 fixture。

## 抖音来源

公开主页探测只验证 URL 与匿名可见资料：

```bash
pnpm probe:douyin -- 'https://www.douyin.com/user/...'
```

若返回 `dynamic_page_blocked`，这是正常的合规失败，不会尝试绕过风控。正式的作品元数据同步使用 `DouyinOpenPlatformClient`，仅支持完成 OAuth 且获得 `video.list` 权限的创作者；该接口不提供可供分析的原始媒体文件。

## 测试

```bash
pnpm test:server
pnpm type-check:server
```

默认测试完全离线并使用 fake provider。真实冒烟测试必须由操作者显式开启、使用短小且有权处理的素材，并确认可能产生费用。

当前只解析 `LIVE_PROVIDER_TESTS` 配置，尚未提供自动收费接口测试；不要把单元契约测试当作 MiniMax、方舟、ASR 或 OCR 的真实调用验证。
