import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import FinanceCueExtension from '../components/FinanceCueExtension.vue'
import type { MediaClockState, VideoContext } from '@/features/video-extensions/contracts'

const context: VideoContext = {
  videoId: 'finance-fed-demo',
  financeExperienceId: 'finance-fed-v1',
  item: {},
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
  it('surfaces and expands a cue without mutating playback state', async () => {
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
    await wrapper.get('.cue-main').trigger('click')
    expect(wrapper.find('[data-testid="caibao-half-sheet"]').exists()).toBe(true)
    expect(wrapper.props('clock').paused).toBe(false)
    expect(wrapper.emitted('sheet-open-change')?.at(-1)).toEqual([true])
    wrapper.unmount()
  })
})
