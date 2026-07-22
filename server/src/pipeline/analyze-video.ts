import type {
  CausalEdge,
  Claim,
  Concept,
  Condition,
  CoverageReport,
  CueRejectionReason,
  DirectionResolution,
  DraftExperience,
  MediaAsset,
  OcrEvidence,
  PreparedFrame,
  PreparedMedia,
  SemanticEvent,
  SemanticGraph,
  TriggerCandidate,
  Transcript
} from '../domain/contracts.js'
import { mediaAssetSchema, ocrEvidenceSchema, transcriptSchema } from '../domain/contracts.js'
import { AppError } from '../domain/errors.js'
import type { AuthoredPayload } from '../domain/payload-contracts.js'
import { collectPayloadText, isRenderableKind } from '../domain/payload-contracts.js'
import type {
  CritiqueResult,
  FailedItem,
  SemanticWindow
} from '../providers/semantic-graph-analyzer.js'
import { buildCoverageReport } from './coverage-report.js'
import { MIN_CUE_GAP_MS, planCueCandidates } from './cue-planner.js'
import { scoreEvents, WEIGHT_TABLE_VERSION } from './cue-scorer.js'
import { RULE_ENGINE_VERSION, resolveDirection } from './direction-rules.js'
import { PROMPT_VERSION } from './payload-author.js'
import { buildSemanticTimeline } from './semantic-timeline.js'

/** Injected LLM stages; everything deterministic is imported directly. */
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
    extract(input: {
      transcript: Transcript
      ocr: OcrEvidence[]
      frames: PreparedFrame[]
      durationMs: number
      windows: SemanticWindow[]
    }): Promise<SemanticGraph>
    critique?(input: {
      graph: SemanticGraph
      transcript: Transcript
      ocr: OcrEvidence[]
    }): Promise<CritiqueResult>
    repair(input: {
      failedItems: FailedItem[]
      graph: SemanticGraph
      transcript: Transcript
      ocr: OcrEvidence[]
    }): Promise<SemanticGraph>
  }
  payloadAuthor: {
    author(input: {
      candidate: TriggerCandidate
      direction?: DirectionResolution
      evidenceContext: string
    }): Promise<{ payload: AuthoredPayload['payload'] } | { rejected: string; detail: string }>
  }
}

export interface AnalysisPipelineResult {
  draft: DraftExperience
  coverageReport: CoverageReport
}

const MAX_REPAIR_ITERS = 2

const unsafeFinancialLanguage =
  /(买入|卖出|加仓|减仓|仓位|目标价|稳赚|必涨|必跌|推荐.{0,6}(股票|基金|黄金|资产)|买什么)/i

interface GraphItemRef {
  itemId: string
  kind: 'concept' | 'claim' | 'causalEdge' | 'condition' | 'semanticEvent'
  evidenceIds: string[]
}

// ANALYZE-CHUNK-A

/** Flatten every evidence-bearing graph item to a uniform ref for validation. */
function graphItemRefs(graph: SemanticGraph): GraphItemRef[] {
  return [
    ...graph.concepts.map((c: Concept) => ({
      itemId: c.conceptId,
      kind: 'concept' as const,
      evidenceIds: c.evidenceIds
    })),
    ...graph.claims.map((c: Claim) => ({
      itemId: c.claimId,
      kind: 'claim' as const,
      evidenceIds: c.evidenceIds
    })),
    ...graph.causalEdges.map((e: CausalEdge) => ({
      itemId: e.edgeId,
      kind: 'causalEdge' as const,
      evidenceIds: e.evidenceIds
    })),
    ...graph.conditions.map((c: Condition) => ({
      itemId: c.conditionId,
      kind: 'condition' as const,
      evidenceIds: c.evidenceIds
    })),
    ...graph.semanticEvents.map((e: SemanticEvent) => ({
      itemId: e.eventId,
      kind: 'semanticEvent' as const,
      evidenceIds: e.evidenceIds
    }))
  ]
}

/**
 * Stage 3 — deterministic validation. Every item's evidenceIds must exist in the
 * known evidence set; a semantic event's timeMs must stay within the media
 * duration. Returns the list of failed items with a concrete error string used to
 * drive the targeted repair loop.
 */
