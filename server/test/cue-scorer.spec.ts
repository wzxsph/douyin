import { describe, expect, it } from 'vitest'
import {
  EVENT_KIND_MAP,
  WEIGHT_TABLE_VERSION,
  kindForEvent,
  scoreEvents
} from '../src/pipeline/cue-scorer.js'
import type {
  EvidenceIndexEntry,
  SemanticEvent,
  SemanticEventType,
  SemanticTimeline
} from '../src/domain/contracts.js'

function event(overrides: Partial<SemanticEvent> = {}): SemanticEvent {
  return {
    eventId: 'ev-1',
    type: 'concept_first_mention',
    timeMs: 10_000,
    windowId: 'win-0',
    refs: { conceptIds: [], edgeIds: [], conditionIds: [], claimIds: [] },
    evidenceIds: ['asr-1'],
    subSignals: { learningValue: 0.5, timeSensitivity: 0.5, interactionFit: 0.5 },
    ...overrides
  }
}

function timeline(overrides: Partial<SemanticTimeline> = {}): SemanticTimeline {
  const evidenceIndex = new Map<string, EvidenceIndexEntry>([
    ['asr-1', { startMs: 9_000, endMs: 11_000, source: 'asr', confidence: 0.9 }],
    ['ocr-1', { startMs: 9_500, endMs: 9_500, source: 'ocr', confidence: 0.8 }]
  ])
  return {
    durationMs: 120_000,
    windows: [{ windowId: 'win-0', startMs: 0, endMs: 20_000, source: 'utterance_gap' }],
    evidenceIndex,
    ...overrides
  }
}

describe('deterministic cue scorer', () => {
  it('maps every semantic event type to its cue kind', () => {
    const types: SemanticEventType[] = [
      'concept_first_mention',
      'causal_jump',
      'condition_boundary',
      'directional_claim',
      'counterexample_window',
      'concept_confusion'
    ]

    for (const type of types) {
      expect(EVENT_KIND_MAP[type]).toBeDefined()
      expect(kindForEvent(type)).toBe(EVENT_KIND_MAP[type])
    }

    expect(Object.keys(EVENT_KIND_MAP)).toHaveLength(6)
    expect(EVENT_KIND_MAP.concept_first_mention).toBe('context_card')
    expect(EVENT_KIND_MAP.causal_jump).toBe('causal_stitch')
    expect(EVENT_KIND_MAP.condition_boundary).toBe('condition_slider')
    expect(EVENT_KIND_MAP.directional_claim).toBe('quick_judgment')
    expect(EVENT_KIND_MAP.counterexample_window).toBe('counterexample_flip')
    expect(EVENT_KIND_MAP.concept_confusion).toBe('concept_compare')
  })

  it('reports the versioned weight table it scored with', () => {
    const result = scoreEvents([event()], timeline())
    expect(result.weightTableVersion).toBe(WEIGHT_TABLE_VERSION)
  })

  it('derives a candidate whose fields track the source event', () => {
    const [candidate] = scoreEvents([event()], timeline()).candidates

    expect(candidate.candidateId).toBe('cue-ev-1')
    expect(candidate.sourceEventId).toBe('ev-1')
    expect(candidate.kind).toBe('context_card')
    expect(candidate.windowId).toBe('win-0')
    expect(candidate.proposedStartMs).toBe(10_000)
    expect(candidate.proposedEndMs).toBeGreaterThan(candidate.proposedStartMs)
    expect(candidate.evidenceIds).toEqual(['asr-1'])
    expect(candidate.subSignals).toEqual(event().subSignals)
    expect(candidate.prompt.length).toBeLessThanOrEqual(40)
    expect(candidate.learningObjective.length).toBeGreaterThan(0)
    expect(candidate.expectedInteractionMs).toBeLessThanOrEqual(12_000)
  })

  it('produces an integer priority within [0, 100]', () => {
    const { candidates } = scoreEvents(
      [
        event({
          eventId: 'lo',
          subSignals: { learningValue: 0, timeSensitivity: 0, interactionFit: 0 }
        }),
        event({
          eventId: 'hi',
          subSignals: { learningValue: 1, timeSensitivity: 1, interactionFit: 1 }
        })
      ],
      timeline()
    )

    for (const candidate of candidates) {
      expect(Number.isInteger(candidate.priority)).toBe(true)
      expect(candidate.priority).toBeGreaterThanOrEqual(0)
      expect(candidate.priority).toBeLessThanOrEqual(100)
    }
  })

  it('scores an event with no evidence below an identical, well-evidenced one', () => {
    const withEvidence = event({ eventId: 'strong', evidenceIds: ['asr-1', 'ocr-1'] })
    const withoutEvidence = event({ eventId: 'weak', evidenceIds: [] })

    const strong = scoreEvents([withEvidence], timeline()).candidates[0]
    const weak = scoreEvents([withoutEvidence], timeline()).candidates[0]

    expect(weak.priority).toBeLessThan(strong.priority)
  })

  it('is deterministic for identical input', () => {
    const events = [
      event({ eventId: 'a', timeMs: 10_000 }),
      event({ eventId: 'b', type: 'causal_jump', timeMs: 70_000 })
    ]
    const first = scoreEvents(events, timeline())
    const second = scoreEvents(events, timeline())

    expect(first.candidates).toEqual(second.candidates)
    expect(first.weightTableVersion).toBe(second.weightTableVersion)
  })

  it('never lowers priority when sub-signals rise for the same event type', () => {
    const lowSignals = event({
      eventId: 'low',
      subSignals: { learningValue: 0.2, timeSensitivity: 0.2, interactionFit: 0.2 }
    })
    const highSignals = event({
      eventId: 'high',
      subSignals: { learningValue: 0.9, timeSensitivity: 0.9, interactionFit: 0.9 }
    })

    const low = scoreEvents([lowSignals], timeline()).candidates[0]
    const high = scoreEvents([highSignals], timeline()).candidates[0]

    expect(high.priority).toBeGreaterThanOrEqual(low.priority)
  })
})
