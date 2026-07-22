import { describe, expect, it, vi } from 'vitest'
import { VolcengineFlashAsrClient } from '../src/providers/volcengine-asr.js'

describe('VolcengineFlashAsrClient', () => {
  it('sends the flash ASR contract and returns millisecond transcript segments', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'X-Api-Key': 'asr-test-key',
        'X-Api-Resource-Id': 'volc.bigasr.auc_turbo',
        'X-Api-Sequence': '-1'
      })
      const body = JSON.parse(String(init?.body))
      expect(body.audio.url).toBe('https://media.example/audio.wav')
      return new Response(
        JSON.stringify({
          result: {
            text: '政策利率下降。',
            utterances: [
              { start_time: 100, end_time: 900, text: '政策利率下降。', confidence: 0.98 }
            ]
          }
        }),
        { status: 200, headers: { 'X-Api-Status-Code': '20000000' } }
      )
    })
    const client = new VolcengineFlashAsrClient({ apiKey: 'asr-test-key', fetcher })

    const transcript = await client.transcribe({
      audioUrl: 'https://media.example/audio.wav',
      format: 'wav',
      userId: 'job-test'
    })

    expect(transcript.fullText).toBe('政策利率下降。')
    expect(transcript.segments[0]).toMatchObject({ startMs: 100, endMs: 900 })
    expect(transcript.segments[0].evidenceId).toMatch(/^asr-/)
  })
})
