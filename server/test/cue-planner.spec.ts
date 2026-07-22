import { describe, expect, it } from 'vitest'
import { planCueCandidates } from '../src/pipeline/cue-planner.js'
import type { TriggerCandidate } from '../src/domain/contracts.js'

function candidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    candidateId: 'cue-1',
    sourceEventId: 'event-1',
    kind: 'context_card',
    proposedStartMs: 10_000,
    proposedEndMs: 16_000,
    windowId: 'window-1',
    priority: 80,
    expectedInteractionMs: 8_000,
    prompt: '这里的政策利率指什么？',
    learningObjective: '区分政策利率和贷款利率',
    rationale: '口播首次引入核心概念',
    evidenceIds: ['e-1'],
    visualLoad: 'low',
    subSignals: { learningValue: 0.8, timeSensitivity: 0.5, interactionFit: 0.7 },
    ...overrides
  }
}

function candidateAt(candidateId: string, startMs: number, priority: number): TriggerCandidate {
  return candidate({
    candidateId,
    sourceEventId: `event-${candidateId}`,
    proposedStartMs: startMs,
    proposedEndMs: startMs + 5_000,
    priority
  })
}

describe('deterministic cue planner', () => {
  it('enforces evidence, safety and a 45-second gap', () => {
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
      { minGapMs: 45_000 }
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

  it('is deterministic across input orderings', () => {
    const input = [
      candidateAt('early', 0, 60),
      candidateAt('middle', 44_000, 100),
      candidateAt('late', 88_000, 60),
      candidateAt('latest', 133_000, 55)
    ]
    const expected = planCueCandidates(input)

    expect(planCueCandidates([...input].reverse())).toEqual(expected)
    expect(planCueCandidates([input[2], input[0], input[3], input[1]])).toEqual(expected)
  })

  it('keeps the higher-priority cue when candidates violate the minimum gap', () => {
    const result = planCueCandidates([
      candidate({ candidateId: 'earlier-lower', priority: 60, proposedStartMs: 10_000 }),
      candidate({
        candidateId: 'later-higher',
        priority: 90,
        proposedStartMs: 20_000,
        proposedEndMs: 26_000
      }),
      candidate({
        candidateId: 'same-priority-later',
        priority: 90,
        proposedStartMs: 30_000,
        proposedEndMs: 36_000
      })
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['later-higher'])
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { candidateId: 'earlier-lower', reason: 'MIN_GAP_VIOLATION' },
        { candidateId: 'same-priority-later', reason: 'MIN_GAP_VIOLATION' }
      ])
    )
  })

  it('plans a candidate regardless of its cue kind', () => {
    const result = planCueCandidates([
      candidate({ candidateId: 'flip', kind: 'counterexample_flip' })
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['flip'])
    expect(result.rejected).toEqual([])
  })

  it('maximizes total learning value instead of taking a central greedy winner', () => {
    const result = planCueCandidates([
      candidateAt('early-60', 0, 60),
      candidateAt('middle-100', 44_000, 100),
      candidateAt('late-60', 88_000, 60)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['early-60', 'late-60'])
    expect(result.accepted.reduce((total, item) => total + item.priority, 0)).toBe(120)
    expect(result.rejected).toContainEqual({
      candidateId: 'middle-100',
      reason: 'MIN_GAP_VIOLATION'
    })
  })

  it('prefers more cues when total learning value ties', () => {
    const result = planCueCandidates([
      candidateAt('early-50', 0, 50),
      candidateAt('middle-100', 44_000, 100),
      candidateAt('late-50', 88_000, 50)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['early-50', 'late-50'])
  })

  it('prefers the earlier time sequence when score and count tie', () => {
    const result = planCueCandidates([
      candidateAt('start-0', 0, 50),
      candidateAt('start-1', 1_000, 50),
      candidateAt('finish', 46_000, 50)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['start-0', 'finish'])
  })

  it('uses candidate ID as the final deterministic tie-break', () => {
    const result = planCueCandidates([candidateAt('cue-b', 0, 50), candidateAt('cue-a', 0, 50)])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['cue-a'])
  })

  it('accepts exactly 45-second spacing and rejects 44,999ms spacing', () => {
    const result = planCueCandidates([
      candidateAt('start', 0, 100),
      candidateAt('too-close', 44_999, 90),
      candidateAt('on-boundary', 45_000, 80)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual(['start', 'on-boundary'])
    expect(result.rejected).toContainEqual({
      candidateId: 'too-close',
      reason: 'MIN_GAP_VIOLATION'
    })
  })

  it('does not impose a separate automatic-cue cap below the content-node limit', () => {
    const result = planCueCandidates([
      candidateAt('cue-1', 0, 10),
      candidateAt('cue-2', 45_000, 20),
      candidateAt('cue-3', 90_000, 30),
      candidateAt('cue-4', 135_000, 40),
      candidateAt('cue-5', 180_000, 50)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual([
      'cue-1',
      'cue-2',
      'cue-3',
      'cue-4',
      'cue-5'
    ])
    expect(result.rejected).toEqual([])
  })

  it('keeps the optimal spaced set on dense candidates instead of collapsing to one', () => {
    // Regression from a real 110s video: 10 clustered events with rising priority
    // collapsed to a single survivor under start-time greedy with eviction. The
    // weighted interval selection must retain every cue in the best 45s-spaced plan.
    const dense = [5, 20, 50, 70, 95].map((seconds, index) =>
      candidate({
        candidateId: `dense-${seconds}s`,
        proposedStartMs: seconds * 1000,
        proposedEndMs: seconds * 1000 + 5000,
        priority: 50 + index * 10
      })
    )
    const result = planCueCandidates(dense, { minGapMs: 45_000 })

    expect(result.accepted.length).toBeGreaterThanOrEqual(3)
    expect(result.accepted.map((item) => item.candidateId)).toEqual([
      'dense-5s',
      'dense-50s',
      'dense-95s'
    ])
    const starts = result.accepted.map((item) => item.proposedStartMs)
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(45_000)
    }
  })

  it('accepts all six compatible cues', () => {
    const result = planCueCandidates(
      [
        candidateAt('cue-1', 0, 100),
        candidateAt('cue-2', 45_000, 90),
        candidateAt('cue-3', 90_000, 80),
        candidateAt('cue-4', 135_000, 70),
        candidateAt('cue-5', 180_000, 60),
        candidateAt('cue-6', 225_000, 50)
      ],
      { minGapMs: 45_000 }
    )
    expect(result.accepted.map((item) => item.candidateId)).toEqual([
      'cue-1',
      'cue-2',
      'cue-3',
      'cue-4',
      'cue-5',
      'cue-6'
    ])
    expect(result.rejected).toEqual([])
  })

  it('keeps the best six when a draft exceeds the content-node limit', () => {
    const result = planCueCandidates([
      candidateAt('cue-1', 0, 10),
      candidateAt('cue-2', 45_000, 20),
      candidateAt('cue-3', 90_000, 30),
      candidateAt('cue-4', 135_000, 40),
      candidateAt('cue-5', 180_000, 50),
      candidateAt('cue-6', 225_000, 60),
      candidateAt('cue-7', 270_000, 70)
    ])

    expect(result.accepted.map((item) => item.candidateId)).toEqual([
      'cue-2',
      'cue-3',
      'cue-4',
      'cue-5',
      'cue-6',
      'cue-7'
    ])
    expect(result.rejected).toEqual([{ candidateId: 'cue-1', reason: 'MAX_CONTENT_NODE_COUNT' }])
  })
})
