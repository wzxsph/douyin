import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleStructuredClient } from '../src/providers/openai-compatible.js'
import {
  contextCardPayloadSchema,
  conditionSliderPayloadSchema
} from '../src/domain/payload-contracts.js'
import type { TriggerCandidate } from '../src/domain/contracts.js'
import { PayloadAuthor, PROMPT_VERSION } from '../src/pipeline/payload-author.js'
import { goldenPayloads } from './fixtures/authored-payloads.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const baseSubSignals = { learningValue: 0.8, timeSensitivity: 0.3, interactionFit: 0.7 }

function makeCandidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    candidateId: 'cand-1',
    sourceEventId: 'evt-1',
    kind: 'context_card',
    proposedStartMs: 10_000,
    proposedEndMs: 20_000,
    windowId: 'win-1',
    priority: 5,
    expectedInteractionMs: 8_000,
    prompt: '解释政策利率如何影响市场',
    learningObjective: '理解利率与资产价格的关系',
    rationale: '视频提到降息',
    evidenceIds: ['ev-1'],
    visualLoad: 'low',
    subSignals: baseSubSignals,
    ...overrides
  }
}

function toolResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: 'author', arguments: JSON.stringify(payload) } }]
          }
        }
      ]
    }),
    { status: 200 }
  )
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function makeClient(fetcher: Fetcher): OpenAICompatibleStructuredClient {
  return new OpenAICompatibleStructuredClient({
    apiKey: 'test-key',
    baseUrl: 'https://provider.invalid/v1',
    model: 'model-test',
    fetcher: fetcher as typeof fetch
  })
}

interface RequestMessage {
  role: string
  content: string
}

interface ToolParameters {
  type: string
  required: string[]
  properties: Record<string, unknown>
  additionalProperties: boolean
}

interface StructuredRequestBody {
  messages: RequestMessage[]
  tools: Array<{ function: { parameters: ToolParameters } }>
}

/** Read the JSON request body sent on a given mock call index. */
function bodyOf(fetcher: ReturnType<typeof vi.fn>, callIndex: number): StructuredRequestBody {
  const init = fetcher.mock.calls.at(callIndex)?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body))
}

const cleanContextCard = {
  title: '政策利率是什么',
  body: '政策利率是央行设定的基准利率，会影响市场资金成本。',
  keyPoint: '利率变化会传导到资产价格。',
  feedback: '你已理解利率传导的基本逻辑。'
}

