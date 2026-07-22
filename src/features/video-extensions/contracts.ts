import type { Component } from 'vue'

export interface MediaClockState {
  currentTimeMs: number
  durationMs: number
  paused: boolean
  muted: boolean
  seeking: boolean
  ended: boolean
  playbackRate: number
}

export interface VideoContext {
  videoId: string
  financeExperienceId?: string
  item: Record<string, any>
  position: {
    uniqueId?: string
    index?: number
  }
}

export interface VideoExtensionDefinition {
  key: string
  priority: number
  match: (context: VideoContext) => boolean
  component: Component
}

export interface PauseForInteractionRequest {
  type: 'pause-for-interaction'
  interactionId: string
}

export type InteractionExitReason =
  | 'completed'
  | 'skipped'
  | 'closed'
  | 'context-change'
  | 'unmounted'

export interface ReleaseInteractionRequest {
  type: 'release-interaction'
  interactionId: string
  reason: InteractionExitReason
  allowResume: boolean
}

export interface InteractionPlaybackSnapshot {
  interactionId: string
  videoId: string
  wasPlayingBeforeInteraction: boolean
  pausePositionMs: number
}
