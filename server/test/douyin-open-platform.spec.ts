import { describe, expect, it, vi } from 'vitest'
import { DouyinOpenPlatformClient } from '../src/sources/douyin-open-platform.js'

describe('DouyinOpenPlatformClient', () => {
  it('lists only an OAuth-authorized account and preserves pagination', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/video/list/')
      expect(url.searchParams.get('open_id')).toBe('open-user')
      expect(init?.headers).toMatchObject({ 'access-token': 'secret-test-token' })
      return new Response(
        JSON.stringify({
          data: {
            error_code: 0,
            cursor: 20,
            has_more: true,
            list: [
              {
                title: '降息路径',
                item_id: 'item-1',
                video_id: 'video-1',
                share_url: 'https://www.douyin.com/video/1',
                cover: 'https://example.invalid/cover.jpg',
                create_time: 100,
                statistics: { play_count: 10, digg_count: 2 }
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    const client = new DouyinOpenPlatformClient({ fetcher })

    const page = await client.listAuthorizedVideos({
      accessToken: 'secret-test-token',
      openId: 'open-user',
      cursor: 0,
      count: 20
    })

    expect(page.cursor).toBe(20)
    expect(page.hasMore).toBe(true)
    expect(page.videos[0]).toMatchObject({
      itemId: 'item-1',
      externalVideoId: 'video-1',
      mediaAvailability: 'metadata_only'
    })
    expect(page.videos[0]).not.toHaveProperty('mediaUrl')
  })
})