const cleanConditionSlider = {
  title: '如果利率变化会怎样',
  variable: '政策利率',
  options: [
    { id: 'opt-1', label: '利率下降', result: '资金成本降低，需求可能上升。' },
    { id: 'opt-2', label: '利率不变', result: '市场维持现有预期。' },
    { id: 'opt-3', label: '利率上升', result: '资金成本升高，需求可能承压。' }
  ]
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PayloadAuthor', () => {
  it('exports a stable PROMPT_VERSION', () => {
    expect(PROMPT_VERSION).toBe('payload-author.v1')
  })

  it('authors a context_card payload that round-trips its schema', async () => {
    const fetcher = vi.fn(async () => toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher))

    const result = await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      direction: {
        candidateId: 'cand-1',
        direction: 'support_dominant',
        activatedPaths: ['edge-1'],
        evidenceIds: ['ev-1'],
        ruleVersion: 'rules.v1'
      },
      evidenceContext: '<transcript>降息</transcript>'
    })

    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(() => contextCardPayloadSchema.parse(result.payload)).not.toThrow()
      expect(contextCardPayloadSchema.parse(result.payload)).toEqual(cleanContextCard)
    }
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('authors a condition_slider payload with 2..3 options', async () => {
    const fetcher = vi.fn(async () => toolResponse(cleanConditionSlider))
    const author = new PayloadAuthor(makeClient(fetcher))

    const result = await author.author({
      candidate: makeCandidate({ kind: 'condition_slider' }),
      direction: {
        candidateId: 'cand-1',
        direction: 'conflict',
        activatedPaths: [],
        evidenceIds: ['ev-1'],
        ruleVersion: 'rules.v1'
      },
      evidenceContext: 'ctx'
    })

    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      const parsed = conditionSliderPayloadSchema.parse(result.payload)
      expect(parsed.options.length).toBeGreaterThanOrEqual(2)
      expect(parsed.options.length).toBeLessThanOrEqual(3)
      expect(parsed).toEqual(cleanConditionSlider)
    }
  })

  it.each(goldenPayloads)(
    'authors $kind with a closed tool schema matching the Zod payload contract',
    async ({ kind, payload }) => {
      const fetcher = vi.fn(async () => toolResponse(payload))
      const author = new PayloadAuthor(makeClient(fetcher))

      const result = await author.author({
        candidate: makeCandidate({ kind }),
        evidenceContext: '离线证据上下文'
      })

      expect(result).toEqual({ payload })
      const parameters = bodyOf(fetcher, 0).tools[0].function.parameters
      const expectedFields = Object.keys(payload).sort()
      expect(parameters.type).toBe('object')
      expect(parameters.additionalProperties).toBe(false)
      expect([...parameters.required].sort()).toEqual(expectedFields)
      expect(Object.keys(parameters.properties).sort()).toEqual(expectedFields)
    }
  )

  it('keeps choice-object and causal-string option schemas distinct', async () => {
    const quick = goldenPayloads.find((entry) => entry.kind === 'quick_judgment')!
    const causal = goldenPayloads.find((entry) => entry.kind === 'causal_stitch')!
    const quickFetcher = vi.fn(async () => toolResponse(quick.payload))
    const causalFetcher = vi.fn(async () => toolResponse(causal.payload))

    await new PayloadAuthor(makeClient(quickFetcher)).author({
      candidate: makeCandidate({ kind: quick.kind }),
      evidenceContext: 'ctx'
    })
    await new PayloadAuthor(makeClient(causalFetcher)).author({
      candidate: makeCandidate({ kind: causal.kind }),
      evidenceContext: 'ctx'
    })

    const quickOptions = bodyOf(quickFetcher, 0).tools[0].function.parameters.properties
      .options as {
      items: { type: string; required: string[] }
    }
    const causalOptions = bodyOf(causalFetcher, 0).tools[0].function.parameters.properties
      .options as {
      items: { type: string }
    }
    expect(quickOptions.items.type).toBe('object')
    expect([...quickOptions.items.required].sort()).toEqual(['id', 'label', 'result'])
    expect(causalOptions.items.type).toBe('string')
  })

  it('rejects a kind outside the renderable set without calling the model', async () => {
    // All six kinds render today; exercise the defensive gate with a restricted set.
    const fetcher = vi.fn(async () => toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher), 2, new Set(['context_card']))

    for (const kind of ['concept_compare', 'quick_judgment', 'counterexample_flip'] as const) {
      const result = await author.author({
        candidate: makeCandidate({ kind }),
        evidenceContext: 'ctx'
      })
      expect(result).toEqual({
        rejected: 'NON_RENDERABLE_KIND',
        detail: expect.stringContaining(kind)
      })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('repairs once when the first authored text contains a forbidden word', async () => {
    const dirtyContextCard = { ...cleanContextCard, feedback: '建议你立即买入相关资产。' }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(toolResponse(dirtyContextCard))
      .mockResolvedValueOnce(toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher))

    const result = await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      evidenceContext: 'ctx'
    })

    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(contextCardPayloadSchema.parse(result.payload)).toEqual(cleanContextCard)
    }
    expect(fetcher).toHaveBeenCalledTimes(2)
    // The second call must carry the repair note in the user prompt.
    const secondUser = bodyOf(fetcher, 1).messages.find((m) => m.role === 'user')?.content
    expect(secondUser).toContain('repair_required')
  })

  it('rejects PAYLOAD_UNAUTHORABLE when forbidden text persists past maxRepairIters', async () => {
    const dirtyContextCard = { ...cleanContextCard, feedback: '目标价已到，稳赚不赔。' }
    const fetcher = vi.fn(async () => toolResponse(dirtyContextCard))
    const author = new PayloadAuthor(makeClient(fetcher), 2)

    const result = await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      evidenceContext: 'ctx'
    })

    expect(result).toEqual({
      rejected: 'PAYLOAD_UNAUTHORABLE',
      detail: expect.any(String)
    })
    // 1 initial attempt + maxRepairIters (2) re-asks = 3 total generate calls.
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('repairs when the provider returns a schema-invalid payload, then succeeds', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(toolResponse({ title: 'missing the rest' }))
      .mockResolvedValueOnce(toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher))

    const result = await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      evidenceContext: 'ctx'
    })

    expect('payload' in result).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const secondUser = bodyOf(fetcher, 1).messages.find(
      (message) => message.role === 'user'
    )?.content
    expect(secondUser).toContain('REQUIRED top-level fields: [title, body, keyPoint, feedback]')
    expect(secondUser).toContain('may be nested under a "payload"')
  })

  it('builds a system prompt with the untrusted-input guard and the locked direction', async () => {
    const fetcher = vi.fn(async () => toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher))

    await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      direction: {
        candidateId: 'cand-1',
        direction: 'support_dominant',
        activatedPaths: ['edge-1'],
        evidenceIds: ['ev-1'],
        ruleVersion: 'rules.v1'
      },
      evidenceContext: 'ctx'
    })

    const system = bodyOf(fetcher, 0).messages.find((m) => m.role === 'system')?.content
    expect(system).toContain('UNTRUSTED')
    expect(system).toContain('ALREADY LOCKED')
    expect(system).toContain('support_dominant')
  })

  it('instructs an insufficient framing when direction is missing', async () => {
    const fetcher = vi.fn(async () => toolResponse(cleanContextCard))
    const author = new PayloadAuthor(makeClient(fetcher))

    await author.author({
      candidate: makeCandidate({ kind: 'context_card' }),
      evidenceContext: 'ctx'
    })

    const system = bodyOf(fetcher, 0).messages.find((m) => m.role === 'system')?.content
    expect(system).toContain('INSUFFICIENT')
    expect(system).toContain('NEVER assert a concrete')
  })
})
