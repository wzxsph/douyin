import { z } from 'zod'
import { AppError } from '../domain/errors.js'

const rawVideoSchema = z.object({
  title: z.string().optional().default(''),
  item_id: z.string().optional(),
  video_id: z.string().optional(),
  share_url: z.string().url(),
  cover: z.string().optional(),
  create_time: z.number().optional(),
  statistics: z
    .object({
      play_count: z.number().optional(),
      digg_count: z.number().optional(),
      comment_count: z.number().optional(),
      share_count: z.number().optional()
    })
    .optional()
})

const responseSchema = z.object({
  data: z.object({
    error_code: z.number(),
    description: z.string().optional(),
    cursor: z.number().default(0),
    has_more: z.boolean().default(false),
    list: z.array(rawVideoSchema).default([])
  })
})

export interface AuthorizedVideoPage {
  cursor: number
  hasMore: boolean
  videos: Array<{
    provider: 'douyin'
    externalVideoId?: string
    itemId?: string
    title: string
    shareUrl: string
    coverUrl?: string
    publishedAt?: string
    statistics?: {
      playCount?: number
      diggCount?: number
      commentCount?: number
      shareCount?: number
    }
    mediaAvailability: 'metadata_only'
    authorizationMode: 'oauth'
  }>
}

export class DouyinOpenPlatformClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
    const endpoint = new URL(options.baseUrl ?? 'https://open.douyin.com')
    if (endpoint.protocol !== 'https:') {
      throw new AppError(
        'SOURCE_ENDPOINT_INVALID',
        'Douyin Open Platform endpoint must use HTTPS',
        {
          status: 500
        }
      )
    }
    this.baseUrl = endpoint.toString()
    this.fetcher = options.fetcher ?? fetch
  }

  async listAuthorizedVideos(input: {
    accessToken: string
    openId: string
    cursor?: number
    count?: number
  }): Promise<AuthorizedVideoPage> {
    if (!input.accessToken || !input.openId) {
      throw new AppError(
        'SOURCE_AUTHORIZATION_REQUIRED',
        'OAuth access token and open_id are required',
        {
          status: 401
        }
      )
    }
    const count = Math.min(20, Math.max(1, input.count ?? 20))
    const url = new URL('/video/list/', this.baseUrl)
    url.searchParams.set('open_id', input.openId)
    url.searchParams.set('cursor', String(input.cursor ?? 0))
    url.searchParams.set('count', String(count))

    const response = await this.fetcher(url, {
      headers: { 'access-token': input.accessToken },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) {
      throw new AppError('SOURCE_FETCH_FAILED', 'Douyin Open Platform request failed', {
        status: 502,
        details: { status: response.status }
      })
    }
    const parsed = responseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new AppError(
        'SOURCE_SEMANTIC_RESPONSE_INVALID',
        'Unexpected Douyin Open Platform response',
        {
          status: 502
        }
      )
    }
    if (parsed.data.data.error_code !== 0) {
      throw new AppError('SOURCE_OPEN_API_ERROR', 'Douyin Open Platform returned an error', {
        status: 502,
        details: {
          errorCode: parsed.data.data.error_code,
          description: parsed.data.data.description
        }
      })
    }

    return {
      cursor: parsed.data.data.cursor,
      hasMore: parsed.data.data.has_more,
      videos: parsed.data.data.list.map((video) => ({
        provider: 'douyin' as const,
        ...(video.video_id ? { externalVideoId: video.video_id } : {}),
        ...(video.item_id ? { itemId: video.item_id } : {}),
        title: video.title,
        shareUrl: video.share_url,
        ...(video.cover ? { coverUrl: video.cover } : {}),
        ...(video.create_time
          ? { publishedAt: new Date(video.create_time * 1000).toISOString() }
          : {}),
        ...(video.statistics
          ? {
              statistics: {
                playCount: video.statistics.play_count,
                diggCount: video.statistics.digg_count,
                commentCount: video.statistics.comment_count,
                shareCount: video.statistics.share_count
              }
            }
          : {}),
        mediaAvailability: 'metadata_only' as const,
        authorizationMode: 'oauth' as const
      }))
    }
  }
}
