import type {
  DraftExperience,
  MediaAsset,
  OcrEvidence,
  PreparedFrame,
  PreparedMedia,
  SemanticAnalysis,
  Transcript
} from '../domain/contracts.js'
import {
  mediaAssetSchema,
  ocrEvidenceSchema,
  semanticAnalysisSchema,
  transcriptSchema
} from '../domain/contracts.js'
import { AppError } from '../domain/errors.js'
import { planCueCandidates } from './cue-planner.js'

export interface AnalysisPipelineDependencies {
  media: { prepare(localPath: string, jobId: string): Promise<PreparedMedia> }
  asr: {
    transcribePreparedAudio(input: {
      audio: PreparedMedia['audio']
      jobId: string
    }): Promise<Transcript>
  }
  ocr: { recognizeFrames(frames: PreparedFrame[]): Promise<OcrEvidence[]> }
  semantics: {
    analyze(input: {
      transcript: Transcript
      ocr: OcrEvidence[]
      frames: PreparedFrame[]
      durationMs: number
    }): Promise<SemanticAnalysis>
  }
}
function assertEvidenceReferences(
  semantics: SemanticAnalysis,
  knownEvidenceIds: Set<string>
): void {
  const semanticItems = [
    ...semantics.concepts,
    ...semantics.claims,
    ...semantics.causalEdges,
    ...semantics.conditions
  ]
  const invalid = semanticItems.filter((item) =>
    item.evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))
  )
  if (invalid.length) {
    throw new AppError('SEMANTIC_EVIDENCE_INVALID', 'Semantic output cites unknown evidence', {
      status: 422,
      details: { invalidItemCount: invalid.length }
    })
  }
}

export class AnalysisPipeline {
  constructor(private readonly dependencies: AnalysisPipelineDependencies) {}

  async run(input: { jobId: string; asset: MediaAsset; title: string }): Promise<DraftExperience> {
    if (!input.asset.rightsAttested) {
      throw new AppError(
        'MEDIA_RIGHTS_NOT_ATTESTED',
        'Media rights must be attested before analysis',
        { status: 403 }
      )
    }
    const asset = mediaAssetSchema.parse(input.asset)
    const prepared = await this.dependencies.media.prepare(asset.localPath, input.jobId)
    const transcript = transcriptSchema.parse(
      await this.dependencies.asr.transcribePreparedAudio({
        audio: prepared.audio,
        jobId: input.jobId
      })
    )
    const outOfBoundsSegments = transcript.segments.filter(
      (segment) => segment.endMs > prepared.durationMs
    )
    if (outOfBoundsSegments.length) {
      throw new AppError(
        'ASR_TIMELINE_OUTSIDE_MEDIA',
        'ASR segments must stay within the media duration',
        {
          status: 422,
          details: {
            mediaDurationMs: prepared.durationMs,
            segmentCount: outOfBoundsSegments.length
          }
        }
      )
    }
    const ocr = (await this.dependencies.ocr.recognizeFrames(prepared.frames)).map((item) =>
      ocrEvidenceSchema.parse(item)
    )
    const semantics = semanticAnalysisSchema.parse(
      await this.dependencies.semantics.analyze({
        transcript,
        ocr,
        frames: prepared.frames,
        durationMs: prepared.durationMs
      })
    )
    const knownEvidenceIds = new Set([
      ...transcript.segments.map((item) => item.evidenceId),
      ...ocr.map((item) => item.evidenceId)
    ])
    assertEvidenceReferences(semantics, knownEvidenceIds)
    const plan = planCueCandidates(semantics.triggerCandidates, {
      maxAutomaticCues: 6,
      minGapMs: 45_000,
      durationMs: prepared.durationMs,
      knownEvidenceIds
    })

    return {
      experienceId: `draft-${input.jobId}`,
      title: input.title,
      contentVersion: `draft.${prepared.fingerprint.replace(/^sha256:/, '').slice(0, 12)}`,
      mediaFingerprint: prepared.fingerprint,
      publishStatus: 'draft',
      blockers: ['HUMAN_REVIEW_REQUIRED'],
      evidence: [...transcript.segments, ...ocr],
      concepts: semantics.concepts,
      claims: semantics.claims,
      causalEdges: semantics.causalEdges,
      conditions: semantics.conditions,
      triggerCandidates: plan.accepted,
      rejectedTriggerCandidates: plan.rejected,
      approvedTriggers: []
    }
  }
}
