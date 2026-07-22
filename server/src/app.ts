import { createReadStream } from 'node:fs'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import type { AnalysisInputReadiness, ProviderReadiness } from './config/env.js'
import { mediaAssetSchema } from './domain/contracts.js'
import { AppError, publicError } from './domain/errors.js'
import { requireJob, type AnalysisJobService } from './jobs/analysis-job-service.js'
import type { AuthorizedMediaService, ResolvedAuthorizedAsset } from './media/authorized-media.js'
import type { MediaToolReadiness } from './media/ffmpeg.js'
import type {
  DouyinProfileProbeResult,
  DouyinPublicProfileProbe
} from './sources/douyin-public-profile.js'

interface AppDependencies {
  providerReadiness(): ProviderReadiness
  analysisInputReadiness(): AnalysisInputReadiness
  mediaReadiness(): Promise<MediaToolReadiness>
  profileProbe:
    | Pick<DouyinPublicProfileProbe, 'probe'>
    | { probe(url: string): Promise<Partial<DouyinProfileProbeResult>> }
  jobs?: AnalysisJobService
  authorizedMedia?: Pick<AuthorizedMediaService, 'getCatalog' | 'resolveAsset'>
}

interface ByteRange {
  start: number
  end: number
}

function parseSingleByteRange(value: string, size: number): ByteRange | null {
  if (!/^bytes=/.test(value) || value.includes(',')) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return null
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function streamAsset(
  request: Request,
  response: Response,
  next: NextFunction,
  asset: ResolvedAuthorizedAsset
): void {
  const rangeHeader = request.header('range')
  let range: ByteRange | undefined
  if (rangeHeader) {
    range = parseSingleByteRange(rangeHeader, asset.bytes) ?? undefined
    if (!range) {
      response.status(416).set('Content-Range', `bytes */${asset.bytes}`).end()
      return
    }
  }

  const start = range?.start ?? 0
  const end = range?.end ?? asset.bytes - 1
  response.status(range ? 206 : 200)
  response.set({
    'Accept-Ranges': 'bytes',
    // Rights may expire between two requests; never let a browser reuse bytes past a 410 boundary.
    'Cache-Control': 'private, no-store',
    'Content-Length': String(end - start + 1),
    'Content-Type': asset.mimeType,
    'X-Content-Type-Options': 'nosniff',
    ETag: `"sha256-${asset.sha256}"`,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes}` } : {})
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(asset.filePath, { start, end })
  stream.on('error', (error) => {
    if (!response.headersSent) next(error)
    else response.destroy(error)
  })
  stream.pipe(response)
}

const analysisRequestSchema = z.object({
  title: z.string().min(1).max(200).default('Untitled video'),
  asset: mediaAssetSchema.optional(),
  sourceVideoRef: z
    .object({
      shareUrl: z.string().url(),
      mediaAvailability: z.enum(['metadata_only', 'official_iframe', 'user_supplied']).optional()
    })
    .optional()
})

export function createApp(dependencies: AppDependencies) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/finance/v1/health', async (_request, response, next) => {
    try {
      response.json({
        status: 'ok',
        providers: dependencies.providerReadiness(),
        analysisInputs: dependencies.analysisInputReadiness(),
        mediaTools: await dependencies.mediaReadiness(),
        guarantees: {
          secretsExposedToClient: false,
          modelCanPublish: false,
          requiresHumanReview: true
        }
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/finance/v1/media/catalog', async (_request, response, next) => {
    try {
      if (!dependencies.authorizedMedia) {
        throw new AppError(
          'AUTHORIZED_MEDIA_SERVICE_UNAVAILABLE',
          'Authorized media service is unavailable',
          { status: 503 }
        )
      }
      response.set('Cache-Control', 'private, no-store')
      response.json(await dependencies.authorizedMedia.getCatalog())
    } catch (error) {
      next(error)
    }
  })

  const serveAuthorizedAsset =
    (kind: 'video' | 'poster') =>
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        if (!dependencies.authorizedMedia) {
          throw new AppError(
            'AUTHORIZED_MEDIA_SERVICE_UNAVAILABLE',
            'Authorized media service is unavailable',
            { status: 503 }
          )
        }
        const videoId = z.string().parse(request.params.videoId)
        const asset = await dependencies.authorizedMedia.resolveAsset(videoId, kind)
        streamAsset(request, response, next, asset)
      } catch (error) {
        next(error)
      }
    }

  app
    .route('/api/finance/v1/media/:videoId/video')
    .get(serveAuthorizedAsset('video'))
    .head(serveAuthorizedAsset('video'))
  app
    .route('/api/finance/v1/media/:videoId/poster')
    .get(serveAuthorizedAsset('poster'))
    .head(serveAuthorizedAsset('poster'))

  app.post('/api/finance/v1/sources/douyin/profile/probe', async (request, response, next) => {
    try {
      const { url } = z.object({ url: z.string().url() }).parse(request.body)
      response.json(await dependencies.profileProbe.probe(url))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/finance/v1/analysis/jobs', async (request, response, next) => {
    try {
      const input = analysisRequestSchema.parse(request.body)
      if (!input.asset) {
        throw new AppError(
          'MEDIA_ASSET_REQUIRED',
          'A rights-attested uploaded or licensed media asset is required',
          { status: 409 }
        )
      }
      if (!input.asset.rightsAttested) {
        throw new AppError('MEDIA_RIGHTS_NOT_ATTESTED', 'Media rights must be attested', {
          status: 403
        })
      }
      const provider = dependencies.providerReadiness()
      if (!provider.ready) {
        throw new AppError('PROVIDER_CONFIG_INVALID', 'Selected provider is not configured', {
          status: 503,
          details: { provider: provider.provider, missing: provider.missing }
        })
      }
      const mediaTools = await dependencies.mediaReadiness()
      if (!mediaTools.ready) {
        throw new AppError('MEDIA_TOOL_UNAVAILABLE', 'Media tools are not available', {
          status: 503,
          details: { missing: mediaTools.missing }
        })
      }
      const analysisInputs = dependencies.analysisInputReadiness()
      if (!analysisInputs.ready) {
        throw new AppError('ANALYSIS_INPUT_PROVIDER_CONFIG_INVALID', 'ASR/OCR is not configured', {
          status: 503,
          details: { asr: analysisInputs.asr, ocr: analysisInputs.ocr }
        })
      }
      if (!dependencies.jobs) {
        throw new AppError('ANALYSIS_SERVICE_UNAVAILABLE', 'Analysis job service is unavailable', {
          status: 503
        })
      }
      response
        .status(202)
        .json(dependencies.jobs.create({ asset: input.asset, title: input.title }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/finance/v1/analysis/jobs/:jobId', (request, response, next) => {
    try {
      if (!dependencies.jobs) {
        throw new AppError('ANALYSIS_SERVICE_UNAVAILABLE', 'Analysis job service is unavailable', {
          status: 503
        })
      }
      response.json(requireJob(dependencies.jobs.get(request.params.jobId), 'Analysis job'))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/finance/v1/analysis/jobs/:jobId/draft', (request, response, next) => {
    try {
      if (!dependencies.jobs) {
        throw new AppError('ANALYSIS_SERVICE_UNAVAILABLE', 'Analysis job service is unavailable', {
          status: 503
        })
      }
      const job = requireJob(dependencies.jobs.get(request.params.jobId), 'Analysis job')
      if (job.status !== 'succeeded') {
        throw new AppError('ANALYSIS_DRAFT_NOT_READY', 'Analysis draft is not ready', {
          status: 409,
          details: { status: job.status }
        })
      }
      response.json(requireJob(dependencies.jobs.getDraft(request.params.jobId), 'Analysis draft'))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/finance/v1/analysis/jobs/:jobId/coverage', (request, response, next) => {
    try {
      if (!dependencies.jobs) {
        throw new AppError('ANALYSIS_SERVICE_UNAVAILABLE', 'Analysis job service is unavailable', {
          status: 503
        })
      }
      const job = requireJob(dependencies.jobs.get(request.params.jobId), 'Analysis job')
      if (job.status !== 'succeeded') {
        throw new AppError('ANALYSIS_COVERAGE_NOT_READY', 'Analysis coverage report is not ready', {
          status: 409,
          details: { status: job.status }
        })
      }
      response.json(
        requireJob(dependencies.jobs.getCoverageReport(request.params.jobId), 'Coverage report')
      )
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const safe = publicError(error)
    response.status(safe.status).json(safe.body)
  })
  return app
}
