import path from 'node:path'
import { z } from 'zod'
import { AppError } from '../domain/errors.js'

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(18_787),
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  ANALYSIS_PROVIDER: z.enum(['minimax', 'doubao']).default('minimax'),
  MEDIA_IMPORT_ROOT: z.string().default('./media-import'),
  ANALYSIS_WORK_ROOT: z.string().default('./.analysis-work'),
  AUTHORIZED_DOUYIN_MANIFEST: z
    .string()
    .default('./media-import/authorized-douyin/download-manifest.json'),
  AUTHORIZED_MEDIA_ROOT: z.string().default('./.analysis-work/showcase-media'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),

  MINIMAX_API_KEY: z.string().default(''),
  MINIMAX_BASE_URL: z.string().url().default('https://api.minimaxi.com/v1'),
  MINIMAX_TEXT_MODEL: z.string().default('MiniMax-M2.7'),
  MINIMAX_MULTIMODAL_MODEL: z.string().default(''),
  MINIMAX_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MINIMAX_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  ARK_API_KEY: z.string().default(''),
  ARK_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/v3'),
  ARK_MODEL: z.string().default(''),
  ARK_MULTIMODAL_MODEL: z.string().default(''),
  ARK_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ARK_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  VOLC_ASR_ENABLED: z.string().default('true'),
  VOLC_ASR_ENDPOINT: z
    .string()
    .url()
    .default('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'),
  VOLC_ASR_RESOURCE_ID: z.string().default('volc.bigasr.auc_turbo'),
  VOLC_ASR_API_KEY: z.string().default(''),
  VOLC_ASR_APP_ID: z.string().default(''),
  VOLC_ASR_ACCESS_TOKEN: z.string().default(''),
  VOLC_ASR_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  VOLC_ASR_MAX_AUDIO_MB: z.coerce.number().positive().default(100),
  VOLC_ASR_MAX_BASE64_AUDIO_MB: z.coerce.number().positive().default(20),

  VOLC_OCR_ENABLED: z.string().default('false'),
  VOLC_OCR_ENDPOINT: z.string().url().default('https://visual.volcengineapi.com'),
  VOLC_OCR_ACTION: z.string().default('OCRNormal'),
  VOLC_OCR_VERSION: z.string().default('2020-08-26'),
  VOLC_OCR_REGION: z.string().default('cn-north-1'),
  VOLC_OCR_SERVICE: z.string().default('cv'),
  VOLC_ACCESS_KEY_ID: z.string().default(''),
  VOLC_SECRET_ACCESS_KEY: z.string().default(''),
  VOLC_OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  VOLC_OCR_FILTER_THRESHOLD: z.coerce.number().min(0).max(100).default(80),

  DOUYIN_OPEN_CLIENT_KEY: z.string().default(''),
  DOUYIN_OPEN_CLIENT_SECRET: z.string().default(''),
  DOUYIN_OPEN_BASE_URL: z.string().url().default('https://open.douyin.com'),
  LIVE_PROVIDER_TESTS: z.string().default('false')
})

function envBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production'
  apiPort: number
  apiHost: '127.0.0.1' | '0.0.0.0'
  analysisProvider: 'minimax' | 'doubao'
  mediaImportRoot: string
  analysisWorkRoot: string
  authorizedDouyinManifest: string
  authorizedMediaRoot: string
  ffmpegPath: string
  ffprobePath: string
  minimax: {
    apiKey: string
    baseUrl: string
    textModel: string
    multimodalModel: string
    timeoutMs: number
    maxRetries: number
  }
  ark: {
    apiKey: string
    baseUrl: string
    model: string
    multimodalModel: string
    timeoutMs: number
    maxRetries: number
  }
  asr: {
    enabled: boolean
    endpoint: string
    resourceId: string
    apiKey: string
    appId: string
    accessToken: string
    timeoutMs: number
    maxAudioMb: number
    maxBase64AudioMb: number
  }
  ocr: {
    enabled: boolean
    endpoint: string
    action: string
    version: string
    region: string
    service: string
    accessKeyId: string
    secretAccessKey: string
    timeoutMs: number
    filterThreshold: number
  }
  douyinOpen: { clientKey: string; clientSecret: string; baseUrl: string }
  liveProviderTests: boolean
}