function validateGraph(
  graph: SemanticGraph,
  knownEvidenceIds: Set<string>,
  durationMs: number
): FailedItem[] {
  const failed: FailedItem[] = []
  for (const ref of graphItemRefs(graph)) {
    const unknown = ref.evidenceIds.filter((id) => !knownEvidenceIds.has(id))
    if (unknown.length) {
      failed.push({
        itemId: ref.itemId,
        kind: ref.kind,
        error: `cites unknown evidenceIds: ${unknown.join(', ')}`
      })
    }
  }
  for (const event of graph.semanticEvents) {
    if (event.timeMs > durationMs) {
      failed.push({
        itemId: event.eventId,
        kind: 'semanticEvent',
        error: `timeMs ${event.timeMs} exceeds media duration ${durationMs}`
      })
    }
  }
  return failed
}

/**
 * Merge a repaired subset back into the graph: any returned item replaces the
 * one with the same id; new items are appended. Keeps the graph deterministic.
 */
function mergeGraph(base: SemanticGraph, patch: SemanticGraph): SemanticGraph {
  const replace = <T>(baseArr: T[], patchArr: T[], idOf: (item: T) => string): T[] => {
    if (!patchArr.length) return baseArr
    const byId = new Map(baseArr.map((item) => [idOf(item), item]))
    for (const item of patchArr) byId.set(idOf(item), item)
    return [...byId.values()]
  }
  return {
    concepts: replace(base.concepts, patch.concepts, (c) => c.conceptId),
    claims: replace(base.claims, patch.claims, (c) => c.claimId),
    causalEdges: replace(base.causalEdges, patch.causalEdges, (e) => e.edgeId),
    conditions: replace(base.conditions, patch.conditions, (c) => c.conditionId),
    semanticEvents: replace(base.semanticEvents, patch.semanticEvents, (e) => e.eventId)
  }
}

/** Drop every graph item still failing after the repair budget is exhausted. */
function pruneFailed(graph: SemanticGraph, failed: FailedItem[]): SemanticGraph {
  const failedIds = new Set(failed.map((item) => item.itemId))
  return {
    concepts: graph.concepts.filter((c) => !failedIds.has(c.conceptId)),
    claims: graph.claims.filter((c) => !failedIds.has(c.claimId)),
    causalEdges: graph.causalEdges.filter((e) => !failedIds.has(e.edgeId)),
    conditions: graph.conditions.filter((c) => !failedIds.has(c.conditionId)),
    semanticEvents: graph.semanticEvents.filter((e) => !failedIds.has(e.eventId))
  }
}

// ANALYZE-CHUNK-B

export class AnalysisPipeline {
  constructor(private readonly dependencies: AnalysisPipelineDependencies) {}

