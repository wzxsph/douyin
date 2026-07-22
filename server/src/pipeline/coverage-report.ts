import type {
  CausalEdge,
  Concept,
  Condition,
  CoverageCount,
  CoverageReport,
  CueRejectionReason,
  DirectionResolution,
  TriggerCandidate
} from '../domain/contracts.js'
import { CUE_KINDS, RENDERABLE_KINDS } from '../domain/payload-contracts.js'

/**
 * Deterministic coverage report builder.
 *
 * This report is the human-authoring hand-off surface: it says which semantic
 * items an automatic cue actually covers, where evidence is thin, and which
 * decisions a person still has to make. It is intentionally NOT model-authored
 * — identical input must always yield a deep-equal output — so reviewers can
 * trust it as ground truth rather than a generated summary.
 */

const LOW_CONFIDENCE_THRESHOLD = 0.5

interface EvidenceConfidence {
  confidence?: number
  sourceCount: number
}

interface SemanticItem {
  itemId: string
  evidenceIds: string[]
}

export interface BuildCoverageReportInput {
  concepts: Concept[]
  causalEdges: CausalEdge[]
  conditions: Condition[]
  acceptedCandidates: TriggerCandidate[]
  rejectedCandidates: Array<{ candidateId: string; kind: string; reason: CueRejectionReason }>
  directionResolutions: DirectionResolution[]
  versions: CoverageReport['versions']
  evidenceConfidenceById?: Map<string, EvidenceConfidence>
  /** Overridable in tests; defaults to the kinds the frontend can render. */
  renderableKinds?: ReadonlySet<string>
}

/** Every evidenceId referenced by at least one accepted candidate. */
function acceptedEvidenceIds(acceptedCandidates: TriggerCandidate[]): Set<string> {
  const ids = new Set<string>()
  for (const candidate of acceptedCandidates) {
    for (const evidenceId of candidate.evidenceIds) ids.add(evidenceId)
  }
  return ids
}

function isCovered(item: SemanticItem, covered: Set<string>): boolean {
  return item.evidenceIds.some((evidenceId) => covered.has(evidenceId))
}

function countCoverage(items: SemanticItem[], covered: Set<string>): CoverageCount {
  const uncovered = items
    .filter((item) => !isCovered(item, covered))
    .map((item) => item.itemId)
    .sort()
  return {
    total: items.length,
    coveredByAcceptedCue: items.length - uncovered.length,
    uncovered
  }
}

/**
 * An item's evidence is single-source when the confidence map reports a single
 * distinct source for it, or (when no map entry exists) it carries a single
 * evidenceId. Uses the first matching evidenceId with a map entry.
 */
function isSingleSource(
  item: SemanticItem,
  evidenceConfidenceById?: Map<string, EvidenceConfidence>
): boolean {
  if (evidenceConfidenceById) {
    for (const evidenceId of item.evidenceIds) {
      const entry = evidenceConfidenceById.get(evidenceId)
      if (entry) return entry.sourceCount === 1
    }
  }
  return item.evidenceIds.length === 1
}

function isLowConfidence(
  item: SemanticItem,
  evidenceConfidenceById?: Map<string, EvidenceConfidence>
): boolean {
  if (!evidenceConfidenceById) return false
  return item.evidenceIds.some((evidenceId) => {
    const entry = evidenceConfidenceById.get(evidenceId)
    return entry?.confidence !== undefined && entry.confidence < LOW_CONFIDENCE_THRESHOLD
  })
}

function buildEvidenceGaps(
  items: SemanticItem[],
  evidenceConfidenceById?: Map<string, EvidenceConfidence>
): CoverageReport['evidenceGaps'] {
  const gaps: CoverageReport['evidenceGaps'] = []
  for (const item of items) {
    if (isSingleSource(item, evidenceConfidenceById)) {
      gaps.push({ itemId: item.itemId, reason: 'single_source' })
    } else if (isLowConfidence(item, evidenceConfidenceById)) {
      gaps.push({ itemId: item.itemId, reason: 'low_confidence' })
    }
  }
  return gaps.sort((left, right) => left.itemId.localeCompare(right.itemId))
}

function buildKindBalance(acceptedCandidates: TriggerCandidate[]): Record<string, number> {
  const balance: Record<string, number> = {}
  for (const kind of CUE_KINDS) balance[kind] = 0
  for (const candidate of acceptedCandidates) balance[candidate.kind] += 1
  return balance
}

/** True when every accepted cue is a quiz-shaped quick_judgment (and there is at least one). */
function isAllQuizShaped(kindBalance: Record<string, number>): boolean {
  const accepted = CUE_KINDS.reduce((sum, kind) => sum + kindBalance[kind], 0)
  return accepted > 0 && kindBalance.quick_judgment === accepted
}

function buildReviewDecisions(
  conceptCoverage: CoverageCount,
  acceptedCandidates: TriggerCandidate[],
  directionResolutions: DirectionResolution[],
  kindBalance: Record<string, number>,
  renderableKinds: ReadonlySet<string>
): string[] {
  const decisions: string[] = []

  for (const resolution of directionResolutions) {
    if (resolution.direction === 'insufficient') {
      decisions.push(
        `方向待裁定：候选 ${resolution.candidateId}（${resolution.insufficientReason ?? '信息不足'}）`
      )
    }
  }

  for (const conceptId of conceptCoverage.uncovered) {
    decisions.push(`概念未覆盖：${conceptId}`)
  }

  for (const candidate of acceptedCandidates) {
    if (!renderableKinds.has(candidate.kind)) {
      decisions.push(
        `非可渲染触点，待补渲染器或改类型：${candidate.candidateId}（${candidate.kind}）`
      )
    }
  }

  if (isAllQuizShaped(kindBalance)) {
    decisions.push('触点全为问答式，建议补背景/对照类')
  }

  return decisions
}

export function buildCoverageReport(input: BuildCoverageReportInput): CoverageReport {
  const {
    concepts,
    causalEdges,
    conditions,
    acceptedCandidates,
    rejectedCandidates,
    directionResolutions,
    versions,
    evidenceConfidenceById,
    renderableKinds = RENDERABLE_KINDS
  } = input

  const conceptItems: SemanticItem[] = concepts.map((concept) => ({
    itemId: concept.conceptId,
    evidenceIds: concept.evidenceIds
  }))
  const edgeItems: SemanticItem[] = causalEdges.map((edge) => ({
    itemId: edge.edgeId,
    evidenceIds: edge.evidenceIds
  }))
  const conditionItems: SemanticItem[] = conditions.map((condition) => ({
    itemId: condition.conditionId,
    evidenceIds: condition.evidenceIds
  }))

  const covered = acceptedEvidenceIds(acceptedCandidates)
  const conceptCoverage = countCoverage(conceptItems, covered)
  const kindBalance = buildKindBalance(acceptedCandidates)

  const sortedDirectionResolutions = [...directionResolutions].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  )
  const sortedRejectedCandidates = [...rejectedCandidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  )

  return {
    coverage: {
      concepts: conceptCoverage,
      causalEdges: countCoverage(edgeItems, covered),
      conditions: countCoverage(conditionItems, covered)
    },
    evidenceGaps: buildEvidenceGaps(
      [...conceptItems, ...edgeItems, ...conditionItems],
      evidenceConfidenceById
    ),
    kindBalance,
    directionResolutions: sortedDirectionResolutions,
    rejectedCandidates: sortedRejectedCandidates,
    reviewDecisionsRequired: buildReviewDecisions(
      conceptCoverage,
      acceptedCandidates,
      sortedDirectionResolutions,
      kindBalance,
      renderableKinds
    ),
    versions
  }
}
