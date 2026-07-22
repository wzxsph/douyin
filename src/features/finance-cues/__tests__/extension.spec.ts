import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import FinanceCueExtension from '../components/FinanceCueExtension.vue'
import type { MediaClockState, VideoContext } from '@/features/video-extensions/contracts'

const context: VideoContext = {
  videoId: 'finance-fed-demo',
  financeExperienceId: 'finance-fed-v1',
  item: { mediaFingerprint: 'finance-real-venezuela' },
  position: { uniqueId: 'home', index: 0 }
}

function clock(currentTimeMs: number): MediaClockState {
  return {
    currentTimeMs,
    durationMs: 212_442,
    paused: false,
    muted: true,
    seeking: false,
    ended: false,
    playbackRate: 1
  }
}

describe('FinanceCueExtension', () => {
  it('fails closed when the video id or media fingerprint does not match the content package', async () => {
    for (const mismatchedContext of [
      { ...context, videoId: 'another-video' },
      { ...context, item: { mediaFingerprint: 'another-cut' } }
    ]) {
      const wrapper = mount(FinanceCueExtension, {
        props: { context: mismatchedContext, clock: clock(15_100) },
        global: { plugins: [createPinia()] }
      })
      await flushPromises()
      expect(wrapper.find('[data-testid="finance-cue-extension"]').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('keeps the invitation passive, then requests pause and release around the interaction', async () => {
    localStorage.clear()
    const wrapper = mount(FinanceCueExtension, {
      props: { context, clock: clock(0) },
      global: { plugins: [createPinia()] },
      attachTo: document.body
    })
    await flushPromises()
    await wrapper.setProps({ clock: clock(15_100) })
    await flushPromises()

    expect(wrapper.find('[data-testid="finance-cue-pill"]').exists()).toBe(true)
    expect(wrapper.emitted('pause-for-interaction')).toBeUndefined()
    await wrapper.get('.cue-main').trigger('click')
    expect(wrapper.find('[data-testid="caibao-half-sheet"]').exists()).toBe(true)
    expect(wrapper.emitted('pause-for-interaction')).toEqual([
      [
        expect.objectContaining({
          type: 'pause-for-interaction',
          interactionId: expect.stringContaining('context-policy-rate')
        })
      ]
    ])
    expect(wrapper.emitted('sheet-open-change')?.at(-1)).toEqual([true])

    await wrapper.get('button[aria-label="关闭"]').trigger('click')
    expect(wrapper.emitted('release-interaction')?.at(-1)).toEqual([
      expect.objectContaining({
        type: 'release-interaction',
        interactionId: expect.stringContaining('context-policy-rate'),
        reason: 'closed',
        allowResume: true
      })
    ])
    wrapper.unmount()
  })

  it('releases the interaction with a typed skipped reason', async () => {
    localStorage.clear()
    const wrapper = mount(FinanceCueExtension, {
      props: { context, clock: clock(0) },
      global: { plugins: [createPinia()] }
    })
    await flushPromises()
    await wrapper.setProps({ clock: clock(15_100) })
    await flushPromises()
    await wrapper.get('.cue-main').trigger('click')
    await wrapper.get('[data-testid="finance-skip-interaction"]').trigger('click')

    expect(wrapper.emitted('release-interaction')?.at(-1)).toEqual([
      expect.objectContaining({ reason: 'skipped', allowResume: true })
    ])
    expect(wrapper.find('[data-testid="caibao-half-sheet"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