  async run(input: {
    jobId: string
    asset: MediaAsset
    title: string
  }): Promise<AnalysisPipelineResult> {
    if (!input.asset.rightsAttested) {
      throw new AppError(
        'MEDIA_RIGHTS_NOT_ATTESTED',
        'Media rights must be attested before analysis',
        { status: 403 }
      )
    }
    const asset = mediaAssetSchema.parse(input.asset)

    // Stage 0 — media preparation.
    const prepared = await this.dependencies.media.prepare(asset.localPath, input.jobId)

    // Stage 1 — ASR + OCR + deterministic timeline scaffold.
    const transcript = transcriptSchema.parse(
      await this.dependencies.asr.transcribePreparedAudio({
        audio: prepared.audio,
        jobId: input.jobId
      })
    )
    const outOfBounds = transcript.segments.filter((s) => s.endMs > prepared.durationMs)
    if (outOfBounds.length) {
      throw new AppError(
        'ASR_TIMELINE_OUTSIDE_MEDIA',
        'ASR segments must stay within the media duration',
        {
          status: 422,
          details: { mediaDurationMs: prepared.durationMs, segmentCount: outOfBounds.length }
        }
      )
    }
    const ocr = (await this.dependencies.ocr.recognizeFrames(prepared.frames)).map((item) =>
      ocrEvidenceSchema.parse(item)
    )
    const timeline = buildSemanticTimeline({
      transcript,
      ocr,
      durationMs: prepared.durationMs
    })
    const knownEvidenceIds = new Set([
      ...transcript.segments.map((s) => s.evidenceId),
      ...ocr.map((o) => o.evidenceId)
    ])
    const windows: SemanticWindow[] = timeline.windows.map(({ windowId, startMs, endMs }) => ({
      windowId,
      startMs,
      endMs
    }))

    // Stage 2 — semantic extraction. Real models occasionally emit output that
    // fails the strict graph schema; re-ask a bounded number of times before the
    // job hard-fails (matches the stage table: 结构非法→修复环；耗尽→job fail).
    let graph = await this.extractWithRetry({
      transcript,
      ocr,
      frames: prepared.frames,
      durationMs: prepared.durationMs,
      windows
    })

    // Stage 3 — deterministic validation.
    let failed = validateGraph(graph, knownEvidenceIds, prepared.durationMs)

    // Stage 4 — optional semantic critique folds blocking verdicts into `failed`.
    if (this.dependencies.semantics.critique) {
      try {
        const critique = await this.dependencies.semantics.critique({ graph, transcript, ocr })
        failed = mergeCritique(failed, critique)
      } catch {
        // Critique is optional; a failure here must not block the pipeline.
      }
    }

    // Stage 5 — bounded targeted repair loop.
    for (let attempt = 0; attempt < MAX_REPAIR_ITERS && failed.length; attempt += 1) {
      let patch: SemanticGraph
      try {
        patch = await this.dependencies.semantics.repair({
          failedItems: failed,
          graph,
          transcript,
          ocr
        })
      } catch {
        break
      }
      graph = mergeGraph(graph, patch)
      failed = validateGraph(graph, knownEvidenceIds, prepared.durationMs)
    }
    const repairExhausted = [...failed]
    if (failed.length) graph = pruneFailed(graph, failed)

    // Stage 6 — deterministic scorer → planner.
    const scored = scoreEvents(graph.semanticEvents, timeline)
    const plan = planCueCandidates(scored.candidates, {
      minGapMs: MIN_CUE_GAP_MS,
      durationMs: prepared.durationMs,
      knownEvidenceIds
    })

    // Stage 7 — deterministic direction rule engine (rules own the direction).
    const directionResolutions: DirectionResolution[] = plan.accepted.map((candidate) =>
      resolveDirection(candidate, graph)
    )
    const directionByCandidate = new Map(
      directionResolutions.map((resolution) => [resolution.candidateId, resolution])
    )

    // Stage 8 — payload authoring for renderable kinds only.
    const authoredCandidates: TriggerCandidate[] = []
    const rejected: Array<{ candidateId: string; kind: string; reason: CueRejectionReason }> = [
      ...plan.rejected.map((item) => {
        const kind =
          scored.candidates.find((c) => c.candidateId === item.candidateId)?.kind ?? 'unknown'
        return { candidateId: item.candidateId, kind, reason: item.reason }
      }),
      ...repairExhausted.map((item) => ({
        candidateId: item.itemId,
        kind: item.kind,
        reason: 'REPAIR_EXHAUSTED' as CueRejectionReason
      }))
    ]

    for (const candidate of plan.accepted) {
      const direction = directionByCandidate.get(candidate.candidateId)
      if (!isRenderableKind(candidate.kind)) {
        // Non-renderable kinds stay candidate-only (no authored payload).
        authoredCandidates.push({
          ...candidate,
          direction: direction?.direction,
          activatedPaths: direction?.activatedPaths
        })
        continue
      }
      const evidenceContext = buildEvidenceContext(candidate, transcript, ocr)
      const result = await this.dependencies.payloadAuthor.author({
        candidate,
        direction,
        evidenceContext
      })
      if ('rejected' in result) {
        rejected.push({
          candidateId: candidate.candidateId,
          kind: candidate.kind,
          reason:
            result.rejected === 'NON_RENDERABLE_KIND'
              ? 'NON_RENDERABLE_KIND'
              : 'PAYLOAD_UNAUTHORABLE'
        })
        continue
      }
      // Stage 9 pre-check — safety regex over authored payload text.
      const authoredText = collectPayloadText({
        kind: candidate.kind,
        payload: result.payload
      } as AuthoredPayload)
      if (unsafeFinancialLanguage.test(authoredText)) {
        rejected.push({
          candidateId: candidate.candidateId,
          kind: candidate.kind,
          reason: 'UNSAFE_FINANCIAL_LANGUAGE'
        })
        continue
      }
      authoredCandidates.push({
        ...candidate,
        direction: direction?.direction,
        activatedPaths: direction?.activatedPaths,
        payload: result.payload
      })
    }

    // Stage 9 — assemble draft + coverage report.
    const contentVersion = `draft.${prepared.fingerprint.replace(/^sha256:/, '').slice(0, 12)}`
    const draft: DraftExperience = {
      experienceId: `draft-${input.jobId}`,
      title: input.title,
      contentVersion,
      mediaFingerprint: prepared.fingerprint,
      publishStatus: 'draft',
      blockers: ['HUMAN_REVIEW_REQUIRED'],
      evidence: [...transcript.segments, ...ocr],
      concepts: graph.concepts,
      claims: graph.claims,
      causalEdges: graph.causalEdges,
      conditions: graph.conditions,
      triggerCandidates: authoredCandidates,
      rejectedTriggerCandidates: rejected.map(({ candidateId, reason }) => ({
        candidateId,
        reason
      })),
      approvedTriggers: []
    }

    const coverageReport = buildCoverageReport({
      concepts: graph.concepts,
      causalEdges: graph.causalEdges,
      conditions: graph.conditions,
      acceptedCandidates: authoredCandidates,
      rejectedCandidates: rejected,
      directionResolutions,
      versions: {
        contentVersion,
        mediaFingerprint: prepared.fingerprint,
        ruleEngineVersion: RULE_ENGINE_VERSION,
        weightTableVersion: WEIGHT_TABLE_VERSION,
        promptVersion: PROMPT_VERSION
      },
      evidenceConfidenceById: buildEvidenceConfidence(timeline)
    })

    return { draft, coverageReport }
  }

