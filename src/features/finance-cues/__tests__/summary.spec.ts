import { describe, expect, it } from 'vitest'
import type { CueSession, LearningTraceEvent, TraceAction } from '../contracts'
import { financeFedExperience } from '../fixtures/finance-fed-v1'
import { buildLearningSummary, latestActions } from '../summary'

function event(triggerId: string, action: TraceAction, sequence: number): LearningTraceEvent {
  return {
    eventId: 'event-' + sequence,
    sessionId: 'session-1',
    videoId: financeFedExperience.videoId,
    contentVersion: financeFedExperience.contentVersion,
    triggerId,
    action,
    playbackPositionMs: 15_000,
    occurredAt: sequence,
    evidenceIds: action === 'completed' ? ['e-rate-context'] : []
  }
}

describe('learning summary', () => {
  it('keeps completed evidence sticky after a revisit', () => {
    const session: CueSession = {
      sessionId: 'session-1',
      videoId: financeFedExperience.videoId,
      contentVersion: financeFedExperience.contentVersion,
      events: [
        event('context-policy-rate', 'completed', 1),
        event('context-policy-rate', 'revisited', 2)
      ]
    }
    expect(latestActions(session)['context-policy-rate']).toBe('completed')
    expect(buildLearningSummary(financeFedExperience, session).observed).toHaveLength(1)
  })

  it('reports only observed evidence and marks skipped cues without scoring', () => {
    const session: CueSession = {
      sessionId: 'session-1',
      videoId: financeFedExperience.videoId,
      contentVersion: financeFedExperience.contentVersion,
      events: [event('condition-growth', 'missed', 1)]
    }
    const summary = buildLearningSummary(financeFedExperience, session)
    expect(summary.observed).toEqual([])
    expect(summary.notObserved).toHaveLength(3)
    expect(summary).not.toHaveProperty('score')
  })
})
