import type {
  InteractionPlaybackSnapshot,
  PauseForInteractionRequest,
  ReleaseInteractionRequest
} from './contracts'

export interface InteractionPlaybackController {
  pauseForInteraction: (request: PauseForInteractionRequest) => InteractionPlaybackSnapshot | null
  releaseInteraction: (request: ReleaseInteractionRequest) => Promise<boolean>
  cancel: () => void
  dispose: () => void
}

/**
 * Owns the temporary pause created by a Caibao interaction. It deliberately
 * never writes currentTime or any audio/rate setting.
 */
export function createInteractionPlaybackController(
  getMedia: () => HTMLVideoElement | undefined,
  getVideoId: () => string
): InteractionPlaybackController {
  let active: InteractionPlaybackSnapshot | null = null
  let disposed = false

  return {
    pauseForInteraction(request) {
      if (disposed) return null
      if (active) return active.interactionId === request.interactionId ? active : null

      const media = getMedia()
      if (!media) return null

      active = {
        interactionId: request.interactionId,
        videoId: getVideoId(),
        wasPlayingBeforeInteraction: !media.paused && !media.ended,
        pausePositionMs: Math.max(0, Math.round((Number(media.currentTime) || 0) * 1000))
      }
      if (active.wasPlayingBeforeInteraction) media.pause()
      return active
    },

    async releaseInteraction(request) {
      if (disposed || !active || active.interactionId !== request.interactionId) return false

      const snapshot = active
      active = null
      const media = getMedia()
      if (
        !request.allowResume ||
        !snapshot.wasPlayingBeforeInteraction ||
        !media ||
        media.ended ||
        snapshot.videoId !== getVideoId() ||
        !media.paused
      ) {
        return false
      }

      try {
        await media.play()
        return true
      } catch {
        return false
      }
    },

    cancel() {
      active = null
    },

    dispose() {
      disposed = true
      active = null
    }
  }
}
