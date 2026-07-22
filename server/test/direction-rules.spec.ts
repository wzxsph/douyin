import { describe, expect, it } from 'vitest'
import {
  ACTIVATED_PATHS,
  RULE_ENGINE_VERSION,
  resolveDirection,
  resolveMany
} from '../src/pipeline/direction-rules.js'
import type {
  Claim,
  Condition,
  SemanticGraph,
  SubSignals,
  TriggerCandidate
} from '../src/domain/contracts.js'

const subSignals: SubSignals = {
  learningValue: 0.8,
  timeSensitivity: 0.5,
  interactionFit: 0.7
}

function candidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    candidateId: 'cand-1',
    sourceEventId: 'evt-1',
    kind: 'condition_slider',
    proposedStartMs: 10_000,
    proposedEndMs: 16_000,
    windowId: 'w-1',
    priority: 80,
    expectedInteractionMs: 8_000,
    prompt: '盈利预期下修时，估值支撑还占优吗？',
    learningObjective: '识别盈利条件如何改变股票路径',
    rationale: '条件敏感性',
    evidenceIds: [],
    visualLoad: 'low',
    subSignals,
    ...overrides
  }
}

function condition(overrides: Partial<Condition> = {}): Condition {
  return {
    conditionId: 'c-1',
    variable: 'policy_rate',
    operator: 'decrease',
    statement: '政策利率下降',
    evidenceIds: ['e-rate'],
    ...overrides
  }
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    claimId: 'cl-1',
    statement: '降息可能支撑股票估值',
    evidenceIds: ['e-rate'],
    ...overrides
  }
}

function graph(overrides: Partial<SemanticGraph> = {}): SemanticGraph {
  return {
    concepts: [],
    claims: [],
    causalEdges: [],
    conditions: [],
    semanticEvents: [],
    ...overrides
  }
}

// Scenario A 温和降息: 利率下降、通胀下降、增长稳定(未走弱)、避险低.
// Each scenario uses its own evidence-id namespace so a merged graph (used by the
// resolveMany test) does not cross-link a candidate to another scenario's signals.
function scenarioA(): { candidate: TriggerCandidate; graph: SemanticGraph } {
  const evidenceIds = ['a-rate-ev', 'a-infl-ev', 'a-risk-ev']
  return {
    candidate: candidate({ candidateId: 'A', kind: 'condition_slider', evidenceIds }),
    graph: graph({
      conditions: [
        condition({
          conditionId: 'a-rate',
          variable: 'policy_rate',
          operator: 'decrease',
          evidenceIds: ['a-rate-ev']
        }),
        condition({
          conditionId: 'a-infl',
          variable: 'inflation',
          operator: 'decrease',
          evidenceIds: ['a-infl-ev']
        }),
        condition({
          conditionId: 'a-risk',
          variable: 'risk_aversion',
          operator: 'below',
          evidenceIds: ['a-risk-ev']
        })
      ]
    })
  }
}

// Scenario B 衰退式降息: 利率下降、增长明显走弱、避险升高.
function scenarioB(): { candidate: TriggerCandidate; graph: SemanticGraph } {
  const evidenceIds = ['b-rate-ev', 'b-growth-ev', 'b-risk-ev']
  return {
    candidate: candidate({ candidateId: 'B', kind: 'causal_stitch', evidenceIds }),
    graph: graph({
      conditions: [
        condition({
          conditionId: 'b-rate',
          variable: 'policy_rate',
          operator: 'decrease',
          evidenceIds: ['b-rate-ev']
        }),
        condition({
          conditionId: 'b-growth',
          variable: 'growth',
          operator: 'decrease',
          evidenceIds: ['b-growth-ev']
        }),
        condition({
          conditionId: 'b-risk',
          variable: 'risk_aversion',
          operator: 'above',
          evidenceIds: ['b-risk-ev']
        })
      ]
    })
  }
}

