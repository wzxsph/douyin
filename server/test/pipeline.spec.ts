import { describe, expect, it, vi } from 'vitest'
import { AnalysisPipeline } from '../src/pipeline/analyze-video.js'
import type { SemanticGraph } from '../src/domain/contracts.js'
import { AppError } from '../src/domain/errors.js'
import type { AuthoredPayload } from '../src/domain/payload-contracts.js'

const asset = {
  assetId: 'asset-1',
  source: 'user_upload' as const,
  localPath: '/safe/media/video.mp4',
  mimeType: 'video/mp4',
  rightsAttested: true,
  rightsAttestationId: 'attestation-1'
}

const preparedMedia = {
  durationMs: 120_000,
  fingerprint: 'sha256:testfingerprint',
  audio: { path: '/work/audio.wav', format: 'wav' as const },
  frames: [{ frameId: 'frame-1', path: '/work/frame.jpg', timeMs: 10_000 }]
}

const transcript = {
  fullText: '央行下调政策利率。',
  segments: [
    {
      evidenceId: 'asr-1',
      startMs: 9_000,
      endMs: 12_000,
      text: '央行下调政策利率。',
      confidence: 0.98
    }
  ]
}

const ocr = [
  { evidenceId: 'ocr-1', frameId: 'frame-1', timeMs: 10_000, text: '政策利率', confidence: 0.95 }
]

function conceptGraph(): SemanticGraph {
  return {
    concepts: [{ conceptId: 'policy-rate', name: '政策利率', evidenceIds: ['asr-1', 'ocr-1'] }],
    claims: [],
    causalEdges: [],
    conditions: [],
    semanticEvents: [
      {
        eventId: 'ev-1',
        type: 'concept_first_mention',
        timeMs: 15_000,
        windowId: 'win-1',
        refs: { conceptIds: ['policy-rate'], edgeIds: [], conditionIds: [], claimIds: [] },
        evidenceIds: ['asr-1', 'ocr-1'],
        subSignals: { learningValue: 0.9, timeSensitivity: 0.5, interactionFit: 0.8 }
      }
    ]
  }
}

const contextPayload: AuthoredPayload['payload'] = {
  title: '政策利率不是所有利率的开关',
  body: '央行调整的是政策工具利率，市场融资成本还要经过传导。',
  keyPoint: '降息影响的是资金价格起点，不代表所有融资成本立刻同步下降。',
  feedback: '你补上了传导起点：政策利率先变，融资条件再逐步响应。'
}

