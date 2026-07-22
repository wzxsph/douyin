import { describe, expect, it, vi } from 'vitest'
import {
  DouyinPublicProfileProbe,
  normalizeDouyinProfileUrl
} from '../src/sources/douyin-public-profile.js'

const profileUrl =
  'https://www.douyin.com/user/MS4wLjABAAAAunpkE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pI_GYBVR-Pv23uFyfMPB_9I?from_tab_name=main'

describe('DouyinPublicProfileProbe', () => {
  it('normalizes a profile URL and strips tracking query parameters', () => {
    expect(normalizeDouyinProfileUrl(profileUrl)).toBe(
      'https://www.douyin.com/user/MS4wLjABAAAAunpkE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pI_GYBVR-Pv23uFyfMPB_9I'
    )
  })

  it('does not turn a 200 JavaScript risk shell into an empty successful profile', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('<html><head></head><body></body><script>_$jsvmprt("x")</script></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
    )
    const probe = new DouyinPublicProfileProbe(fetcher)

    const result = await probe.probe(profileUrl)

    expect(result.status).toBe('dynamic_page_blocked')
    expect(result.canEnumerateWorks).toBe(false)
    expect(result.sourceUrl).not.toContain('?')
  })

  it('extracts only verifiable public profile metadata', async () => {
    const html = `<!doctype html><title>小Lin说的抖音 - 抖音</title><body>
      <script>{"nickname":"小Lin说","unique_id":"lindsay.zou","aweme_count":532}</script>
    </body>`
    const probe = new DouyinPublicProfileProbe(async () => new Response(html, { status: 200 }))

    const result = await probe.probe(profileUrl)

    expect(result).toMatchObject({
      status: 'profile_visible',
      nickname: '小Lin说',
      uniqueId: 'lindsay.zou',
      workCount: 532,
      canEnumerateWorks: false
    })
  })

  it('rejects unsupported hosts before any request', async () => {
    const fetcher = vi.fn()
    const probe = new DouyinPublicProfileProbe(fetcher)

    await expect(probe.probe('https://evil.example/user/abc')).rejects.toMatchObject({
      code: 'SOURCE_URL_UNSUPPORTED'
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
