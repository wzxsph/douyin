import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { financeFedExperience } from '../fixtures/finance-fed-v1'
import { useFinanceCueStore } from '../session-store'

describe('finance cue session store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('persists and restores a session by video and content version', () => {
    const firstStore = useFinanceCueStore()
    const session = firstStore.hydrate(financeFedExperience)
    firstStore.record(financeFedExperience, {
      triggerId: 'context-policy-rate',
      action: 'completed',
      playbackPositionMs: 15_123,
      evidenceIds: ['e-rate-context']
    })

    setActivePinia(createPinia())
    const restored = useFinanceCueStore().hydrate(financeFedExperience)
    expect(restored.sessionId).toBe(session.sessionId)
    expect(restored.events[0].playbackPositionMs).toBe(15_123)
  })

  it('is idempotent for completed evidence', () => {
    const store = useFinanceCueStore()
    for (let index = 0; index < 2; index += 1) {
      store.record(financeFedExperience, {
        triggerId: 'context-policy-rate',
        action: 'completed',
        playbackPositionMs: 15_000,
        evidenceIds: ['e-rate-context']
      })
    }
    expect(store.hydrate(financeFedExperience).events).toHaveLength(1)
  })
})
