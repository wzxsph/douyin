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
