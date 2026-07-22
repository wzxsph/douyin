import type { ZodType } from 'zod'
import { AppError } from '../domain/errors.js'

export interface StructuredGenerationRequest<T> {
  toolName: string
  toolDescription: string
  jsonSchema: Record<string, unknown>
  outputSchema: ZodType<T>
  systemPrompt: string
  userPrompt: string
  imageDataUrls?: string[]
}

export interface OpenAICompatibleClientOptions {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs?: number
  maxRetries?: number
  fetcher?: typeof fetch
}

function joinEndpoint(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/$/, '')}${pathname}`
}

function parseArguments(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return undefined
  const response = payload as Record<string, any>
  const message = response.choices?.[0]?.message
  const toolArguments = message?.tool_calls?.[0]?.function?.arguments
  if (typeof toolArguments === 'string') {
    try {
      return JSON.parse(toolArguments)
    } catch {
      return undefined
    }
  }
  const content = message?.content
  if (typeof content !== 'string') return undefined
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content
  try {
    return JSON.parse(fenced.trim())
  } catch {
    return undefined
  }
}

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export class OpenAICompatibleStructuredClient {
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly fetcher: typeof fetch

  constructor(private readonly options: OpenAICompatibleClientOptions) {
    const endpoint = new URL(options.baseUrl)
    if (endpoint.protocol !== 'https:') {
      throw new AppError('PROVIDER_ENDPOINT_INVALID', 'AI provider endpoint must use HTTPS', {
        status: 500
      })
    }
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxRetries = options.maxRetries ?? 0
    this.fetcher = options.fetcher ?? fetch
  }

  async generate<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    if (!this.options.apiKey || !this.options.model) {
      throw new AppError('PROVIDER_CONFIG_INVALID', 'Provider API key and model are required', {
        status: 503
      })
    }
    const userContent = request.imageDataUrls?.length
      ? [
          { type: 'text', text: request.userPrompt },
          ...request.imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } }))
        ]
      : request.userPrompt
    const body = {
      model: this.options.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: userContent }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: request.toolName,
            description: request.toolDescription,
            parameters: request.jsonSchema
          }
        }
      ],
      tool_choice: 'required'
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetcher(
          joinEndpoint(this.options.baseUrl, '/chat/completions'),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.options.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs)
          }
        )
        if (!response.ok) {
          const error = new AppError('PROVIDER_HTTP_ERROR', 'AI provider request failed', {
            status: 502,
            details: { status: response.status, retryable: retryable(response.status) }
          })
          if (attempt < this.maxRetries && retryable(response.status)) {
            lastError = error
            continue
          }
          throw error
        }
        const raw = await response.json()
        const parsed = request.outputSchema.safeParse(parseArguments(raw))
        if (!parsed.success) {
          throw new AppError(
            'PROVIDER_INVALID_RESPONSE',
            'AI provider returned invalid structured output',
            {
              status: 502,
              details: { issueCount: parsed.error.issues.length }
            }
          )
        }
        return parsed.data
      } catch (error) {
        if (error instanceof AppError) throw error
        lastError = error
        if (attempt >= this.maxRetries) break
      }
    }
    throw new AppError('PROVIDER_UNAVAILABLE', 'AI provider is unavailable or timed out', {
      status: 502,
      cause: lastError
    })
  }
}
