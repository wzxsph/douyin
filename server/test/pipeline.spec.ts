import { describe, expect, it, vi } from 'vitest'
import { AnalysisPipeline } from '../src/pipeline/analyze-video.js'

describe('AnalysisPipeline', () => {
  it('fuses timestamped evidence into a draft that still requires human review', async () => {
    const pipeline = new AnalysisPipeline({
      media: {
        prepare: async () => ({
          durationMs: 120_000,
          fingerprint: 'sha256:test',
          audio: { path: '/work/audio.wav', format: 'wav' },
          frames: [{ frameId: 'frame-1', path: '/work/frame.jpg', timeMs: 10_000 }]
        })
      },
      asr: {
        transcribePreparedAudio: async () => ({
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
        })
      },
      ocr: {
        recognizeFrames: async () => [
          {
            evidenceId: 'ocr-1',
            frameId: 'frame-1',
            timeMs: 10_000,
            text: '政策利率',
            confidence: 0.95
          }
        ]
      },
      semantics: {
        analyze: async () => ({
          concepts: [
            { conceptId: 'policy-rate', name: '政策利率', evidenceIds: ['asr-1', 'ocr-1'] }
          ],
          claims: [],
          causalEdges: [],
          conditions: [],
          triggerCandidates: [
            {
              candidateId: 'cue-1',
              kind: 'context_card',
              proposedStartMs: 15_000,
              proposedEndMs: 21_000,
              priority: 80,
              expectedInteractionMs: 8_000,
              prompt: '这里降的是什么利率？',
              learningObjective: '识别政策利率',
              rationale: '首次出现概念',
              evidenceIds: ['asr-1', 'ocr-1'],
              confidence: 0.9,
              visualLoad: 'low'
            }
          ]
        })
      }
    })

    const result = await pipeline.run({
      jobId: 'job-1',
      asset: {
        assetId: 'asset-1',
        source: 'user_upload',
        localPath: '/safe/media/video.mp4',
        mimeType: 'video/mp4',
        rightsAttested: true,
        rightsAttestationId: 'attestation-1'
      },
      title: '测试视频'
    })

    expect(result.publishStatus).toBe('draft')
    expect(result.blockers).toContain('HUMAN_REVIEW_REQUIRED')
    expect(result.approvedTriggers).toHaveLength(0)
    expect(result.triggerCandidates).toHaveLength(1)
    expect(result.evidence.map((item) => item.evidenceId)).toEqual(['asr-1', 'ocr-1'])
  })

  it('rejects analysis when media rights are not attested', async () => {
    const pipeline = new AnalysisPipeline({} as never)
    await expect(
      pipeline.run({
        jobId: 'job-2',
        asset: {
          assetId: 'asset-2',
          source: 'user_upload',
          localPath: '/safe/media/video.mp4',
          mimeType: 'video/mp4',
          rightsAttested: false
        },
        title: 'no rights'
      })
    ).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_NOT_ATTESTED' })
  })

  it('rejects ASR evidence that extends beyond the media duration', async () => {
    const recognizeFrames = vi.fn(async () => [])
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
          segments: [
            {
              evidenceId: 'asr-outside',
              startMs: 900,
              endMs: 1_200,
              text: '越界字幕'
            }
          ]
        })
      },
      ocr: { recognizeFrames },
      semantics: { analyze: vi.fn() }
    })

    await expect(
      pipeline.run({
        jobId: 'job-outside',
        asset: {
          assetId: 'asset-outside',
          source: 'user_upload',
          localPath: '/safe/media/video.mp4',
          mimeType: 'video/mp4',
          rightsAttested: true,
          rightsAttestationId: 'attestation-outside'
        },
        title: '越界时间测试'
      })
    ).rejects.toMatchObject({ code: 'ASR_TIMELINE_OUTSIDE_MEDIA' })
    expect(recognizeFrames).not.toHaveBeenCalled()
  })
})
