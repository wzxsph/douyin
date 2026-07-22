import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { URL } from 'node:url'
import type { OcrEvidence, PreparedFrame } from '../domain/contracts.js'
import { ocrEvidenceSchema } from '../domain/contracts.js'
import { AppError } from '../domain/errors.js'
import { signVolcengineV4 } from './volcengine-signature-v4.js'

type OcrInvoke = (request: Record<string, unknown>) => Promise<unknown>

export interface VolcengineOcrOptions {
  endpoint?: string
  action?: string
  version?: string
  region?: string
  service?: string
  accessKeyId: string
  secretAccessKey: string
  timeoutMs?: number
  filterThreshold?: number
  invoke?: OcrInvoke
  fetcher?: typeof fetch
}

function createDefaultInvoker(options: VolcengineOcrOptions): OcrInvoke {
  const endpoint = new URL(options.endpoint ?? 'https://visual.volcengineapi.com')
  if (endpoint.protocol !== 'https:') {
    throw new AppError('PROVIDER_ENDPOINT_INVALID', 'Volcengine OCR endpoint must use HTTPS', {
      status: 500
    })
  }
  const action = options.action ?? 'OCRNormal'
  const version = options.version ?? '2020-08-26'
  const contentType = 'application/x-www-form-urlencoded'
  const query = { Action: action, Version: version }
  endpoint.pathname ||= '/'
  endpoint.search = new URLSearchParams(query).toString()

  return async (request) => {
    const body = new URLSearchParams()
    Object.entries(request).forEach(([key, value]) => {
      if (value !== null && value !== undefined) body.append(key, String(value))
    })
    const serializedBody = body.toString()
    if (Buffer.byteLength(serializedBody) > 8 * 1024 * 1024) {
      throw new AppError(
        'OCR_REQUEST_TOO_LARGE',
        'Encoded OCR request exceeds the 8 MB API limit',
        {
          status: 422
        }
      )
    }
    const signature = signVolcengineV4({
      method: 'POST',
      pathname: endpoint.pathname,
      query,
      body: serializedBody,
      host: endpoint.host,
      contentType,
      region: options.region ?? 'cn-north-1',
      service: options.service ?? 'cv',
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey
      }
    })
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        Authorization: signature.authorization,
        'Content-Type': contentType,
        'X-Content-Sha256': signature.contentSha256,
        'X-Date': signature.date
      },
      body: serializedBody,
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
    })
    const payload = await response.json().catch(() => null)
    const providerError = (payload as any)?.ResponseMetadata?.Error
    if (!response.ok || providerError) {
      throw new AppError('OCR_PROVIDER_ERROR', 'Volcengine OCR request failed', {
        status: 502,
        details: {
          providerStatus: response.status,
          providerCode: providerError?.Code ?? null
        }
      })
    }
    return payload
  }
}

function normalizeResult(payload: any): {
  texts: string[]
  probabilities: number[]
  boxes: unknown[]
} {
  const result = payload?.Result ?? payload?.result ?? payload?.data ?? {}
  return {
    texts: result.line_texts ?? result.lineTexts ?? result.texts ?? [],
    probabilities: result.line_probs ?? result.lineProbs ?? result.probabilities ?? [],
    boxes: result.line_rects ?? result.lineRects ?? result.boxes ?? []
  }
}

export class VolcengineOcrClient {
  private readonly invoke: OcrInvoke
  private readonly threshold: number

  constructor(private readonly options: VolcengineOcrOptions) {
    if (!options.accessKeyId || !options.secretAccessKey) {
      throw new AppError('PROVIDER_CONFIG_INVALID', 'Volcengine OCR AK/SK are missing', {
        status: 503
      })
    }
    this.invoke = options.invoke ?? createDefaultInvoker(options)
    this.threshold = options.filterThreshold ?? 80
  }

  async recognizeFrames(frames: PreparedFrame[]): Promise<OcrEvidence[]> {
    const evidence: OcrEvidence[] = []
    for (const frame of frames) {
      const info = await stat(frame.path)
      if (info.size > 8 * 1024 * 1024) {
        throw new AppError('OCR_IMAGE_TOO_LARGE', 'OCR frame exceeds the 8 MB API limit', {
          status: 422,
          details: { frameId: frame.frameId }
        })
      }
      const response = await this.invoke({
        image_base64: (await readFile(frame.path)).toString('base64')
      })
      const normalized = normalizeResult(response)
      normalized.texts.forEach((rawText, index) => {
        const text = String(rawText).trim()
        const probability = normalized.probabilities[index]
        if (probability === undefined || probability === null) return
        const rawProbability = Number(probability)
        if (!Number.isFinite(rawProbability)) return
        const confidence = rawProbability > 1 ? rawProbability / 100 : rawProbability
        if (!text || confidence * 100 < this.threshold) return
        const id = createHash('sha256')
          .update(`${frame.frameId}:${frame.timeMs}:${index}:${text}`)
          .digest('hex')
          .slice(0, 16)
        const parsed = ocrEvidenceSchema.parse({
          evidenceId: `ocr-${id}`,
          frameId: frame.frameId,
          timeMs: frame.timeMs,
          text,
          confidence
        })
        evidence.push(parsed)
      })
    }
    return evidence
  }
}

export class DisabledOcrClient {
  async recognizeFrames(_frames: PreparedFrame[]): Promise<OcrEvidence[]> {
    return []
  }
}
