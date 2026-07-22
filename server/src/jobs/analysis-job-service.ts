import { randomUUID } from 'node:crypto'
import type { CoverageReport, DraftExperience, MediaAsset } from '../domain/contracts.js'
import { AppError, asAppError } from '../domain/errors.js'
import type { AnalysisPipeline } from '../pipeline/analyze-video.js'

export type AnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface AnalysisJobRecord {
  jobId: string
  status: AnalysisJobStatus
  createdAt: string
  updatedAt: string
  stage: 'queued' | 'analysis' | 'complete'
  error?: { code: string; message: string }
}
export class AnalysisJobService {
  private readonly jobs = new Map<string, AnalysisJobRecord>()
  private readonly drafts = new Map<string, DraftExperience>()
  private readonly coverageReports = new Map<string, CoverageReport>()

  constructor(private readonly pipeline: AnalysisPipeline) {}

  create(input: { asset: MediaAsset; title: string }): AnalysisJobRecord {
    const now = new Date().toISOString()
    const record: AnalysisJobRecord = {
      jobId: randomUUID(),
      status: 'queued',
      stage: 'queued',
      createdAt: now,
      updatedAt: now
    }
    this.jobs.set(record.jobId, record)
    queueMicrotask(() => void this.execute(record.jobId, input))
    return { ...record }
  }

  get(jobId: string): AnalysisJobRecord | null {
    const job = this.jobs.get(jobId)
    return job ? { ...job } : null
  }

  getDraft(jobId: string): DraftExperience | null {
    return this.drafts.get(jobId) ?? null
  }

  getCoverageReport(jobId: string): CoverageReport | null {
    return this.coverageReports.get(jobId) ?? null
  }

  private async execute(jobId: string, input: { asset: MediaAsset; title: string }): Promise<void> {
    const current = this.jobs.get(jobId)
    if (!current) return
    this.jobs.set(jobId, {
      ...current,
      status: 'running',
      stage: 'analysis',
      updatedAt: new Date().toISOString()
    })
    try {
      const { draft, coverageReport } = await this.pipeline.run({ jobId, ...input })
      this.drafts.set(jobId, draft)
      this.coverageReports.set(jobId, coverageReport)
      const running = this.jobs.get(jobId)
      if (!running) return
      this.jobs.set(jobId, {
        ...running,
        status: 'succeeded',
        stage: 'complete',
        updatedAt: new Date().toISOString()
      })
    } catch (error) {
      const safe = asAppError(error)
      const running = this.jobs.get(jobId)
      if (!running) return
      this.jobs.set(jobId, {
        ...running,
        status: 'failed',
        stage: 'complete',
        updatedAt: new Date().toISOString(),
        error: { code: safe.code, message: safe.message }
      })
    }
  }
}

export function requireJob<T>(value: T | null, resource: string): T {
  if (!value)
    throw new AppError('ANALYSIS_JOB_NOT_FOUND', `${resource} was not found`, { status: 404 })
  return value
}
