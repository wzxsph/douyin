import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTHORIZED_VIDEO_IDS } from '@/features/authorized-media/catalog'
import { axiosInstance } from '@/utils/request'
import { startMock } from '@/mock'

vi.mock('@/utils', () => ({
  _fetch: vi.fn(),
  _notice: vi.fn(),
  cloneDeep: <T>(value: T): T => JSON.parse(JSON.stringify(value))
}))
vi.mock('@/store/pinia', () => ({
  useBaseStore: () => ({ users: [] })
}))

const experienceIds = AUTHORIZED_VIDEO_IDS.map((videoId) => `finance-showcase-${videoId}`)

function catalogItem(videoId: string, index: number) {
  return {
    videoId,
    financeExperienceId: experienceIds[index],
    title: `授权视频 ${index + 1}`,
    author: '小Lin说',
    publishedAtObserved: '2026-07-21 06:59',
    aiGeneratedDisclosureObserved: false,
    durationMs: 180_000 + index,
    width: 1080,
    height: 1920,
    sourceSha256: (index + 1).toString(16).padStart(64, '0'),
    derivativeSha256: (index + 101).toString(16).padStart(64, '0'),
    mediaUrl: `/api/finance/v1/media/${videoId}/video`,
    posterUrl: `/api/finance/v1/media/${videoId}/poster`
  }
}

function stubCatalog(items: unknown[], status = 'ready') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            batchId: 'authorized-batch',
            status,
            expiresAt: '2026-08-22T23:59:59.999+08:00',
            total: items.length,
            items,
            exclusions: []
          })
      } as Response)
    )
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('manifest-only recommendation feeds', () => {
  it('returns the same manifest-backed ids for normal and long-video feeds', async () => {
    stubCatalog(AUTHORIZED_VIDEO_IDS.map(catalogItem))
    await startMock()

    const recommended = await axiosInstance.get('/video/recommended', {
      params: { start: 0, pageSize: AUTHORIZED_VIDEO_IDS.length }
    })
    const longRecommended = await axiosInstance.get('/video/long/recommended/', {
      params: { pageNo: 0, pageSize: AUTHORIZED_VIDEO_IDS.length }
    })

    for (const response of [recommended, longRecommended]) {
      expect(response.data.total).toBe(AUTHORIZED_VIDEO_IDS.length)
      expect(response.data.list.map((item: { aweme_id: string }) => item.aweme_id)).toEqual(
        AUTHORIZED_VIDEO_IDS
      )
      expect(JSON.stringify(response.data)).not.toMatch(/finance-real-venezuela|videos\.md/)
    }
  })

  it('fails closed to an explicit empty state and never restores the legacy pool', async () => {
    stubCatalog([], 'expired')
    await startMock()

    const response = await axiosInstance.get('/video/recommended', {
      params: { start: 0, pageSize: 10 }
    })

    expect(response.data).toMatchObject({
      total: 0,
      list: [],
      emptyMessage: expect.stringContaining('授权已到期')
    })
  })

  it('returns an empty comment list for ids outside the verified set', async () => {
    stubCatalog(AUTHORIZED_VIDEO_IDS.map(catalogItem))
    await startMock()

    const response = await axiosInstance.get('/video/comments', {
      params: { id: 'legacy-or-unknown-video' }
    })

    expect(response.data).toEqual([])
  })
})
