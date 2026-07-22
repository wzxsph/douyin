import { defineStore } from 'pinia'
import type { ApprovedExperience, CueSession, LearningTraceEvent, TraceAction } from './contracts'

const STORAGE_PREFIX = 'caibao-cue-session:'

function createId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return prefix + '-' + suffix
}

function storageKey(videoId: string, contentVersion: string): string {
  return STORAGE_PREFIX + videoId + ':' + contentVersion
}

export const useFinanceCueStore = defineStore('finance-cues', {
  state: () => ({
    sessions: {} as Record<string, CueSession>
  }),
  actions: {
    hydrate(experience: ApprovedExperience): CueSession {
      const key = storageKey(experience.videoId, experience.contentVersion)
      if (this.sessions[key]) return this.sessions[key]

      const raw = localStorage.getItem(key)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CueSession
          if (
            parsed.videoId === experience.videoId &&
            parsed.contentVersion === experience.contentVersion &&
            Array.isArray(parsed.events)
          ) {
            this.sessions[key] = parsed
            return parsed
          }
        } catch {
          localStorage.removeItem(key)
        }
      }

      const session: CueSession = {
        sessionId: createId('session'),
        videoId: experience.videoId,
        contentVersion: experience.contentVersion,
        events: []
      }
      this.sessions[key] = session
      this.persist(session)
      return session
    },
    record(
      experience: ApprovedExperience,
      input: {
        triggerId: string
        action: TraceAction
        playbackPositionMs: number
        response?: string
        evidenceIds?: string[]
      }
    ): LearningTraceEvent {
      const session = this.hydrate(experience)
      const event: LearningTraceEvent = {
        eventId: createId('event'),
        sessionId: session.sessionId,
        videoId: session.videoId,
        contentVersion: session.contentVersion,
        triggerId: input.triggerId,
        action: input.action,
        playbackPositionMs: Math.max(0, Math.round(input.playbackPositionMs)),
        occurredAt: Date.now(),
        response: input.response,
        evidenceIds: input.evidenceIds || []
      }

      const duplicate = session.events.some(
        (existing) =>
          existing.triggerId === event.triggerId &&
          existing.action === event.action &&
          event.action === 'completed'
      )
      if (!duplicate) session.events.push(event)
      this.persist(session)
      return event
    },
    persist(session: CueSession): void {
      localStorage.setItem(
        storageKey(session.videoId, session.contentVersion),
        JSON.stringify(session)
      )
    },
    clear(experience: ApprovedExperience): void {
      const key = storageKey(experience.videoId, experience.contentVersion)
      delete this.sessions[key]
      localStorage.removeItem(key)
    }
  }
})
