import { describe, expect, it } from 'vitest'
import { buildSemanticTimeline, windowIdAt } from '../src/pipeline/semantic-timeline.js'
import type { OcrEvidence, Transcript } from '../src/domain/contracts.js'

function transcript(segments: Transcript['segments'] = []): Transcript {
  return {
    fullText: segments.map((segment) => segment.text).join(' '),
    segments
  }
}

const sampleSegments: Transcript['segments'] = [
  { evidenceId: 'asr-1', startMs: 2_000, endMs: 6_000, text: '政策利率', confidence: 0.9 },
  { evidenceId: 'asr-2', startMs: 10_000, endMs: 15_000, text: '贷款利率' }
]

const sampleOcr: OcrEvidence[] = [
  { evidenceId: 'ocr-1', frameId: 'f-1', timeMs: 4_000, text: '央行', confidence: 0.8 }
]

describe('semantic timeline', () => {
  it('produces sorted, non-overlapping windows clamped to [0, durationMs]', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript(sampleSegments),
      ocr: sampleOcr,
      durationMs: 20_000
    })

    expect(timeline.durationMs).toBe(20_000)
    expect(timeline.windows.length).toBeGreaterThan(0)

    let previousEnd = 0
    for (const window of timeline.windows) {
      expect(window.startMs).toBeGreaterThanOrEqual(0)
      expect(window.endMs).toBeLessThanOrEqual(20_000)
      expect(window.endMs).toBeGreaterThan(window.startMs)
      // sorted and non-overlapping: each window starts at or after the previous end
      expect(window.startMs).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = window.endMs
    }
  })

  it('tiles the full span so an utterance seeds a window with source utterance_gap', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript(sampleSegments),
      ocr: [],
      durationMs: 20_000
    })

    // the whole [0, durationMs] span is covered end to end
    expect(timeline.windows[0].startMs).toBe(0)
    expect(timeline.windows[timeline.windows.length - 1].endMs).toBe(20_000)

    const utteranceWindow = timeline.windows.find(
      (window) => window.startMs === 2_000 && window.endMs === 6_000
    )
    expect(utteranceWindow).toBeDefined()
    expect(utteranceWindow?.source).toBe('utterance_gap')
    expect(utteranceWindow?.windowId).toMatch(/^win-\d+$/)
  })

  it('maps an asr evidenceId to source asr with its ms range', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript(sampleSegments),
      ocr: sampleOcr,
      durationMs: 20_000
    })

    expect(timeline.evidenceIndex.get('asr-1')).toEqual({
      startMs: 2_000,
      endMs: 6_000,
      source: 'asr',
      confidence: 0.9
    })
    // confidence is optional on transcript segments
    expect(timeline.evidenceIndex.get('asr-2')).toEqual({
      startMs: 10_000,
      endMs: 15_000,
      source: 'asr',
      confidence: undefined
    })
  })

  it('maps an ocr evidenceId to source ocr at its timeMs', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript(sampleSegments),
      ocr: sampleOcr,
      durationMs: 20_000
    })

    expect(timeline.evidenceIndex.get('ocr-1')).toEqual({
      startMs: 4_000,
      endMs: 4_000,
      source: 'ocr',
      confidence: 0.8
    })
  })

  it('produces a single fixed window when there are no segments', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript([]),
      ocr: sampleOcr,
      durationMs: 12_000
    })

    expect(timeline.windows).toEqual([
      { windowId: 'win-0', startMs: 0, endMs: 12_000, source: 'fixed' }
    ])
    // OCR evidence is still indexed even without any utterances
    expect(timeline.evidenceIndex.get('ocr-1')?.source).toBe('ocr')
  })

  it('merges overlapping utterances so windows never overlap', () => {
    const overlapping: Transcript['segments'] = [
      { evidenceId: 'a', startMs: 1_000, endMs: 5_000, text: 'a' },
      { evidenceId: 'b', startMs: 3_000, endMs: 8_000, text: 'b' }
    ]
    const timeline = buildSemanticTimeline({
      transcript: transcript(overlapping),
      ocr: [],
      durationMs: 10_000
    })

    let previousEnd = 0
    for (const window of timeline.windows) {
      expect(window.startMs).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = window.endMs
    }
    // both utterances collapse into one merged window covering [1000, 8000]
    expect(
      timeline.windows.some((window) => window.startMs === 1_000 && window.endMs === 8_000)
    ).toBe(true)
  })

  it('is deterministic for identical input', () => {
    const input = {
      transcript: transcript(sampleSegments),
      ocr: sampleOcr,
      durationMs: 20_000
    }
    const first = buildSemanticTimeline(input)
    const second = buildSemanticTimeline(input)

    expect(first.windows).toEqual(second.windows)
    expect(first.durationMs).toBe(second.durationMs)
    expect(Array.from(first.evidenceIndex.entries())).toEqual(
      Array.from(second.evidenceIndex.entries())
    )
  })

  it('windowIdAt finds the containing window and returns null outside all windows', () => {
    const timeline = buildSemanticTimeline({
      transcript: transcript(sampleSegments),
      ocr: [],
      durationMs: 20_000
    })

    const midWindow = timeline.windows.find(
      (window) => 4_000 >= window.startMs && 4_000 < window.endMs
    )
    expect(windowIdAt(timeline, 4_000)).toBe(midWindow?.windowId)

    // start boundary is inclusive
    expect(windowIdAt(timeline, 0)).toBe(timeline.windows[0].windowId)
    // durationMs endpoint maps to the final window
    expect(windowIdAt(timeline, 20_000)).toBe(
      timeline.windows[timeline.windows.length - 1].windowId
    )
    // outside the media span → null
    expect(windowIdAt(timeline, 20_001)).toBeNull()
    expect(windowIdAt(timeline, -1)).toBeNull()
  })
})
