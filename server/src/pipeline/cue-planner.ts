import type { CueRejectionReason, TriggerCandidate } from '../domain/contracts.js'

const unsafeFinancialLanguage =
  /(买入|卖出|加仓|减仓|仓位|目标价|稳赚|必涨|必跌|推荐.{0,6}(股票|基金|黄金|资产)|买什么)/i

export const MIN_CUE_GAP_MS = 45_000
export const MAX_CONTENT_NODES = 6

export interface CuePlanResult {
  accepted: TriggerCandidate[]
  rejected: Array<{ candidateId: string; reason: CueRejectionReason }>
}

interface CandidatePlan {
  totalPriority: number
  candidates: TriggerCandidate[]
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareChronologically(left: TriggerCandidate, right: TriggerCandidate): number {
  return (
    left.proposedStartMs - right.proposedStartMs || compareText(left.candidateId, right.candidateId)
  )
}

/**
 * Return the better plan using the product's deterministic objective order:
 * total versioned priority, then cue count, then earlier time vector, then IDs.
 */
function betterPlan(left: CandidatePlan, right: CandidatePlan): CandidatePlan {
  if (left.totalPriority !== right.totalPriority) {
    return left.totalPriority > right.totalPriority ? left : right
  }
  if (left.candidates.length !== right.candidates.length) {
    return left.candidates.length > right.candidates.length ? left : right
  }
  for (let index = 0; index < left.candidates.length; index += 1) {
    const timeDifference =
      left.candidates[index].proposedStartMs - right.candidates[index].proposedStartMs
    if (timeDifference !== 0) return timeDifference < 0 ? left : right
  }
  for (let index = 0; index < left.candidates.length; index += 1) {
    const idDifference = compareText(
      left.candidates[index].candidateId,
      right.candidates[index].candidateId
    )
    if (idDifference !== 0) return idDifference < 0 ? left : right
  }
  return left
}

function hardGateReason(
  candidate: TriggerCandidate,
  options: { durationMs?: number; knownEvidenceIds?: Set<string> }
): CueRejectionReason | undefined {
  if (!candidate.evidenceIds.length) return 'EVIDENCE_REQUIRED'
  if (
    options.knownEvidenceIds &&
    candidate.evidenceIds.some((id) => !options.knownEvidenceIds?.has(id))
  ) {
    return 'EVIDENCE_NOT_FOUND'
  }
  if (unsafeFinancialLanguage.test(`${candidate.prompt} ${candidate.learningObjective}`)) {
    return 'UNSAFE_FINANCIAL_LANGUAGE'
  }
  if (candidate.visualLoad === 'high') return 'HIGH_VISUAL_LOAD'
  if (
    options.durationMs !== undefined &&
    (candidate.proposedStartMs >= options.durationMs ||
      candidate.proposedEndMs > options.durationMs)
  ) {
    return 'OUTSIDE_MEDIA_DURATION'
  }
  return undefined
}

function findPredecessorIndexes(candidates: TriggerCandidate[], minGapMs: number): number[] {
  return candidates.map((candidate, candidateIndex) => {
    const latestCompatibleStart = candidate.proposedStartMs - minGapMs
    let low = 0
    let high = candidateIndex - 1
    let predecessor = -1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (candidates[middle].proposedStartMs <= latestCompatibleStart) {
        predecessor = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return predecessor
  })
}

/**
 * Cardinality-bounded weighted interval scheduling. `priority` is the scorer's
 * deterministic, versioned aggregate learning-value score; raw model
 * `subSignals.learningValue` is only one input to that score.
 */
function selectOptimalCandidates(
  candidates: TriggerCandidate[],
  maxContentNodes: number,
  minGapMs: number
): CandidatePlan {
  const predecessors = findPredecessorIndexes(candidates, minGapMs)
  const emptyPlan = (): CandidatePlan => ({ totalPriority: 0, candidates: [] })
  const best: CandidatePlan[][] = Array.from({ length: candidates.length + 1 }, () =>
    Array.from({ length: maxContentNodes + 1 }, emptyPlan)
  )

  for (let itemCount = 1; itemCount <= candidates.length; itemCount += 1) {
    const candidate = candidates[itemCount - 1]
    for (let nodeLimit = 1; nodeLimit <= maxContentNodes; nodeLimit += 1) {
      const withoutCandidate = best[itemCount - 1][nodeLimit]
      const predecessorRow = predecessors[itemCount - 1] + 1
      const compatiblePlan = best[predecessorRow][nodeLimit - 1]
      const withCandidate: CandidatePlan = {
        totalPriority: compatiblePlan.totalPriority + candidate.priority,
        candidates: [...compatiblePlan.candidates, candidate]
      }
      best[itemCount][nodeLimit] = betterPlan(withCandidate, withoutCandidate)
    }
  }

  return best[candidates.length][maxContentNodes]
}

export function planCueCandidates(
  candidates: TriggerCandidate[],
  options: {
    minGapMs?: number
    durationMs?: number
    knownEvidenceIds?: Set<string>
  } = {}
): CuePlanResult {
  const rawGap = options.minGapMs ?? MIN_CUE_GAP_MS
  const requestedGap = Number.isFinite(rawGap) ? Math.floor(rawGap) : MIN_CUE_GAP_MS
  const minGapMs = Math.max(MIN_CUE_GAP_MS, requestedGap)
  const ordered = [...candidates].sort(compareChronologically)
  const eligible: TriggerCandidate[] = []
  const rejectedWithCandidate: Array<{
    candidate: TriggerCandidate
    reason: CueRejectionReason
  }> = []

  for (const candidate of ordered) {
    const reason = hardGateReason(candidate, options)
    if (reason) rejectedWithCandidate.push({ candidate, reason })
    else eligible.push(candidate)
  }

  const optimal = selectOptimalCandidates(eligible, MAX_CONTENT_NODES, minGapMs)
  const accepted = optimal.candidates
  const acceptedSet = new Set(accepted)
  for (const candidate of eligible) {
    if (acceptedSet.has(candidate)) continue
    const violatesGap = accepted.some(
      (selected) => Math.abs(candidate.proposedStartMs - selected.proposedStartMs) < minGapMs
    )
    rejectedWithCandidate.push({
      candidate,
      reason: violatesGap ? 'MIN_GAP_VIOLATION' : 'MAX_CONTENT_NODE_COUNT'
    })
  }

  const rejected = rejectedWithCandidate
    .sort((left, right) => compareChronologically(left.candidate, right.candidate))
    .map(({ candidate, reason }) => ({ candidateId: candidate.candidateId, reason }))
  return { accepted, rejected }
}
