import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CaibaoHalfSheet from '../components/CaibaoHalfSheet.vue'
import CuePill from '../components/CuePill.vue'
import { financeFedExperience } from '../fixtures/finance-fed-v1'

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

describe('CuePill', () => {
  it('exposes an accessible compact POI and a separate later action', () => {
    const trigger = financeFedExperience.triggers[0]
    const wrapper = mount(CuePill, { props: { trigger }, attachTo: document.body })
    const poi = wrapper.get('[data-testid="finance-cue-pill"]')
    const main = wrapper.get('.cue-main')
    const later = wrapper.get('.later')

    expect(poi.attributes('data-compact-height')).toBe('44')
    expect(poi.attributes('data-max-width')).toBe('216')
    expect(main.attributes('aria-label')).toContain(trigger.cueLabel)
    expect(main.attributes('aria-label')).toContain(trigger.prompt)
    expect(later.attributes('aria-label')).toBe('稍后再看')
    wrapper.unmount()
  })
})
