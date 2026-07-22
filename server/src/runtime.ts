import { config as loadDotEnv } from 'dotenv'
import { createApp } from './app.js'
import { analysisInputReadiness, loadRuntimeConfig, providerReadiness } from './config/env.js'
import { AnalysisJobService } from './jobs/analysis-job-service.js'
import { AuthorizedMediaService, FfprobeMediaProbe } from './media/authorized-media.js'
import { FfmpegMediaPreprocessor } from './media/ffmpeg.js'
import { AnalysisPipeline } from './pipeline/analyze-video.js'
import { PayloadAuthor } from './pipeline/payload-author.js'
import { SemanticGraphAnalyzer } from './providers/semantic-graph-analyzer.js'
import { OpenAICompatibleStructuredClient } from './providers/openai-compatible.js'
import { VolcengineFlashAsrClient } from './providers/volcengine-asr.js'
import { DisabledOcrClient, VolcengineOcrClient } from './providers/volcengine-ocr.js'
import { DouyinPublicProfileProbe } from './sources/douyin-public-profile.js'

export function buildRuntime() {
  loadDotEnv({ path: process.env.CAIBAO_ENV_FILE || '.env', quiet: true })
  const config = loadRuntimeConfig()
  const media = new FfmpegMediaPreprocessor({
    mediaImportRoot: config.mediaImportRoot,
    workRoot: config.analysisWorkRoot,
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath
  })
  const selected = config.analysisProvider === 'minimax' ? config.minimax : config.ark
  const configuredMultimodalModel =
    config.analysisProvider === 'minimax'
      ? config.minimax.multimodalModel
      : config.ark.multimodalModel
  const structuredClient = new OpenAICompatibleStructuredClient({
    apiKey: selected.apiKey,
    baseUrl: selected.baseUrl,
    model:
      configuredMultimodalModel ||
      (config.analysisProvider === 'minimax' ? config.minimax.textModel : config.ark.model),
    timeoutMs: selected.timeoutMs,
    maxRetries: selected.maxRetries
  })
  const semantics = new SemanticGraphAnalyzer(structuredClient, configuredMultimodalModel ? 8 : 0)
  const payloadAuthor = new PayloadAuthor(structuredClient)
  const asr = new VolcengineFlashAsrClient({
    endpoint: config.asr.endpoint,
    resourceId: config.asr.resourceId,
    apiKey: config.asr.apiKey,
    appId: config.asr.appId,
    accessToken: config.asr.accessToken,
    timeoutMs: config.asr.timeoutMs,
    maxAudioMb: config.asr.maxAudioMb,
    maxBase64AudioMb: config.asr.maxBase64AudioMb
  })
  const ocr = config.ocr.enabled
    ? new VolcengineOcrClient({
        endpoint: config.ocr.endpoint,
        action: config.ocr.action,
        version: config.ocr.version,
        region: config.ocr.region,
        service: config.ocr.service,
        accessKeyId: config.ocr.accessKeyId,
        secretAccessKey: config.ocr.secretAccessKey,
        timeoutMs: config.ocr.timeoutMs,
        filterThreshold: config.ocr.filterThreshold
      })
    : new DisabledOcrClient()
  const pipeline = new AnalysisPipeline({ media, asr, ocr, semantics, payloadAuthor })
  const jobs = new AnalysisJobService(pipeline)
  const authorizedMedia = new AuthorizedMediaService({
    manifestPath: config.authorizedDouyinManifest,
    preparedRoot: config.authorizedMediaRoot,
    probe: new FfprobeMediaProbe(config.ffprobePath)
  })
  return {
    config,
    app: createApp({
      providerReadiness: () => providerReadiness(config),
      analysisInputReadiness: () => analysisInputReadiness(config),
      mediaReadiness: () => media.readiness(),
      profileProbe: new DouyinPublicProfileProbe(),
      jobs,
      authorizedMedia
    })
  }
}