export function loadRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): RuntimeConfig {
  const raw = rawSchema.parse(source)
  return {
    nodeEnv: raw.NODE_ENV,
    apiPort: raw.API_PORT,
    apiHost: raw.API_HOST,
    analysisProvider: raw.ANALYSIS_PROVIDER,
    mediaImportRoot: path.resolve(raw.MEDIA_IMPORT_ROOT),
    analysisWorkRoot: path.resolve(raw.ANALYSIS_WORK_ROOT),
    authorizedDouyinManifest: path.resolve(raw.AUTHORIZED_DOUYIN_MANIFEST),
    authorizedMediaRoot: path.resolve(raw.AUTHORIZED_MEDIA_ROOT),
    ffmpegPath: raw.FFMPEG_PATH,
    ffprobePath: raw.FFPROBE_PATH,
    minimax: {
      apiKey: raw.MINIMAX_API_KEY,
      baseUrl: raw.MINIMAX_BASE_URL,
      textModel: raw.MINIMAX_TEXT_MODEL,
      multimodalModel: raw.MINIMAX_MULTIMODAL_MODEL,
      timeoutMs: raw.MINIMAX_TIMEOUT_MS,
      maxRetries: raw.MINIMAX_MAX_RETRIES
    },
    ark: {
      apiKey: raw.ARK_API_KEY,
      baseUrl: raw.ARK_BASE_URL,
      model: raw.ARK_MODEL,
      multimodalModel: raw.ARK_MULTIMODAL_MODEL,
      timeoutMs: raw.ARK_TIMEOUT_MS,
      maxRetries: raw.ARK_MAX_RETRIES
    },
    asr: {
      enabled: envBoolean(raw.VOLC_ASR_ENABLED),
      endpoint: raw.VOLC_ASR_ENDPOINT,
      resourceId: raw.VOLC_ASR_RESOURCE_ID,
      apiKey: raw.VOLC_ASR_API_KEY,
      appId: raw.VOLC_ASR_APP_ID,
      accessToken: raw.VOLC_ASR_ACCESS_TOKEN,
      timeoutMs: raw.VOLC_ASR_TIMEOUT_MS,
      maxAudioMb: raw.VOLC_ASR_MAX_AUDIO_MB,
      maxBase64AudioMb: raw.VOLC_ASR_MAX_BASE64_AUDIO_MB
    },
    ocr: {
      enabled: envBoolean(raw.VOLC_OCR_ENABLED),
      endpoint: raw.VOLC_OCR_ENDPOINT,
      action: raw.VOLC_OCR_ACTION,
      version: raw.VOLC_OCR_VERSION,
      region: raw.VOLC_OCR_REGION,
      service: raw.VOLC_OCR_SERVICE,
      accessKeyId: raw.VOLC_ACCESS_KEY_ID,
      secretAccessKey: raw.VOLC_SECRET_ACCESS_KEY,
      timeoutMs: raw.VOLC_OCR_TIMEOUT_MS,
      filterThreshold: raw.VOLC_OCR_FILTER_THRESHOLD
    },
    douyinOpen: {
      clientKey: raw.DOUYIN_OPEN_CLIENT_KEY,
      clientSecret: raw.DOUYIN_OPEN_CLIENT_SECRET,
      baseUrl: raw.DOUYIN_OPEN_BASE_URL
    },
    liveProviderTests: envBoolean(raw.LIVE_PROVIDER_TESTS)
  }
}

export interface ProviderReadiness {
  provider: RuntimeConfig['analysisProvider']
  ready: boolean
  missing: string[]
}

export interface AnalysisInputReadiness {
  ready: boolean
  asr: { enabled: boolean; ready: boolean; missing: string[] }
  ocr: { enabled: boolean; ready: boolean; missing: string[] }
}

export function analysisInputReadiness(config: RuntimeConfig): AnalysisInputReadiness {
  const asrMissing: string[] = []
  if (!config.asr.enabled) asrMissing.push('VOLC_ASR_ENABLED=true')
  const hasNewAsrCredential = Boolean(config.asr.apiKey)
  const hasLegacyAsrCredential = Boolean(config.asr.appId && config.asr.accessToken)
  if (!hasNewAsrCredential && !hasLegacyAsrCredential) {
    asrMissing.push('VOLC_ASR_API_KEY or VOLC_ASR_APP_ID+VOLC_ASR_ACCESS_TOKEN')
  }
  const ocrMissing: string[] = []
  if (config.ocr.enabled) {
    if (!config.ocr.accessKeyId) ocrMissing.push('VOLC_ACCESS_KEY_ID')
    if (!config.ocr.secretAccessKey) ocrMissing.push('VOLC_SECRET_ACCESS_KEY')
  }
  const asr = {
    enabled: config.asr.enabled,
    ready: asrMissing.length === 0,
    missing: asrMissing
  }
  const ocr = {
    enabled: config.ocr.enabled,
    ready: ocrMissing.length === 0,
    missing: ocrMissing
  }
  return { ready: asr.ready && ocr.ready, asr, ocr }
}

export function providerReadiness(config: RuntimeConfig): ProviderReadiness {
  const missing: string[] = []
  if (config.analysisProvider === 'minimax') {
    if (!config.minimax.apiKey) missing.push('MINIMAX_API_KEY')
  } else {
    if (!config.ark.apiKey) missing.push('ARK_API_KEY')
    if (!config.ark.model) missing.push('ARK_MODEL')
  }
  return { provider: config.analysisProvider, ready: missing.length === 0, missing }
}

export function assertAnalysisProviderReady(config: RuntimeConfig): void {
  const readiness = providerReadiness(config)
  if (!readiness.ready) {
    throw new AppError('PROVIDER_CONFIG_INVALID', 'Selected analysis provider is not configured', {
      status: 503,
      details: { provider: readiness.provider, missing: readiness.missing }
    })
  }
}
