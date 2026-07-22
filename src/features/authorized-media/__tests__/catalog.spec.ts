import { describe, expect, it, vi } from 'vitest'
import {
  AUTHORIZED_VIDEO_IDS,
  buildAuthorizedRecommendationPage,
  catalogEmptyMessage,
  loadAuthorizedMediaCatalog,
  toRecommendedVideo
} from '../catalog'

const item = {
  videoId: AUTHORIZED_VIDEO_IDS[0],
  financeExperienceId: `finance-showcase-${AUTHORIZED_VIDEO_IDS[0]}`,
  title: 'FIFA 的生意',
  author: '小Lin说',
  publishedAtObserved: '2026-07-21 06:59',
  aiGeneratedDisclosureObserved: false,
  durationMs: 173710,
  width: 1080,
  height: 1920,
  sourceSha256: 'a'.repeat(64),
  derivativeSha256: 'b'.repeat(64),
  mediaUrl: `/api/finance/v1/media/${AUTHORIZED_VIDEO_IDS[0]}/video`,
  posterUrl: `/api/finance/v1/media/${AUTHORIZED_VIDEO_IDS[0]}/poster`
}

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response)
}

describe('authorized media catalog', () => {
  it('keeps only explicit manifest-backed ids and normalizes total', async () => {
    const fetcher = vi.fn(() =>
      response({
        batchId: 'batch-1',
        status: 'ready',
        expiresAt: '2026-08-22',
        total: 3,
        items: [
          item,
          {
            ...item,
            videoId: 'legacy-video',
            financeExperienceId: 'finance-xiaolin-legacy',
            mediaUrl: '/api/finance/v1/media/legacy-video/video',
            posterUrl: '/api/finance/v1/media/legacy-video/poster'
          },
          {
            ...item,
            videoId: AUTHORIZED_VIDEO_IDS[1],
            financeExperienceId: 'finance-xiaolin-wrong',
            mediaUrl: `/api/finance/v1/media/${AUTHORIZED_VIDEO_IDS[1]}/video`,
            posterUrl: `/api/finance/v1/media/${AUTHORIZED_VIDEO_IDS[1]}/poster`
          }
        ],
        exclusions: []
      })
    ) as unknown as typeof fetch
    const result = await loadAuthorizedMediaCatalog(fetcher, 'http://127.0.0.1:18787/')
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:18787/api/finance/v1/media/catalog',
      expect.any(Object)
    )
    expect(result.catalog.items.map((entry) => entry.videoId)).toEqual([AUTHORIZED_VIDEO_IDS[0]])
    expect(result.catalog.total).toBe(1)
    expect(result.catalog.items[0].mediaUrl).toBe(
      `http://127.0.0.1:18787/api/finance/v1/media/${AUTHORIZED_VIDEO_IDS[0]}/video`
    )
  })

  it('fails closed for network and schema errors', async () => {
    const unavailable = await loadAuthorizedMediaCatalog(
      vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      ''
    )
    expect(unavailable.catalog.items).toEqual([])
    expect(unavailable.error).toBe('CATALOG_UNAVAILABLE')

    const invalid = await loadAuthorizedMediaCatalog(
      vi.fn(() => response({ items: [{ videoId: 'legacy' }] })) as unknown as typeof fetch,
      ''
    )
    expect(invalid.catalog.items).toEqual([])
    expect(invalid.error).toBe('CATALOG_INVALID_RESPONSE')

    const missingManifest = await loadAuthorizedMediaCatalog(
      vi.fn(() =>
        response({
          batchId: null,
          status: 'invalid',
          expiresAt: null,
          total: 0,
          items: [],
          exclusions: [{ code: 'MANIFEST_NOT_FOUND', reason: 'manifest unavailable' }]
        })
      ) as unknown as typeof fetch,
      ''
    )
    expect(missingManifest.catalog.items).toEqual([])
    expect(missingManifest.error).toBeUndefined()
  })

  it('rejects duplicate ids and media URLs that do not match the catalog item', async () => {
    for (const items of [
      [item, { ...item }],
      [{ ...item, mediaUrl: 'https://example.com/untrusted.mp4' }],
      [{ ...item, mediaUrl: `/api/finance/v1/media/another-id/video` }]
    ]) {
      const result = await loadAuthorizedMediaCatalog(
        vi.fn(() =>
          response({
            batchId: 'batch-1',
            status: 'ready',
            expiresAt: '2026-08-22T23:59:59.999+08:00',
            total: items.length,
            items,
            exclusions: []
          })
        ) as unknown as typeof fetch,
        ''
      )
      expect(result.catalog.items).toEqual([])
      expect(result.error).toBe('CATALOG_INVALID_RESPONSE')
    }
  })

  it('adapts only observed metadata without fabricated engagement counts', () => {
    const video = toRecommendedVideo(item)
    expect(video.aweme_id).toBe(AUTHORIZED_VIDEO_IDS[0])
    expect(video.financeExperienceId).toBe(`finance-showcase-${AUTHORIZED_VIDEO_IDS[0]}`)
    expect(video.duration).toBe(item.durationMs)
    expect(video.video.cover.url_list).toEqual([item.posterUrl])
    expect(video.video.play_addr.url_list).toEqual([item.mediaUrl])
    expect(video.statistics).toMatchObject({ digg_count: 0, comment_count: 0, share_count: 0 })
    expect(video.author.avatar_168x168.url_list[0]).not.toContain('caibao')
  })

  it('returns an explicit empty-state reason', () => {
    expect(
      catalogEmptyMessage({
        batchId: 'batch-1',
        status: 'expired',
        expiresAt: '2026-08-22',
        total: 0,
        items: [],
        exclusions: []
      })
    ).toContain('授权已到期')
  })

  it('discards items from a non-ready catalog even if the server response is inconsistent', async () => {
    const fetcher = vi.fn(() =>
      response({
        batchId: 'batch-1',
        status: 'expired',
        expiresAt: '2026-08-22T23:59:59.999+08:00',
        total: 1,
        items: [item],
        exclusions: [{ code: 'AUTHORIZED_MEDIA_RIGHTS_EXPIRED', reason: 'expired' }]
      })
    ) as unknown as typeof fetch

    const result = await loadAuthorizedMediaCatalog(fetcher, '')
    expect(result.catalog.items).toEqual([])
    expect(result.catalog.total).toBe(0)
  })

  it('paginates only the provided allowlist and reports the exact total', () => {
    const videos = AUTHORIZED_VIDEO_IDS.map((videoId) => ({ videoId }))
    expect(buildAuthorizedRecommendationPage(videos, 1, 2, 'empty')).toEqual({
      total: AUTHORIZED_VIDEO_IDS.length,
      list: [{ videoId: AUTHORIZED_VIDEO_IDS[1] }, { videoId: AUTHORIZED_VIDEO_IDS[2] }],
      emptyMessage: ''
    })
    expect(buildAuthorizedRecommendationPage([], 0, 10, '暂无可用授权视频')).toEqual({
      total: 0,
      list: [],
      emptyMessage: '暂无可用授权视频'
    })
  })
})
