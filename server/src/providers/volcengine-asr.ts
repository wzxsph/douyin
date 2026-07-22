import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { Transcript } from '../domain/contracts.js'
import { transcriptSchema } from '../domain/contracts.js'
import { AppError } from '../domain/errors.js'

export interface VolcengineFlashAsrOptions {
  endpoint?: string
  resourceId?: string
  apiKey?: string
  appId?: string
  accessToken?: string
  timeoutMs?: number
  maxAudioMb?: number
  maxBase64AudioMb?: number
  fetcher?: typeof fetch
}

export interface FlashAsrInput {
  audioUrl?: string
  audioDataBase64?: string
  format: 'wav' | 'mp3' | 'ogg'
  userId: string
}

function evidenceId(startMs: number, endMs: number, text: string): string {
  return `asr-${createHash('sha256').update(`${startMs}:${endMs}:${text}`).digest('hex').slice(0, 16)}`
}

export class VolcengineFlashAsrClient {
  private readonly endpoint: string
  private readonly resourceId: string
  private readonly timeoutMs: number
  private readonly maxAudioMb: number
  private readonly maxBase64AudioMb: number
  private readonly fetcher: typeof fetch

  constructor(private readonly options: VolcengineFlashAsrOptions) {
    const endpoint = new URL(
      options.endpoint ?? 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
    )
    if (endpoint.protocol !== 'https:') {
      throw new AppError('PROVIDER_ENDPOINT_INVALID', 'Volcengine ASR endpoint must use HTTPS', {
        status: 500
      })
    }
    this.endpoint = endpoint.toString()
    this.resourceId = options.resourceId ?? 'volc.bigasr.auc_turbo'
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.maxAudioMb = options.maxAudioMb ?? 100
    this.maxBase64AudioMb = options.maxBase64AudioMb ?? 20
    this.fetcher = options.fetcher ?? fetch
  }

  async transcribe(input: FlashAsrInput): Promise<Transcript> {
    if (Boolean(input.audioUrl) === Boolean(input.audioDataBase64)) {
      throw new AppError('ASR_INPUT_INVALID', 'Provide exactly one of audioUrl or audioDataBase64')
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': this.resourceId,
      'X-Api-Request-Id': randomUUID(),
      'X-Api-Sequence': '-1'
    }
    if (this.options.apiKey) {
      headers['X-Api-Key'] = this.options.apiKey
    } else if (this.options.appId && this.options.accessToken) {
      headers['X-Api-App-Key'] = this.options.appId
      headers['X-Api-Access-Key'] = this.options.accessToken
    } else {
      throw new AppError('PROVIDER_CONFIG_INVALID', 'Volcengine ASR credentials are missing', {
        status: 503
      })
    }

    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user: { uid: input.userId },
        audio: {
          ...(input.audioUrl ? { url: input.audioUrl } : { data: input.audioDataBase64 }),
          format: input.format
        },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true }
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    })
    const apiStatus = response.headers.get('X-Api-Status-Code')
    if (!response.ok || (apiStatus && apiStatus !== '20000000')) {
      throw new AppError('ASR_PROVIDER_ERROR', 'Volcengine ASR request failed', {
        status: 502,
        details: { httpStatus: response.status, apiStatus }
      })
    }
    const payload = (await response.json()) as Record<string, any>
    const result = payload.result ?? payload
    const utterances = Array.isArray(result.utterances) ? result.utterances : []
    const segments = utterances
      .map((item: Record<string, any>) => {
        const startMs = Number(item.start_time ?? item.startTime ?? 0)
        const endMs = Number(item.end_time ?? item.endTime ?? 0)
        const text = String(item.text ?? '').trim()
        return {
          evidenceId: evidenceId(startMs, endMs, text),
          startMs,
          endMs,
          text,
          ...(Number.isFinite(Number(item.confidence))
            ? { confidence: Number(item.confidence) }
            : {})
        }
      })
      .filter((item: { text: string; endMs: number; startMs: number }) =>
        Boolean(item.text && item.endMs > item.startMs)
      )
    for (let index = 1; index < segments.length; index += 1) {
      if (segments[index].startMs < segments[index - 1].startMs) {
        throw new AppError('ASR_TIMELINE_INVALID', 'ASR segments are not monotonic', {
          status: 502
        })
      }
    }
    const parsed = transcriptSchema.safeParse({ fullText: String(result.text ?? ''), segments })
    if (!parsed.success) {
      throw new AppError('ASR_RESPONSE_INVALID', 'ASR response failed timeline validation', {
        status: 502,
        details: { issueCount: parsed.error.issues.length }
      })
    }
    return parsed.data
  }

  async transcribePreparedAudio(input: {
    audio: { path: string; format: 'wav' | 'mp3' | 'ogg'; publicUrl?: string }
    jobId: string
  }): Promise<Transcript> {
    const fileInfo = await stat(input.audio.path)
    if (fileInfo.size > this.maxAudioMb * 1024 * 1024) {
      throw new AppError(
        'ASR_AUDIO_TOO_LARGE',
        'Extracted audio exceeds the configured ASR limit',
        {
          status: 422,
          details: { maxAudioMb: this.maxAudioMb }
        }
      )
    }
    if (input.audio.publicUrl) {
      return this.transcribe({
        audioUrl: input.audio.publicUrl,
        format: input.audio.format,
        userId: input.jobId
      })
    }
    if (fileInfo.size > this.maxBase64AudioMb * 1024 * 1024) {
      throw new AppError(
        'ASR_AUDIO_REQUIRES_OBJECT_URL',
        'Extracted audio is too large for Base64; provide a short-lived object URL',
        { status: 422, details: { maxBase64AudioMb: this.maxBase64AudioMb } }
      )
    }
    return this.transcribe({
      audioDataBase64: (await readFile(input.audio.path)).toString('base64'),
      format: input.audio.format,
      userId: input.jobId
    })
  }
}
