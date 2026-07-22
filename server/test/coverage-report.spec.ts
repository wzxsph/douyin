import { describe, expect, it } from 'vitest'
import { buildCoverageReport } from '../src/pipeline/coverage-report.js'
import type {
  CausalEdge,
  Concept,
  Condition,
  CoverageReport,
  DirectionResolution,
  TriggerCandidate
} from '../src/domain/contracts.js'
import { CUE_KINDS } from '../src/domain/payload-contracts.js'

const versions: CoverageReport['versions'] = {
  contentVersion: 'content-1',
  mediaFingerprint: 'fp-1',
  ruleEngineVersion: 'rule-1',
  weightTableVersion: 'weights-1',
  promptVersion: 'prompt-1'
}

function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    conceptId: 'concept-1',
    name: '政策利率',
    evidenceIds: ['e-1', 'e-2'],
    ...overrides
  }
}

function causalEdge(overrides: Partial<CausalEdge> = {}): CausalEdge {
  return {
    edgeId: 'edge-1',
    from: { nodeType: 'concept', nodeId: 'concept-1' },
    to: { nodeType: 'claim', nodeId: 'claim-1' },
    mechanism: '利率上行压制估值',
    omittedIntermediate: false,
    evidenceIds: ['e-3', 'e-4'],
    ...overrides
  }
}

function condition(overrides: Partial<Condition> = {}): Condition {
  return {
    conditionId: 'cond-1',
    variable: 'CPI',
    operator: 'above',
    statement: 'CPI 高于 3%',
    evidenceIds: ['e-5', 'e-6'],
    ...overrides
  }
}

function candidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    candidateId: 'cue-1',
    sourceEventId: 'event-1',
    kind: 'context_card',
    proposedStartMs: 10_000,
    proposedEndMs: 16_000,
    windowId: 'w-1',
    priority: 80,
    expectedInteractionMs: 8_000,
    prompt: '这里的政策利率指什么？',
    learningObjective: '区分政策利率和贷款利率',
    rationale: '口播首次引入核心概念',
    evidenceIds: ['e-1'],
    visualLoad: 'low',
    subSignals: { learningValue: 0.8, timeSensitivity: 0.5, interactionFit: 0.6 },
    ...overrides
  }
}

function resolution(overrides: Partial<DirectionResolution> = {}): DirectionResolution {
  return {
    candidateId: 'cue-1',
    direction: 'support_dominant',
    activatedPaths: ['edge-1'],
    evidenceIds: ['e-1'],
    ruleVersion: 'rule-1',
    ...overrides
  }
}

