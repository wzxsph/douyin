import { describe, expect, it } from 'vitest'
import routes from '@/router/routes'
import {
  authorBySlug,
  itemsByAuthor,
  publicShowcaseVideoIds,
  resolveShowcaseAssetUrl,
  showcaseBundle,
  showcaseExperiences
} from '@/showcase/catalog'

describe('public showcase catalog', () => {
  it('publishes exactly ten manifest items with source attribution', () => {
    expect(showcaseBundle.catalog).toHaveLength(10)
    expect(new Set(showcaseBundle.catalog.map((item) => item.videoId)).size).toBe(10)
    expect(showcaseBundle.catalog.map((item) => item.videoId)).toEqual(publicShowcaseVideoIds)
    expect(
      showcaseBundle.catalog.every((item) =>
        item.sourceUrl.startsWith('https://www.douyin.com/video/')
      )
    ).toBe(true)
    expect(
      showcaseBundle.catalog.every((item) => item.financeExperienceId in showcaseExperiences)
    ).toBe(true)
  })

  it('resolves the Pages media directory against the current deployment path', () => {
    expect(
      resolveShowcaseAssetUrl(
        '7664748624454192393.mp4',
        './media/',
        'https://wzxsph.github.io/douyin/index.html'
      )
    ).toBe('https://wzxsph.github.io/douyin/media/7664748624454192393.mp4')
  })

  it('keeps author inventories complete and separate from the Caibao identity', () => {
    expect(authorBySlug('xiaolin')?.name).toBe('小Lin说')
    expect(itemsByAuthor('xiaolin')).toHaveLength(5)
    expect(authorBySlug('dalu-xing-lu')?.name).toBe('大陆姓陆')
    expect(itemsByAuthor('dalu-xing-lu')).toHaveLength(5)
    expect(showcaseBundle.catalog.some((item) => /财包/i.test(item.author))).toBe(false)
  })

  it('marks every generated experience as mock/internal PoC and allows more than four cues', () => {
    expect(
      showcaseBundle.experiences.every(
        (experience) =>
          experience.publishStatus === 'internal_poc' &&
          experience.generation?.mode === 'mock' &&
          experience.triggers.every((trigger) => trigger.reviewStatus === 'mock')
      )
    ).toBe(true)
    expect(showcaseBundle.experiences.some((experience) => experience.triggers.length > 4)).toBe(
      true
    )
  })

  it('exposes only recommendation and author product routes', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '/',
      '/home',
      '/author/:authorSlug',
      '/:pathMatch(.*)*'
    ])
  })
})