// Scenario C 相对降息: 美国降息、其他经济体降息更多 → 汇率看相对利差, indeterminate.
function scenarioC(): { candidate: TriggerCandidate; graph: SemanticGraph } {
  const evidenceIds = ['c-rate-ev', 'c-foreign-ev']
  return {
    candidate: candidate({ candidateId: 'C', kind: 'quick_judgment', evidenceIds }),
    graph: graph({
      conditions: [
        condition({
          conditionId: 'c-rate',
          variable: 'policy_rate',
          operator: 'decrease',
          evidenceIds: ['c-rate-ev']
        }),
        condition({
          conditionId: 'c-foreign',
          variable: 'foreign_policy_rate',
          operator: 'decrease',
          statement: '其他经济体降息更多',
          evidenceIds: ['c-foreign-ev']
        })
      ],
      claims: [claim({ claimId: 'c-fx', assetClass: 'fx', evidenceIds: ['c-foreign-ev'] })]
    })
  }
}

describe('direction rule engine (versioned; the rule table, not the model, decides)', () => {
  it('Scenario A 温和降息 → support_dominant with valuation + gold paths', () => {
    const { candidate: c, graph: g } = scenarioA()
    const result = resolveDirection(c, g)

    expect(result.direction).toBe('support_dominant')
    expect(result.activatedPaths).toEqual([
      ACTIVATED_PATHS.valuationSupport,
      ACTIVATED_PATHS.goldSupport
    ])
    expect(result.ruleVersion).toBe(RULE_ENGINE_VERSION)
    expect(result.evidenceIds).toEqual(['a-rate-ev', 'a-infl-ev', 'a-risk-ev'])
    expect(result.insufficientReason).toBeUndefined()
  })

  it('Scenario B 衰退式降息 → the locked enum (conflict), deterministically', () => {
    const { candidate: c, graph: g } = scenarioB()
    const result = resolveDirection(c, g)

    // PRD §21.3 permits pressure_dominant OR conflict; v1 LOCKS conflict.
    expect(result.direction).toBe('conflict')
    expect(result.activatedPaths).toEqual([
      ACTIVATED_PATHS.valuationSupport,
      ACTIVATED_PATHS.earningsPressure
    ])
    expect(result.ruleVersion).toBe(RULE_ENGINE_VERSION)
    // Determinism: locked enum does not drift across calls.
    expect(resolveDirection(c, g).direction).toBe('conflict')
  })

  it('Scenario C 相对降息 (indeterminate differential) → insufficient; USD is NOT hardcoded weak', () => {
    const { candidate: c, graph: g } = scenarioC()
    const result = resolveDirection(c, g)

    expect(result.direction).toBe('insufficient')
    expect(result.insufficientReason).toBeTruthy()
    expect(result.insufficientReason?.length).toBeGreaterThan(0)
    // The relative-rate path is activated for traceability (PRD §21.3)...
    expect(result.activatedPaths).toEqual([ACTIVATED_PATHS.relativeRateDifferential])
    // ...but USD is never resolved to a weak/pressure direction.
    expect(result.direction).not.toBe('pressure_dominant')
    expect(result.direction).not.toBe('support_dominant')
  })

  it('unknown signature → insufficient with a reason', () => {
    const c = candidate({
      candidateId: 'unknown',
      kind: 'condition_slider',
      evidenceIds: ['e-x']
    })
    const g = graph({
      conditions: [
        condition({
          conditionId: 'x',
          variable: 'credit_spread',
          operator: 'increase',
          statement: '信用利差走阔',
          evidenceIds: ['e-x']
        })
      ]
    })
    const result = resolveDirection(c, g)

    expect(result.direction).toBe('insufficient')
    expect(result.insufficientReason).toBeTruthy()
    expect(result.ruleVersion).toBe(RULE_ENGINE_VERSION)
  })

  it('empty signature (no referenced conditions/claims) → insufficient', () => {
    const c = candidate({ candidateId: 'empty', kind: 'causal_stitch', evidenceIds: ['e-none'] })
    const result = resolveDirection(c, graph())

    expect(result.direction).toBe('insufficient')
    expect(result.activatedPaths).toEqual([])
    expect(result.insufficientReason).toBeTruthy()
  })

  it('non-directional kind (context_card / concept_compare) → insufficient even with a directional signature present', () => {
    const { graph: g } = scenarioA()
    for (const kind of ['context_card', 'concept_compare'] as const) {
      // Scenario A evidence IS present, yet the kind gate short-circuits to
      // insufficient because these kinds never assert an asset direction.
      const c = candidate({
        candidateId: `nd-${kind}`,
        kind,
        evidenceIds: ['a-rate-ev', 'a-infl-ev', 'a-risk-ev']
      })
      const result = resolveDirection(c, g)

      expect(result.direction).toBe('insufficient')
      expect(result.ruleVersion).toBe(RULE_ENGINE_VERSION)
      expect(result.insufficientReason).toBeTruthy()
      expect(result.candidateId).toBe(`nd-${kind}`)
    }
  })

  it('the model MODEL WINS test: assertedDirection is IGNORED — rule table wins over model', () => {
    // Signature that the rule table does NOT recognise (→ insufficient),
    // but the model asserts support_dominant on a linked claim.
    const c = candidate({
      candidateId: 'model-override-attempt',
      kind: 'condition_slider',
      evidenceIds: ['e-y']
    })
    const g = graph({
      conditions: [
        condition({
          conditionId: 'y',
          variable: 'term_premium',
          operator: 'increase',
          statement: '期限溢价上升',
          evidenceIds: ['e-y']
        })
      ],
      claims: [
        claim({
          claimId: 'model-claim',
          statement: '模型主张：支撑占优',
          assertedDirection: 'support_dominant',
          evidenceIds: ['e-y']
        })
      ]
    })
    const result = resolveDirection(c, g)

    // Rule table wins: unknown signature → insufficient, model's guess discarded.
    expect(result.direction).toBe('insufficient')
    expect(result.direction).not.toBe('support_dominant')
    expect(result.insufficientReason).toBeTruthy()
  })

  it('a recognised signature also ignores a CONTRADICTING assertedDirection', () => {
    // Scenario A inputs (→ support_dominant) but the model asserts pressure.
    const { candidate: base, graph: g } = scenarioA()
    const gWithClaim = graph({
      conditions: g.conditions,
      claims: [
        claim({
          claimId: 'a-contra',
          statement: '模型主张：压制占优',
          assertedDirection: 'pressure_dominant',
          evidenceIds: ['a-rate-ev']
        })
      ]
    })
    const result = resolveDirection(base, gWithClaim)

    // The rule table locks support_dominant; the model's pressure guess is ignored.
    expect(result.direction).toBe('support_dominant')
  })

  it('resolveDirection is deterministic: a second call deep-equals the first', () => {
    const { candidate: c, graph: g } = scenarioB()
    expect(resolveDirection(c, g)).toEqual(resolveDirection(c, g))
  })

  it('resolveMany preserves input order and resolves each candidate', () => {
    const a = scenarioA()
    const b = scenarioB()
    const cc = scenarioC()
    // A single graph containing every scenario's conditions; candidates select
    // their own signal set via evidenceIds.
    const merged = graph({
      conditions: [...a.graph.conditions, ...b.graph.conditions, ...cc.graph.conditions],
      claims: [...cc.graph.claims]
    })
    const results = resolveMany([a.candidate, b.candidate, cc.candidate], merged)

    expect(results.map((r) => r.candidateId)).toEqual(['A', 'B', 'C'])
    expect(results.map((r) => r.direction)).toEqual([
      'support_dominant',
      'conflict',
      'insufficient'
    ])
    expect(results.every((r) => r.ruleVersion === RULE_ENGINE_VERSION)).toBe(true)
  })
})
