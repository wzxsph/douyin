import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CaibaoHalfSheet from '../components/CaibaoHalfSheet.vue'

describe('CaibaoHalfSheet', () => {
  it('is a non-modal, no-backdrop sheet capped at 48 percent', async () => {
    const wrapper = mount(CaibaoHalfSheet, {
      props: { title: '测试触点' },
      slots: { default: '<button>继续</button>' },
      attachTo: document.body
    })
    const sheet = wrapper.get('[data-testid="caibao-half-sheet"]')
    expect(sheet.attributes('data-max-viewport-ratio')).toBe('0.48')
    expect(wrapper.find('.mask').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.get('button[aria-label="关闭"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
