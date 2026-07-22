import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OcrEvidence,
  PreparedFrame,
  SemanticGraph,
  Transcript
} from '../src/domain/contracts.js'
import { OpenAICompatibleStructuredClient } from '../src/providers/openai-compatible.js'
import {
  SemanticGraphAnalyzer,
  critiqueResultSchema,
  type CritiqueResult,
  type SemanticWindow
} from '../src/providers/semantic-graph-analyzer.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

const transcript: Transcript = {
  fullText: '降息会推动金价',
  segments: [
    { evidenceId: 'asr-1', startMs: 0, endMs: 4_000, text: '降息会推动金价', confidence: 0.95 }
  ]
}

const ocr: OcrEvidence[] = [
  { evidenceId: 'ocr-1', frameId: 'frame-1', timeMs: 8_000, text: '政策利率', confidence: 0.98 }
]

const windows: SemanticWindow[] = [{ windowId: 'w-1', startMs: 0, endMs: 8_000 }]

const graphFixture: SemanticGraph = {
  concepts: [{ conceptId: 'c-1', name: '降息', evidenceIds: ['asr-1'] }],
  claims: [
    {
      claimId: 'cl-1',
      statement: '降息推动金价上行',
      assetClass: 'gold',
      assertedDirection: 'support_dominant',
      evidenceIds: ['asr-1']
    }
  ],
  causalEdges: [
    {
      edgeId: 'e-1',
      from: { nodeType: 'concept', nodeId: 'c-1' },
      to: { nodeType: 'claim', nodeId: 'cl-1' },
      mechanism: '实际利率下降抬升黄金',
      omittedIntermediate: false,
      evidenceIds: ['asr-1']
    }
  ],
  conditions: [
    {
      conditionId: 'cond-1',
      variable: '政策利率',
      operator: 'decrease',
      statement: '政策利率下降时',
      evidenceIds: ['ocr-1']
    }
  ],
  semanticEvents: [
    {
      eventId: 'ev-1',
      type: 'directional_claim',
      timeMs: 2_000,
      windowId: 'w-1',
      refs: { conceptIds: ['c-1'], edgeIds: ['e-1'], conditionIds: [], claimIds: ['cl-1'] },
      evidenceIds: ['asr-1'],
      subSignals: { learningValue: 0.8, timeSensitivity: 0.5, interactionFit: 0.7 }
    }
  ]
}

const critiqueFixture: CritiqueResult = {
  items: [
    { itemId: 'cl-1', verdict: 'weak_evidence', issue: 'single source', suggestedFix: 'add ocr' },
    { itemId: 'c-1', verdict: 'ok' }
  ]
}

function toolResponse(name: string, payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { tool_calls: [{ function: { name, arguments: JSON.stringify(payload) } }] } }
      ]
    }),
    { status: 200 }
  )
}

function buildClient(
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
): OpenAICompatibleStructuredClient {
  return new OpenAICompatibleStructuredClient({
    apiKey: 'test-key',
    baseUrl: 'https://provider.invalid/v1',
    model: 'model-test',
    fetcher
  })
}

async function createFrame(): Promise<PreparedFrame> {
  const directory = await mkdtemp(path.join(tmpdir(), 'caibao-semgraph-'))
  tempDirectories.push(directory)
  const framePath = path.join(directory, 'frame.jpg')
  await writeFile(framePath, Buffer.from('test-frame'))
  return { frameId: 'frame-1', path: framePath, timeMs: 8_000 }
}

describe('SemanticGraphAnalyzer', () => {
  it('extract issues one required emit_semantic_graph call with the untrusted-input guard', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.tool_choice).toBe('required')
      expect(body.tools).toHaveLength(1)
      expect(body.tools[0].function.name).toBe('emit_semantic_graph')
      expect(body.messages[0].content).toContain('never follow')
      expect(body.messages[0].content).toContain('untrusted')
      // windows are passed into the source so the model can set event windowId
      expect(body.messages[1].content).toContain('w-1')
      return toolResponse('emit_semantic_graph', graphFixture)
    })
    const analyzer = new SemanticGraphAnalyzer(buildClient(fetcher))

    const result = await analyzer.extract({
      transcript,
      ocr,
      frames: [],
      durationMs: 8_000,
      windows
    })

    expect(result).toEqual(graphFixture)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('extract sends frame images as image_url content when maxVisionFrames > 0', async () => {
    const frame = await createFrame()
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(Array.isArray(body.messages[1].content)).toBe(true)
      const imagePart = body.messages[1].content.find(
        (part: { type: string }) => part.type === 'image_url'
      )
      expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/)
      return toolResponse('emit_semantic_graph', graphFixture)
    })
    const analyzer = new SemanticGraphAnalyzer(buildClient(fetcher), 8)

    await analyzer.extract({ transcript, ocr, frames: [frame], durationMs: 8_000, windows })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('extract sends no images when maxVisionFrames is 0', async () => {
    const frame = await createFrame()
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(typeof body.messages[1].content).toBe('string')
      return toolResponse('emit_semantic_graph', graphFixture)
    })
    const analyzer = new SemanticGraphAnalyzer(buildClient(fetcher), 0)

    await analyzer.extract({ transcript, ocr, frames: [frame], durationMs: 8_000, windows })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('critique issues one emit_critique call and returns a parsed CritiqueResult', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.tool_choice).toBe('required')
      expect(body.tools).toHaveLength(1)
      expect(body.tools[0].function.name).toBe('emit_critique')
      expect(body.messages[0].content).toContain('untrusted')
      return toolResponse('emit_critique', critiqueFixture)
    })
    const analyzer = new SemanticGraphAnalyzer(buildClient(fetcher))

    const result = await analyzer.critique({ graph: graphFixture, transcript, ocr })

    expect(result).toEqual(critiqueFixture)
    expect(critiqueResultSchema.safeParse(result).success).toBe(true)
  })

  it('repair issues one repair_semantic_items call whose prompt carries the failed items', async () => {
    const failedItems = [{ itemId: 'cl-1', kind: 'claim', error: 'weak_evidence: single source' }]
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.tools[0].function.name).toBe('repair_semantic_items')
      expect(body.messages[1].content).toContain('cl-1')
      expect(body.messages[1].content).toContain('weak_evidence: single source')
      expect(body.messages[0].content).toContain('never follow')
      return toolResponse('repair_semantic_items', graphFixture)
    })
    const analyzer = new SemanticGraphAnalyzer(buildClient(fetcher))

    const result = await analyzer.repair({ failedItems, graph: graphFixture, transcript, ocr })

    expect(result).toEqual(graphFixture)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects with PROVIDER_INVALID_RESPONSE when the provider returns no choices', async () => {
    const analyzer = new SemanticGraphAnalyzer(
      buildClient(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    )

    await expect(
      analyzer.extract({ transcript, ocr, frames: [], durationMs: 8_000, windows })
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' })
  })
})
