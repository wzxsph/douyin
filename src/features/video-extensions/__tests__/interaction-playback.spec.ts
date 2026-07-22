import { describe, expect, it, vi } from 'vitest'
import { createInteractionPlaybackController } from '../interaction-playback'

function media(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    paused: false,
    ended: false,
    currentTime: 12.345,
    muted: true,
    volume: 0.37,
    playbackRate: 1.25,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as HTMLVideoElement
}

const pauseRequest = {
  type: 'pause-for-interaction' as const,
  interactionId: 'cue-1'
}

describe('interaction playback controller', () => {
  it('captures the real media state and pauses exactly once without changing media settings', () => {
    const target = media()
    const controller = createInteractionPlaybackController(
      () => target,
      () => 'video-1'
    )

    const first = controller.pauseForInteraction(pauseRequest)
    const second = controller.pauseForInteraction(pauseRequest)

    expect(first).toEqual({
      interactionId: 'cue-1',
      videoId: 'video-1',
      wasPlayingBeforeInteraction: true,
      pausePositionMs: 12_345
    })
    expect(second).toEqual(first)
    expect(target.pause).toHaveBeenCalledTimes(1)
    expect(target.currentTime).toBe(12.345)
    expect(target.muted).toBe(true)
    expect(target.volume).toBe(0.37)
    expect(target.playbackRate).toBe(1.25)
  })

  it('restores only a previously playing media element and is idempotent', async () => {
    const target = media()
    const controller = createInteractionPlaybackController(
      () => target,
      () => 'video-1'
    )
    controller.pauseForInteraction(pauseRequest)
    Object.defineProperty(target, 'paused', { configurable: true, value: true })

    const request = {
      type: 'release-interaction' as const,
      interactionId: 'cue-1',
      reason: 'closed' as const,
      allowResume: true
    }
    await controller.releaseInteraction(request)
    await controller.releaseInteraction(request)

    expect(target.play).toHaveBeenCalledTimes(1)
    expect(target.currentTime).toBe(12.345)
    expect(target.volume).toBe(0.37)
  })

  it('does not resume when the video was paused, ended, changed, or disposed', async () => {
    const pausedTarget = media({ paused: true })
    const pausedController = createInteractionPlaybackController(
      () => pausedTarget,
      () => 'video-1'
    )
    pausedController.pauseForInteraction(pauseRequest)
    await pausedController.releaseInteraction({
      type: 'release-interaction',
      interactionId: 'cue-1',
      reason: 'closed',
      allowResume: true
    })
    expect(pausedTarget.pause).not.toHaveBeenCalled()
    expect(pausedTarget.play).not.toHaveBeenCalled()

    const endedTarget = media()
    const endedController = createInteractionPlaybackController(
      () => endedTarget,
      () => 'video-1'
    )
    endedController.pauseForInteraction(pauseRequest)
    Object.defineProperties(endedTarget, {
      paused: { configurable: true, value: true },
      ended: { configurable: true, value: true }
    })
    await endedController.releaseInteraction({
      type: 'release-interaction',
      interactionId: 'cue-1',
      reason: 'completed',
      allowResume: true
    })
    expect(endedTarget.play).not.toHaveBeenCalled()

    let videoId = 'video-1'
    const changedTarget = media()
    const changedController = createInteractionPlaybackController(
      () => changedTarget,
      () => videoId
    )
    changedController.pauseForInteraction(pauseRequest)
    videoId = 'video-2'
    await changedController.releaseInteraction({
      type: 'release-interaction',
      interactionId: 'cue-1',
      reason: 'context-change',
      allowResume: true
    })
    expect(changedTarget.play).not.toHaveBeenCalled()

    const disposedTarget = media()
    const disposedController = createInteractionPlaybackController(
      () => disposedTarget,
      () => 'video-1'
    )
    disposedController.pauseForInteraction(pauseRequest)
    disposedController.dispose()
    await disposedController.releaseInteraction({
      type: 'release-interaction',
      interactionId: 'cue-1',
      reason: 'unmounted',
      allowResume: true
    })
    expect(disposedTarget.play).not.toHaveBeenCalled()
  })
})
