import type { TriggerCandidate } from '../domain/contracts.js'

export type CueRejectionReason =
  | 'EVIDENCE_REQUIRED'
  | 'EVIDENCE_NOT_FOUND'
  | 'MIN_GAP_VIOLATION'
  | 'MAX_CUE_COUNT'
  | 'HIGH_VISUAL_LOAD'
  | 'UNSAFE_FINANCIAL_LANGUAGE'
  | 'OUTSIDE_MEDIA_DURATION'

const unsafeFinancialLanguage =
  /(买入|卖出|加仓|减仓|仓位|目标价|稳赚|必涨|必跌|推荐.{0,6}(股票|基金|黄金|资产)|买什么)/i

export interface CuePlanResult {
  accepted: TriggerCandidate[]
  rejected: Array<{ candidateId: string; reason: CueRejectionReason }>
}
export function planCueCandidates(
  candidates: TriggerCandidate[],
  options: {
    maxAutomaticCues?: number
    minGapMs?: number
    durationMs?: number
    knownEvidenceIds?: Set<string>
  } = {}
): CuePlanResult {
  const maxAutomaticCues = Math.min(6, options.maxAutomaticCues ?? 6)
  const minGapMs = Math.max(45_000, options.minGapMs ?? 45_000)
  const accepted: TriggerCandidate[] = []
  const rejected: CuePlanResult['rejected'] = []
  const ordered = [...candidates].sort(
    (left, right) => left.proposedStartMs - right.proposedStartMs || right.priority - left.priority
  )

  for (const candidate of ordered) {
    let reason: CueRejectionReason | undefined
    if (!candidate.evidenceIds.length) reason = 'EVIDENCE_REQUIRED'
    else if (
      options.knownEvidenceIds &&
      candidate.evidenceIds.some((id) => !options.knownEvidenceIds?.has(id))
    )
      reason = 'EVIDENCE_NOT_FOUND'
    else if (unsafeFinancialLanguage.test(`${candidate.prompt} ${candidate.learningObjective}`))
      reason = 'UNSAFE_FINANCIAL_LANGUAGE'
    else if (candidate.visualLoad === 'high') reason = 'HIGH_VISUAL_LOAD'
    else if (
      options.durationMs !== undefined &&
      (candidate.proposedStartMs >= options.durationMs ||
        candidate.proposedEndMs > options.durationMs)
    )
      reason = 'OUTSIDE_MEDIA_DURATION'
    else if (accepted.length >= maxAutomaticCues) reason = 'MAX_CUE_COUNT'
    else if (
      accepted.length &&
      candidate.proposedStartMs - accepted[accepted.length - 1].proposedStartMs < minGapMs
    )
      reason = 'MIN_GAP_VIOLATION'

    if (reason) rejected.push({ candidateId: candidate.candidateId, reason })
    else accepted.push(candidate)
  }
  return { accepted, rejected }
}
