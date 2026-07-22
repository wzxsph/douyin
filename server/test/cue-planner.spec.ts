import { describe, expect, it } from 'vitest'
import { planCueCandidates } from '../src/pipeline/cue-planner.js'
import type { TriggerCandidate } from '../src/domain/contracts.js'

function candidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    candidateId: 'cue-1',
    kind: 'context_card',
    proposedStartMs: 10_000,
    proposedEndMs: 16_000,
    priority: 80,
    expectedInteractionMs: 8_000,
    prompt: '这里的政策利率指什么？',
    learningObjective: '区分政策利率和贷款利率',
    rationale: '口播首次引入核心概念',
    evidenceIds: ['e-1'],
    confidence: 0.9,
    visualLoad: 'low',
    ...overrides
  }
}

describe('deterministic cue planner', () => {
  it('enforces evidence, safety, max count and a 45-second gap', () => {
    const result = planCueCandidates(
      [
        candidate(),
        candidate({ candidateId: 'too-close', proposedStartMs: 20_000, proposedEndMs: 26_000 }),
        candidate({ candidateId: 'cue-2', proposedStartMs: 60_000, proposedEndMs: 66_000 }),
        candidate({ candidateId: 'no-evidence', proposedStartMs: 110_000, evidenceIds: [] }),
        candidate({
          candidateId: 'unsafe',
          proposedStartMs: 120_000,
          prompt: '现在应该买入什么？'
        })
      ],
      { maxAutomaticCues: 6, minGapMs: 45_000 }
    )

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['cue-1', 'cue-2'])
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: 'too-close', reason: 'MIN_GAP_VIOLATION' }),
        expect.objectContaining({ candidateId: 'no-evidence', reason: 'EVIDENCE_REQUIRED' }),
        expect.objectContaining({ candidateId: 'unsafe', reason: 'UNSAFE_FINANCIAL_LANGUAGE' })
      ])
    )
  })

  it('is deterministic for the same input', () => {
    const input = [
      candidate({ candidateId: 'lower', priority: 60 }),
      candidate({ candidateId: 'higher', priority: 90, proposedStartMs: 10_100 })
    ]
    expect(planCueCandidates(input)).toEqual(planCueCandidates(input))
  })
})