describe('AnalysisPipeline (staged)', () => {
  it('produces a human-review draft plus a coverage report', async () => {
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: {
        extract: async () => conceptGraph(),
        repair: async () => conceptGraph()
      },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    const { draft, coverageReport } = await pipeline.run({
      jobId: 'job-1',
      asset,
      title: '测试视频'
    })

    expect(draft.publishStatus).toBe('draft')
    expect(draft.blockers).toContain('HUMAN_REVIEW_REQUIRED')
    expect(draft.approvedTriggers).toHaveLength(0)
    expect(draft.evidence.map((item) => item.evidenceId)).toEqual(['asr-1', 'ocr-1'])
    // context_card is renderable → authored payload attached.
    expect(draft.triggerCandidates).toHaveLength(1)
    expect(draft.triggerCandidates[0].kind).toBe('context_card')
    expect(draft.triggerCandidates[0].payload).toMatchObject({ title: contextPayload.title })
    // coverage report is shaped and versioned.
    expect(coverageReport.coverage.concepts.total).toBe(1)
    expect(coverageReport.coverage.concepts.coveredByAcceptedCue).toBe(1)
    expect(coverageReport.versions.weightTableVersion).toBe('cue-weights.v1')
    expect(coverageReport.versions.ruleEngineVersion).toBe('direction-rules.v1')
    expect(coverageReport.kindBalance.context_card).toBe(1)
  })

  it('uses the first valid semantic extraction without retrying', async () => {
    const extract = vi.fn().mockResolvedValueOnce(conceptGraph())
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract, repair: async () => conceptGraph() },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    await pipeline.run({ jobId: 'job-first-extract', asset, title: '首次抽取成功' })

    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('retries schema-invalid extraction at most twice before succeeding', async () => {
    const extract = vi
      .fn()
      .mockRejectedValueOnce(
        new AppError('PROVIDER_INVALID_RESPONSE', 'invalid structured output', { status: 502 })
      )
      .mockRejectedValueOnce(
        new AppError('PROVIDER_INVALID_RESPONSE', 'still invalid structured output', {
          status: 502
        })
      )
      .mockResolvedValueOnce(conceptGraph())
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract, repair: async () => conceptGraph() },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    const { draft } = await pipeline.run({ jobId: 'job-retry', asset, title: '抽取重试' })

    expect(extract).toHaveBeenCalledTimes(3)
    expect(draft.triggerCandidates).toHaveLength(1)
  })

  it('fails after the initial extraction plus two schema-invalid retries', async () => {
    const invalidResponse = new AppError('PROVIDER_INVALID_RESPONSE', 'invalid structured output', {
      status: 502
    })
    const extract = vi.fn().mockRejectedValue(invalidResponse)
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract, repair: async () => conceptGraph() },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    await expect(
      pipeline.run({ jobId: 'job-retry-exhausted', asset, title: '抽取重试耗尽' })
    ).rejects.toBe(invalidResponse)
    expect(extract).toHaveBeenCalledTimes(3)
  })

  it('does not retry extraction failures outside PROVIDER_INVALID_RESPONSE', async () => {
    const providerFailure = new AppError('PROVIDER_UNAVAILABLE', 'provider unavailable', {
      status: 503
    })
    const extract = vi.fn().mockRejectedValue(providerFailure)
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract, repair: async () => conceptGraph() },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    await expect(
      pipeline.run({ jobId: 'job-non-retryable', asset, title: '不可重试错误' })
    ).rejects.toBe(providerFailure)
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('repairs an evidence-invalid graph within the bounded loop', async () => {
    const badFirst: SemanticGraph = {
      ...conceptGraph(),
      concepts: [{ conceptId: 'policy-rate', name: '政策利率', evidenceIds: ['ghost-evidence'] }]
    }
    const extract = vi.fn(async () => badFirst)
    // First repair fixes the evidence reference back to a known id.
    const repair = vi.fn(async () => conceptGraph())

    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract, repair },
      payloadAuthor: { author: async () => ({ payload: contextPayload }) }
    })

    const { draft } = await pipeline.run({ jobId: 'job-repair', asset, title: '修复测试' })

    expect(extract).toHaveBeenCalledTimes(1)
    expect(repair).toHaveBeenCalled()
    // After a successful repair the concept is valid and covered.
    expect(draft.concepts[0].evidenceIds).toEqual(['asr-1', 'ocr-1'])
    expect(draft.rejectedTriggerCandidates.every((r) => r.reason !== 'REPAIR_EXHAUSTED')).toBe(true)
  })

  it('surfaces a rule-engine insufficient direction in the coverage report', async () => {
    // A directional-claim event → quick_judgment. Its direction has no rule-table
    // signature, so the rule engine returns insufficient; authoring proceeds
    // (all six kinds render) but must consume the locked insufficient direction.
    const directionalGraph: SemanticGraph = {
      concepts: [],
      claims: [{ claimId: 'c-fx', statement: '美元走向取决于相对利差', evidenceIds: ['asr-1'] }],
      causalEdges: [],
      conditions: [],
      semanticEvents: [
        {
          eventId: 'ev-fx',
          type: 'directional_claim',
          timeMs: 20_000,
          windowId: 'win-1',
          refs: { conceptIds: [], edgeIds: [], conditionIds: [], claimIds: ['c-fx'] },
          evidenceIds: ['asr-1'],
          subSignals: { learningValue: 0.7, timeSensitivity: 0.9, interactionFit: 0.6 }
        }
      ]
    }
    const quickJudgmentPayload = {
      title: '美元一定走弱吗？',
      options: [
        { id: 'a', label: '未必，取决于相对利差', result: '相对利差决定汇率方向。' },
        { id: 'b', label: '一定走弱', result: '这是绝对化判断。' }
      ],
      feedback: '汇率取决于相对利差与预期差。'
    }
    const author = vi.fn(async (_input: { direction?: { direction: string } }) => ({
      payload: quickJudgmentPayload
    }))
    const pipeline = new AnalysisPipeline({
      media: { prepare: async () => preparedMedia },
      asr: { transcribePreparedAudio: async () => transcript },
      ocr: { recognizeFrames: async () => ocr },
      semantics: { extract: async () => directionalGraph, repair: async () => directionalGraph },
      payloadAuthor: { author }
    })

    const { draft, coverageReport } = await pipeline.run({
      jobId: 'job-fx',
      asset,
      title: '方向测试'
    })

    // quick_judgment is renderable now → authored with the LOCKED insufficient direction.
    expect(author).toHaveBeenCalledTimes(1)
    expect(author.mock.calls[0][0].direction?.direction).toBe('insufficient')
    expect(draft.triggerCandidates[0].kind).toBe('quick_judgment')
    expect(draft.triggerCandidates[0].payload).toMatchObject({ title: quickJudgmentPayload.title })
    // direction resolved by rules to insufficient → a review decision exists.
    const resolution = coverageReport.directionResolutions.find(
      (r) => r.candidateId === 'cue-ev-fx'
    )
    expect(resolution?.direction).toBe('insufficient')
    expect(coverageReport.reviewDecisionsRequired.some((line) => line.includes('方向待裁定'))).toBe(
      true
    )
    // All six kinds render now, so no non-renderable review line is produced.
    expect(
      coverageReport.reviewDecisionsRequired.some((line) => line.includes('非可渲染触点'))
    ).toBe(false)
  })

  it('rejects analysis when media rights are not attested', async () => {
    const pipeline = new AnalysisPipeline({} as never)
    await expect(
      pipeline.run({
        jobId: 'job-2',
        asset: { ...asset, rightsAttested: false, rightsAttestationId: undefined },
        title: 'no rights'
      })
    ).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_NOT_ATTESTED' })
  })

  it('rejects ASR evidence that extends beyond the media duration', async () => {
    const recognizeFrames = vi.fn(async () => [])
    const extract = vi.fn()
    const pipeline = new AnalysisPipeline({
      media: {
        prepare: async () => ({
          durationMs: 1_000,
          fingerprint: 'sha256:test',
          audio: { path: '/work/audio.wav', format: 'wav' },
          frames: []
        })
      },
      asr: {
        transcribePreparedAudio: async () => ({
          fullText: '越界字幕',
          segments: [{ evidenceId: 'asr-outside', startMs: 900, endMs: 1_200, text: '越界字幕' }]
        })
      },
      ocr: { recognizeFrames },
      semantics: { extract, repair: vi.fn() },
      payloadAuthor: { author: vi.fn() }
    })

    await expect(
      pipeline.run({
        jobId: 'job-outside',
        asset: { ...asset, assetId: 'asset-outside' },
        title: '越界时间测试'
      })
    ).rejects.toMatchObject({ code: 'ASR_TIMELINE_OUTSIDE_MEDIA' })
    expect(recognizeFrames).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
  })
})
