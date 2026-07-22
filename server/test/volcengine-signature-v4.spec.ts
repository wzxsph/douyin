import { describe, expect, it } from 'vitest'
import { canonicalQuery, signVolcengineV4 } from '../src/providers/volcengine-signature-v4.js'

describe('Volcengine Signature V4', () => {
  it('matches the documented Volcengine signing algorithm for a fixed OCR request', () => {
    const body = new URLSearchParams({ image_base64: 'abc+/=' }).toString()
    const signature = signVolcengineV4({
      method: 'POST',
      pathname: '/',
      query: { Version: '2020-08-26', Action: 'OCRNormal' },
      body,
      host: 'visual.volcengineapi.com',
      contentType: 'application/x-www-form-urlencoded',
      region: 'cn-north-1',
      service: 'cv',
      credentials: {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'SECRETEXAMPLE'
      },
      now: new Date('2026-07-22T10:20:30.000Z')
    })

    expect(body).toBe('image_base64=abc%2B%2F%3D')
    expect(signature).toEqual({
      date: '20260722T102030Z',
      contentSha256: '6d365959cc0d1d08a58984c82cce6541a6fbe9630c4440f49d1f69b992895cbd',
      authorization:
        'HMAC-SHA256 Credential=AKIDEXAMPLE/20260722/cn-north-1/cv/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=a4376fcbac4cfa771a986ce91d6195b879478562e9c5a5c2432a7ff65502ca89'
    })
  })

  it('sorts and escapes canonical query parameters', () => {
    expect(canonicalQuery({ z: '空 格', punctuation: "!*'()", Action: 'OCRNormal' })).toBe(
      'Action=OCRNormal&punctuation=%21%2A%27%28%29&z=%E7%A9%BA%20%E6%A0%BC'
    )
  })
})
