import { describe, expect, it } from 'vitest'
import { financeFedExperience } from '../fixtures/finance-fed-v1'
import { advanceCueOrchestrator } from '../orchestrator'

describe('advanceCueOrchestrator', () => {
  it('surfaces a cue when playback crosses its start time', () => {
    const result = advanceCueOrchestrator({
      triggers: financeFedExperience.triggers,
      statuses: {},
      previousTimeMs: 14_900,
      currentTimeMs: 15_100,
      panelOpen: false
    })
    expect(result.surface?.triggerId).toBe('context-policy-rate')
    expect(result.missed).toEqual([])
  })

  it('collapses crossed cues to the timeline while a panel is open', () => {
    const result = advanceCueOrchestrator({
      triggers: financeFedExperience.triggers,
      statuses: {},
      previousTimeMs: 70_000,
      currentTimeMs: 140_000,
      panelOpen: true
    })
    expect(result.surface).toBeUndefined()
    expect(result.missed.map((trigger) => trigger.triggerId)).toEqual([
      'condition-growth',
      'stitch-financing'
    ])
  })

  it('does not fire again after a terminal status or after seeking backward', () => {
    const completed = advanceCueOrchestrator({
      triggers: financeFedExperience.triggers,
      statuses: { 'context-policy-rate': 'completed' },
      previousTimeMs: 14_000,
      currentTimeMs: 16_000,
      panelOpen: false
    })
    const backward = advanceCueOrchestrator({
      triggers: financeFedExperience.triggers,
      statuses: {},
      previousTimeMs: 80_000,
      currentTimeMs: 10_000,
      panelOpen: false
    })
    expect(completed.surface).toBeUndefined()
    expect(backward).toEqual({ missed: [] })
  })
})
