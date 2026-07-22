import { AppError } from '../domain/errors.js'

const allowedHosts = new Set(['douyin.com', 'www.douyin.com'])
const maxHtmlBytes = 2 * 1024 * 1024

export interface DouyinProfileProbeResult {
  status: 'profile_visible' | 'dynamic_page_blocked' | 'unexpected_html'
  sourceUrl: string
  fetchedAt: string
  nickname?: string
  uniqueId?: string
  workCount?: number
  canEnumerateWorks: false
  nextStep: 'creator_oauth_or_authorized_media_upload'
}
export function normalizeDouyinProfileUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch (error) {
    throw new AppError('SOURCE_URL_UNSUPPORTED', 'Source URL is invalid', { cause: error })
  }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new AppError('SOURCE_URL_UNSUPPORTED', 'Only HTTPS Douyin profile URLs are accepted')
  }
  const match = url.pathname.match(/^\/user\/([A-Za-z0-9_-]{20,200})\/?$/)
  if (!match) {
    throw new AppError('SOURCE_URL_UNSUPPORTED', 'Expected a Douyin /user/:secUid URL')
  }
  return `https://www.douyin.com/user/${match[1]}`
}

function decodeJsonString(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string
  } catch {
    return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
  }
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeJsonString(match[1])
  }
  return undefined
}

export class DouyinPublicProfileProbe {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async probe(inputUrl: string): Promise<DouyinProfileProbeResult> {
    const sourceUrl = normalizeDouyinProfileUrl(inputUrl)
    const response = await this.fetcher(sourceUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
      },
      signal: AbortSignal.timeout(10_000)
    })
    if (response.status >= 300 && response.status < 400) {
      throw new AppError('SOURCE_REDIRECT_REJECTED', 'Unexpected source redirect', {
        status: 502,
        details: { status: response.status }
      })
    }
    if (!response.ok) {
      throw new AppError('SOURCE_FETCH_FAILED', 'Douyin profile request failed', {
        status: 502,
        details: { status: response.status }
      })
    }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxHtmlBytes) {
      throw new AppError(
        'SOURCE_RESPONSE_TOO_LARGE',
        'Profile response is larger than the safety limit',
        {
          status: 502
        }
      )
    }
    const html = await response.text()
    if (Buffer.byteLength(html) > maxHtmlBytes) {
      throw new AppError(
        'SOURCE_RESPONSE_TOO_LARGE',
        'Profile response is larger than the safety limit',
        {
          status: 502
        }
      )
    }

    const nickname = firstMatch(html, [
      /"nickname"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /<title>\s*([^<]+?)的抖音\s*-\s*抖音\s*<\/title>/i
    ])
    const uniqueId = firstMatch(html, [
      /"unique_id"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"uniqueId"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/
    ])
    const workCountText = firstMatch(html, [
      /"aweme_count"\s*:\s*(\d+)/,
      /"awemeCount"\s*:\s*(\d+)/,
      /作品\s*(\d{1,9})/
    ])
    const workCount = workCountText ? Number(workCountText) : undefined
    const emptyBody = /<body[^>]*>\s*<\/body>/i.test(html)
    const dynamicShell = html.includes('_$jsvmprt') || (emptyBody && !nickname && !uniqueId)

    return {
      status:
        nickname || uniqueId
          ? 'profile_visible'
          : dynamicShell
            ? 'dynamic_page_blocked'
            : 'unexpected_html',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      ...(nickname ? { nickname } : {}),
      ...(uniqueId ? { uniqueId } : {}),
      ...(Number.isFinite(workCount) ? { workCount } : {}),
      canEnumerateWorks: false,
      nextStep: 'creator_oauth_or_authorized_media_upload'
    }
  }
}
