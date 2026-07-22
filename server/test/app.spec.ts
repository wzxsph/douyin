import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('analysis API', () => {
  it('exposes readiness without exposing credentials', async () => {
    const app = createApp({
      providerReadiness: () => ({
        provider: 'minimax',
        ready: false,
        missing: ['MINIMAX_API_KEY']
      }),
      analysisInputReadiness: () => ({
        ready: false,
        asr: { enabled: true, ready: false, missing: ['VOLC_ASR_API_KEY'] },
        ocr: { enabled: false, ready: true, missing: [] }
      }),
      mediaReadiness: async () => ({ ready: false, missing: ['ffmpeg', 'ffprobe'] }),
      profileProbe: { probe: async () => ({ status: 'dynamic_page_blocked' }) }
    } as never)

    const response = await request(app).get('/api/finance/v1/health').expect(200)
    expect(response.body.providers.missing).toEqual(['MINIMAX_API_KEY'])
    expect(response.body.analysisInputs.asr.ready).toBe(false)
    expect(JSON.stringify(response.body)).not.toContain('Bearer')
  })

  it('requires a rights-attested media asset before analysis', async () => {
    const app = createApp({
      providerReadiness: () => ({ provider: 'minimax', ready: true, missing: [] }),
      analysisInputReadiness: () => ({
        ready: true,
        asr: { enabled: true, ready: true, missing: [] },
        ocr: { enabled: false, ready: true, missing: [] }
      }),
      mediaReadiness: async () => ({ ready: true, missing: [] }),
      profileProbe: { probe: async () => ({ status: 'profile_visible' }) }
    } as never)

    const response = await request(app)
      .post('/api/finance/v1/analysis/jobs')
      .send({ sourceVideoRef: { shareUrl: 'https://www.douyin.com/video/1' } })
      .expect(409)

    expect(response.body.error.code).toBe('MEDIA_ASSET_REQUIRED')
  })
})