describe('buildCoverageReport', () => {
  it('produces all seven top-level fields with the correct shape', () => {
    const report = buildCoverageReport({
      concepts: [concept()],
      causalEdges: [causalEdge()],
      conditions: [condition()],
      acceptedCandidates: [candidate()],
      rejectedCandidates: [],
      directionResolutions: [resolution()],
      versions
    })

    expect(Object.keys(report).sort()).toEqual(
      [
        'coverage',
        'directionResolutions',
        'evidenceGaps',
        'kindBalance',
        'rejectedCandidates',
        'reviewDecisionsRequired',
        'versions'
      ].sort()
    )
    expect(Object.keys(report.coverage).sort()).toEqual(['causalEdges', 'concepts', 'conditions'])
    for (const bucket of [
      report.coverage.concepts,
      report.coverage.causalEdges,
      report.coverage.conditions
    ]) {
      expect(bucket).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          coveredByAcceptedCue: expect.any(Number),
          uncovered: expect.any(Array)
        })
      )
    }
    expect(Array.isArray(report.evidenceGaps)).toBe(true)
    expect(Array.isArray(report.directionResolutions)).toBe(true)
    expect(Array.isArray(report.rejectedCandidates)).toBe(true)
    expect(Array.isArray(report.reviewDecisionsRequired)).toBe(true)
    expect(report.versions).toEqual(versions)
  })

  it('lists an uncovered concept and emits a matching review decision', () => {
    const covered = concept({ conceptId: 'covered', evidenceIds: ['e-1'] })
    const uncovered = concept({ conceptId: 'uncovered', evidenceIds: ['e-99'] })
    const report = buildCoverageReport({
      concepts: [covered, uncovered],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [candidate({ evidenceIds: ['e-1'] })],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(report.coverage.concepts.total).toBe(2)
    expect(report.coverage.concepts.coveredByAcceptedCue).toBe(1)
    expect(report.coverage.concepts.uncovered).toEqual(['uncovered'])
    expect(report.reviewDecisionsRequired).toContain('概念未覆盖：uncovered')
    expect(report.reviewDecisionsRequired).not.toContain('概念未覆盖：covered')
  })

  it('increments coveredByAcceptedCue when a candidate references the concept evidence', () => {
    const report = buildCoverageReport({
      concepts: [concept({ conceptId: 'concept-1', evidenceIds: ['e-1', 'e-2'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [candidate({ evidenceIds: ['e-2'] })],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(report.coverage.concepts.coveredByAcceptedCue).toBe(1)
    expect(report.coverage.concepts.uncovered).toEqual([])
  })

  it('flags a single-evidence item as a single_source evidence gap', () => {
    const report = buildCoverageReport({
      concepts: [concept({ conceptId: 'thin', evidenceIds: ['only-1'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(report.evidenceGaps).toContainEqual({ itemId: 'thin', reason: 'single_source' })
  })

  it('flags low confidence via the evidence confidence map', () => {
    const report = buildCoverageReport({
      concepts: [concept({ conceptId: 'shaky', evidenceIds: ['e-a', 'e-b'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [],
      rejectedCandidates: [],
      directionResolutions: [],
      versions,
      evidenceConfidenceById: new Map([
        ['e-a', { confidence: 0.9, sourceCount: 2 }],
        ['e-b', { confidence: 0.2, sourceCount: 2 }]
      ])
    })

    expect(report.evidenceGaps).toContainEqual({ itemId: 'shaky', reason: 'low_confidence' })
    expect(report.evidenceGaps).not.toContainEqual({ itemId: 'shaky', reason: 'single_source' })
  })

  it('turns an insufficient direction resolution into a review decision line', () => {
    const report = buildCoverageReport({
      concepts: [concept({ evidenceIds: ['e-1'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [candidate({ evidenceIds: ['e-1'] })],
      rejectedCandidates: [],
      directionResolutions: [
        resolution({
          candidateId: 'cue-x',
          direction: 'insufficient',
          insufficientReason: '证据不足以判断方向'
        })
      ],
      versions
    })

    expect(report.reviewDecisionsRequired).toContain('方向待裁定：候选 cue-x（证据不足以判断方向）')
  })

  it('falls back to a default reason when an insufficient resolution omits one', () => {
    const report = buildCoverageReport({
      concepts: [],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [],
      rejectedCandidates: [],
      directionResolutions: [resolution({ candidateId: 'cue-y', direction: 'insufficient' })],
      versions
    })

    expect(report.reviewDecisionsRequired).toContain('方向待裁定：候选 cue-y（信息不足）')
  })

  it('emits a non-renderable review line when a kind lacks a renderer', () => {
    // All six kinds render today; exercise the defensive gate with a restricted set.
    const report = buildCoverageReport({
      concepts: [concept({ evidenceIds: ['e-1'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [
        candidate({ candidateId: 'cmp', kind: 'concept_compare', evidenceIds: ['e-1'] })
      ],
      rejectedCandidates: [],
      directionResolutions: [],
      versions,
      renderableKinds: new Set(['context_card'])
    })

    expect(report.reviewDecisionsRequired).toContain(
      '非可渲染触点，待补渲染器或改类型：cmp（concept_compare）'
    )
  })

  it('recommends variety when every accepted cue is quiz-shaped', () => {
    const report = buildCoverageReport({
      concepts: [concept({ evidenceIds: ['e-1'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [
        candidate({ candidateId: 'q-1', kind: 'quick_judgment', evidenceIds: ['e-1'] }),
        candidate({ candidateId: 'q-2', kind: 'quick_judgment', evidenceIds: ['e-1'] })
      ],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(report.reviewDecisionsRequired).toContain('触点全为问答式，建议补背景/对照类')
  })

  it('does not recommend variety when a non-quiz cue is present', () => {
    const report = buildCoverageReport({
      concepts: [concept({ evidenceIds: ['e-1'] })],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [
        candidate({ candidateId: 'q-1', kind: 'quick_judgment', evidenceIds: ['e-1'] }),
        candidate({ candidateId: 'c-1', kind: 'context_card', evidenceIds: ['e-1'] })
      ],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(report.reviewDecisionsRequired).not.toContain('触点全为问答式，建议补背景/对照类')
  })

  it('includes all six cue kinds in kindBalance with zero defaults', () => {
    const report = buildCoverageReport({
      concepts: [],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [candidate({ kind: 'context_card' })],
      rejectedCandidates: [],
      directionResolutions: [],
      versions
    })

    expect(Object.keys(report.kindBalance).sort()).toEqual([...CUE_KINDS].sort())
    expect(report.kindBalance.context_card).toBe(1)
    expect(report.kindBalance.quick_judgment).toBe(0)
    expect(report.kindBalance.concept_compare).toBe(0)
  })

  it('passes through and sorts direction resolutions and rejected candidates by candidateId', () => {
    const report = buildCoverageReport({
      concepts: [],
      causalEdges: [],
      conditions: [],
      acceptedCandidates: [],
      rejectedCandidates: [
        { candidateId: 'z-rej', kind: 'quick_judgment', reason: 'HIGH_VISUAL_LOAD' },
        { candidateId: 'a-rej', kind: 'context_card', reason: 'EVIDENCE_REQUIRED' }
      ],
      directionResolutions: [
        resolution({ candidateId: 'z-dir' }),
        resolution({ candidateId: 'a-dir' })
      ],
      versions
    })

    expect(report.rejectedCandidates.map((item) => item.candidateId)).toEqual(['a-rej', 'z-rej'])
    expect(report.directionResolutions.map((item) => item.candidateId)).toEqual(['a-dir', 'z-dir'])
  })

  it('is deterministic: identical input yields deep-equal output', () => {
    const input = {
      concepts: [concept({ conceptId: 'c-b' }), concept({ conceptId: 'c-a', evidenceIds: ['x'] })],
      causalEdges: [causalEdge()],
      conditions: [condition()],
      acceptedCandidates: [
        candidate({ candidateId: 'cue-2', kind: 'condition_slider', evidenceIds: ['e-2'] }),
        candidate({ candidateId: 'cue-1', evidenceIds: ['e-1'] })
      ],
      rejectedCandidates: [
        { candidateId: 'r-2', kind: 'concept_compare', reason: 'NON_RENDERABLE_KIND' as const },
        { candidateId: 'r-1', kind: 'quick_judgment', reason: 'MIN_GAP_VIOLATION' as const }
      ],
      directionResolutions: [
        resolution({ candidateId: 'd-2', direction: 'insufficient' }),
        resolution({ candidateId: 'd-1' })
      ],
      versions
    }

    expect(buildCoverageReport(input)).toEqual(buildCoverageReport(input))
  })
})
