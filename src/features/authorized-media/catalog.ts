import { z } from 'zod'
import defaultAuthorAvatar from '@/assets/img/avatar.png'
import { showcaseBundle } from '@/showcase/catalog'

export const AUTHORIZED_VIDEO_IDS = Object.freeze(
  showcaseBundle.catalog.map((item) => item.videoId)
)

const experienceByVideoId: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(showcaseBundle.catalog.map((item) => [item.videoId, item.financeExperienceId]))
)

const catalogItemSchema = z.object({
  videoId: z.string().min(1),
  financeExperienceId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  publishedAtObserved: z.string().min(1),
  aiGeneratedDisclosureObserved: z.boolean(),
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  derivativeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaUrl: z.string().regex(/^\/api\/finance\/v1\/media\/[A-Za-z0-9_-]+\/video$/),
  posterUrl: z.string().regex(/^\/api\/finance\/v1\/media\/[A-Za-z0-9_-]+\/poster$/)
})

export const authorizedMediaCatalogSchema = z
  .object({
    batchId: z.string().min(1).nullable(),
    status: z.enum(['ready', 'expired', 'invalid', 'derivative_missing']),
    expiresAt: z.string().min(1).nullable(),
    total: z.number().int().nonnegative(),
    items: z.array(catalogItemSchema),
    exclusions: z
      .array(
        z.object({
          videoId: z.string().optional(),
          reason: z.string().min(1)
        })
      )
      .default([])
  })
  .superRefine((catalog, context) => {
    const ids = new Set<string>()
    catalog.items.forEach((item, index) => {
      if (ids.has(item.videoId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Catalog video ids must be unique',
          path: ['items', index, 'videoId']
        })
      }
      ids.add(item.videoId)
      if (item.mediaUrl !== `/api/finance/v1/media/${item.videoId}/video`) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Catalog media URL must match its video id',
          path: ['items', index, 'mediaUrl']
        })
      }
      if (item.posterUrl !== `/api/finance/v1/media/${item.videoId}/poster`) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Catalog poster URL must match its video id',
          path: ['items', index, 'posterUrl']
        })
      }
    })
    if (catalog.total !== catalog.items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Catalog total must equal items.length',
        path: ['total']
      })
    }
  })

export type AuthorizedMediaCatalog = z.infer<typeof authorizedMediaCatalogSchema>
export type AuthorizedMediaCatalogItem = z.infer<typeof catalogItemSchema>

export interface CatalogLoadResult {
  catalog: AuthorizedMediaCatalog
  error?: string
}

function emptyCatalog(
  status: AuthorizedMediaCatalog['status'] = 'invalid'
): AuthorizedMediaCatalog {
  return {
    batchId: null,
    status,
    expiresAt: null,
    total: 0,
    items: [],
    exclusions: []
  }
}

function resolveApiUrl(url: string, normalizedBase: string) {
  if (!normalizedBase || !url.startsWith('/')) return url
  return `${normalizedBase}${url}`
}

export async function loadAuthorizedMediaCatalog(
  fetcher: typeof fetch = fetch,
  baseUrl = import.meta.env.VITE_FINANCE_API_BASE_URL || ''
): Promise<CatalogLoadResult> {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const controller = new AbortController()
  // A cold catalog load verifies source and derivative fingerprints plus ffprobe metadata.
  // The local catalog verifies source/derivative fingerprints and ffprobe metadata.
  // Keep startup fail-closed without racing a valid first inspection.
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetcher(`${normalizedBase}/api/finance/v1/media/catalog`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) {
      return { catalog: emptyCatalog(), error: `CATALOG_HTTP_${response.status}` }
    }
    const body = await response.json()
    const candidate = body?.data ?? body
    const parsed = authorizedMediaCatalogSchema.safeParse(candidate)
    if (!parsed.success) {
      return { catalog: emptyCatalog(), error: 'CATALOG_INVALID_RESPONSE' }
    }
    const allowed = new Set<string>(AUTHORIZED_VIDEO_IDS)
    const items = (parsed.data.status === 'ready' ? parsed.data.items : [])
      .filter(
        (item) =>
          allowed.has(item.videoId) &&
          Boolean(experienceByVideoId[item.videoId]) &&
          item.financeExperienceId === experienceByVideoId[item.videoId]
      )
      .map((item) => ({
        ...item,
        mediaUrl: resolveApiUrl(item.mediaUrl, normalizedBase),
        posterUrl: resolveApiUrl(item.posterUrl, normalizedBase)
      }))
    return {
      catalog: {
        ...parsed.data,
        total: items.length,
        items
      }
    }
  } catch {
    return { catalog: emptyCatalog(), error: 'CATALOG_UNAVAILABLE' }
  } finally {
    clearTimeout(timeout)
  }
}

export function toRecommendedVideo(item: AuthorizedMediaCatalogItem) {
  const duration = item.durationMs
  const authorId = `authorized:${item.author}`
  return {
    aweme_id: item.videoId,
    desc: item.title,
    duration,
    create_time: Math.floor(Date.parse(item.publishedAtObserved) / 1000) || 0,
    author_user_id: authorId,
    financeExperienceId: item.financeExperienceId,
    type: 'recommend-video',
    share_url: '',
    aiGeneratedDisclosureObserved: item.aiGeneratedDisclosureObserved,
    mediaFingerprint: item.sourceSha256,
    author: {
      uid: authorId,
      nickname: item.author,
      signature: '授权媒体 · 内部 PoC',
      avatar_168x168: { url_list: [defaultAuthorAvatar] },
      avatar_300x300: { url_list: [defaultAuthorAvatar] }
    },
    video: {
      duration,
      width: item.width,
      height: item.height,
      loop: false,
      poster: item.posterUrl,
      cover: {
        width: item.width,
        height: item.height,
        url_list: [item.posterUrl]
      },
      play_addr: {
        width: item.width,
        height: item.height,
        file_hash: item.derivativeSha256,
        url_list: [item.mediaUrl]
      }
    },
    statistics: {
      admire_count: 0,
      comment_count: 0,
      digg_count: 0,
      collect_count: 0,
      play_count: 0,
      share_count: 0
    },
    status: {
      is_reviewed: true,
      reviewed_result: 'internal_poc',
      is_prohibited: false
    }
  }
}

export function catalogEmptyMessage(catalog: AuthorizedMediaCatalog, error?: string) {
  if (catalog.status === 'expired') return '授权已到期，暂无可用授权视频'
  if (catalog.status === 'derivative_missing') return '授权视频尚未完成浏览器媒体准备'
  if (error) return '授权视频目录暂不可用'
  return '暂无可用授权视频'
}

export function buildAuthorizedRecommendationPage<T>(
  items: T[],
  start: number,
  pageSize: number,
  emptyMessage: string
) {
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0
  const safePageSize = Number.isFinite(pageSize) ? Math.max(0, Math.floor(pageSize)) : 0
  return {
    total: items.length,
    list: items.slice(safeStart, safeStart + safePageSize),
    emptyMessage: items.length ? '' : emptyMessage
  }
}