  /**
   * Stage 2 with a bounded re-ask: retry extraction only when the provider
   * returned schema-invalid structured output; any other error propagates.
   */
  private async extractWithRetry(
    input: Parameters<AnalysisPipelineDependencies['semantics']['extract']>[0]
  ): Promise<SemanticGraph> {
    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_REPAIR_ITERS; attempt += 1) {
      try {
        return await this.dependencies.semantics.extract(input)
      } catch (error) {
        if (error instanceof AppError && error.code === 'PROVIDER_INVALID_RESPONSE') {
          lastError = error
          continue
        }
        throw error
      }
    }
    throw lastError instanceof AppError
      ? lastError
      : new AppError('PROVIDER_INVALID_RESPONSE', 'Semantic extraction failed after retries', {
          status: 502,
          cause: lastError
        })
  }
}

/** Fold blocking critique verdicts (anything other than 'ok') into failed items. */
function mergeCritique(failed: FailedItem[], critique: CritiqueResult): FailedItem[] {
  const merged = new Map(failed.map((item) => [item.itemId, item]))
  for (const verdict of critique.items) {
    if (verdict.verdict === 'ok') continue
    merged.set(verdict.itemId, {
      itemId: verdict.itemId,
      kind: 'critique',
      error: `${verdict.verdict}: ${verdict.issue ?? 'flagged by critique'}`
    })
  }
  return [...merged.values()]
}

/** Compact evidence context string for the payload author, bounded to the candidate's evidence. */
function buildEvidenceContext(
  candidate: TriggerCandidate,
  transcript: Transcript,
  ocr: OcrEvidence[]
): string {
  const evidence = new Set(candidate.evidenceIds)
  const texts = [
    ...transcript.segments.filter((s) => evidence.has(s.evidenceId)).map((s) => s.text),
    ...ocr.filter((o) => evidence.has(o.evidenceId)).map((o) => o.text)
  ]
  return texts.join(' | ')
}

/** Evidence-confidence map for coverage's evidence-gap detection. */
function buildEvidenceConfidence(
  timeline: ReturnType<typeof buildSemanticTimeline>
): Map<string, { confidence?: number; sourceCount: number }> {
  const map = new Map<string, { confidence?: number; sourceCount: number }>()
  for (const [evidenceId, entry] of timeline.evidenceIndex) {
    map.set(evidenceId, { confidence: entry.confidence, sourceCount: 1 })
  }
  return map
}
