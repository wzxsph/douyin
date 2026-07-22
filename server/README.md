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
