import { describe, expect, it } from 'vitest'
import {
  analysisInputReadiness,
  assertAnalysisProviderReady,
  loadRuntimeConfig,
  providerReadiness
} from '../src/config/env.js'

describe('runtime config', () => {
  it('loads safe defaults without requiring an unused provider key', () => {
    const config = loadRuntimeConfig({ ANALYSIS_PROVIDER: 'minimax' })

    expect(config.analysisProvider).toBe('minimax')
    expect(config.apiHost).toBe('127.0.0.1')
    expect(config.minimax.baseUrl).toBe('https://api.minimaxi.com/v1')
    expect(config.ark.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3')
    expect(config.minimax.multimodalModel).toBe('')
    expect(config.mediaImportRoot).toMatch(/media-import$/)
    expect(config.authorizedDouyinManifest).toMatch(
      /media-import\/authorized-douyin\/download-manifest\.json$/
    )
    expect(config.authorizedMediaRoot).toMatch(/\.analysis-work\/showcase-media$/)
  })

  it('reports mandatory ASR and optional OCR credentials independently', () => {
    const missing = analysisInputReadiness(loadRuntimeConfig({}))
    expect(missing.ready).toBe(false)
    expect(missing.asr.ready).toBe(false)
    expect(missing.ocr.ready).toBe(true)

    const ready = analysisInputReadiness(
      loadRuntimeConfig({
        VOLC_ASR_API_KEY: 'test-only',
        VOLC_OCR_ENABLED: 'true',
        VOLC_ACCESS_KEY_ID: 'test-ak',
        VOLC_SECRET_ACCESS_KEY: 'test-sk'
      })
    )
    expect(ready.ready).toBe(true)
  })

  it('reports missing selected-provider values without leaking values', () => {
    const minimax = loadRuntimeConfig({ ANALYSIS_PROVIDER: 'minimax', MINIMAX_API_KEY: '' })
    expect(providerReadiness(minimax)).toEqual({
      provider: 'minimax',
      ready: false,
      missing: ['MINIMAX_API_KEY']
    })
    try {
      assertAnalysisProviderReady(minimax)
      throw new Error('expected readiness assertion to fail')
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROVIDER_CONFIG_INVALID' })
    }

    const doubao = loadRuntimeConfig({
      ANALYSIS_PROVIDER: 'doubao',
      ARK_API_KEY: 'test-only',
      ARK_MODEL: 'ep-test'
    })
    expect(providerReadiness(doubao).ready).toBe(true)
  })
})
