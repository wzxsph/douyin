import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VolcengineOcrClient } from '../src/providers/volcengine-ocr.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('VolcengineOcrClient', () => {
  it('sends a signed, urlencoded OCRNormal request and returns timestamped evidence', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'caibao-ocr-'))
    tempDirectories.push(directory)
    const framePath = path.join(directory, 'frame.jpg')
    await writeFile(framePath, Buffer.from('test-frame'))
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://visual.volcengineapi.com')
      expect(url.searchParams.get('Action')).toBe('OCRNormal')
      expect(url.searchParams.get('Version')).toBe('2020-08-26')
      expect(new Headers(init?.headers).get('authorization')).toContain(
        'SignedHeaders=content-type;host;x-content-sha256;x-date'
      )
      expect(String(init?.body)).toContain('image_base64=')
      return new Response(
        JSON.stringify({ Result: { line_texts: ['政策利率'], line_probs: [98] } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    const client = new VolcengineOcrClient({
      accessKeyId: 'test-ak',
      secretAccessKey: 'test-sk',
      fetcher
    })

    const evidence = await client.recognizeFrames([
      { frameId: 'frame-000001', path: framePath, timeMs: 8_000 }
    ])

    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ text: '政策利率', timeMs: 8_000, confidence: 0.98 })
  })

  it('rejects OCR text whose provider confidence is missing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'caibao-ocr-'))
    tempDirectories.push(directory)
    const framePath = path.join(directory, 'frame.jpg')
    await writeFile(framePath, Buffer.from('test-frame'))
    const client = new VolcengineOcrClient({
      accessKeyId: 'test-ak',
      secretAccessKey: 'test-sk',
      invoke: async () => ({ Result: { line_texts: ['没有置信度'] } })
    })

    await expect(
      client.recognizeFrames([{ frameId: 'frame-000002', path: framePath, timeMs: 16_000 }])
    ).resolves.toEqual([])
  })
})
