import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import type { AnalysisInputReadiness, ProviderReadiness } from './config/env.js'
import { mediaAssetSchema } from './domain/contracts.js'
import { AppError, publicError } from './domain/errors.js'
import { requireJob, type AnalysisJobService } from './jobs/analysis-job-service.js'
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

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const safe = publicError(error)
    response.status(safe.status).json(safe.body)
  })
  return app
}
