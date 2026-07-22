import { z } from 'zod'
import { CUE_KINDS, payloadSchemaByKind, type CueKind } from '../domain/payload-contracts.js'
import { planCueCandidates } from '../pipeline/cue-planner.js'
import {
  findShowcaseSeed,
  SHOWCASE_CONTENT_SEEDS,
  SHOWCASE_EXPERIENCE_BY_VIDEO_ID,
  type ShowcaseContentSeed
} from './content-seeds.js'

const sourceItemSchema = z.object({
  itemId: z.string().min(1),
  sourceUrl: z.string().url(),
  author: z.string().min(1),
  title: z.string().min(1),
  publishedAtObserved: z.string().min(1),
  aiGeneratedDisclosureObserved: z.boolean(),
  relativePath: z.string().min(1),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
})

export const showcaseSourceManifestSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  batchId: z.string().min(1),
  rights: z.object({
    status: z.literal('authorized'),
    authorizedSubject: z.string().min(1),
    attestationId: z.string().min(1),
    verificationStatus: z.string().optional(),
    purpose: z.string().min(1),
    retentionUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }),
  items: z.array(sourceItemSchema).min(1)
})

const preparedManifestSchema = z.object({
  batchId: z.string().min(1),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      video: z.object({
        relativePath: z.string().min(1),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        durationSeconds: z.number().positive()
      }),
      poster: z.object({
        relativePath: z.string().min(1),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
      })
    })
  )
})

type SourceManifest = z.infer<typeof showcaseSourceManifestSchema>
type SourceItem = z.infer<typeof sourceItemSchema>
type PreparedManifest = z.infer<typeof preparedManifestSchema>

export interface MockCueDraft {
  kind: CueKind
  cueLabel: string
  prompt: string
  learningObjective: string
  payload: unknown
}

export interface ShowcaseLlmMock {
  generate(input: {
    item: SourceItem
    seed: ShowcaseContentSeed
    kinds: CueKind[]
  }): Promise<MockCueDraft[]>
}

export interface ShowcaseExperience {
  experienceId: string
  videoId: string
  contentVersion: string
  mediaFingerprint: string
  publishStatus: 'internal_poc'
  approvalScope: 'internal_poc'
  approvalDecisionRef: string
  timecodeQuality: 'estimated_mock'
  title: string
  notice: string
  generation: {
    mode: 'mock'
    provider: 'deterministic_llm_mock'
    model: string
    promptVersion: string
    generatedAt: string
    evidenceBasis: 'title_and_manifest_metadata_only'
  }
  constraints: {
    minGapMs: 45000
    maxConcurrent: 1
    playbackPolicy: {
      invitation: 'continue'
      interaction: 'pause'
      exit: 'restore_previous'
    }
  }
  concepts: Array<{ conceptId: string; name: string; evidenceIds: string[] }>
  triggers: Array<
    MockCueDraft & {
      triggerId: string
      startMs: number
      endMs: number
      priority: number
      cueDurationMs: 5000
      expectedInteractionMs: 10000
      halfSheetMaxRatio: 0.48
      evidenceIds: string[]
      reviewStatus: 'mock'
      fallbackBehavior: 'collapse_to_timeline'
      delivery: 'automatic'
    }
  >
}

export interface ShowcaseCatalogItem {
  videoId: string
  financeExperienceId: string
  title: string
  author: string
  authorSlug: string
  sourceUrl: string
  publishedAtObserved: string
  aiGeneratedDisclosureObserved: boolean
  durationMs: number
  width: number
  height: number
  sourceSha256: string
  derivativeSha256: string | null
  derivativeBytes: number | null
  mediaFile: string
  posterFile: string
}

export interface ShowcaseBundle {
  schemaVersion: 1
  batchId: string
  generatedAt: string
  expiresAt: string
  rights: {
    status: 'user_attested_not_independently_verified'
    subject: string
    attestationId: string
    sourcePurpose: string
    deploymentInstruction: 'user_requested_github_pages_showcase'
  }
  disclosure: {
    product: string
    media: string
    content: string
    investment: string
  }
  authors: Array<{ name: string; slug: string; itemCount: number }>
  catalog: ShowcaseCatalogItem[]
  experiences: ShowcaseExperience[]
}

const MOCK_MODEL = 'caibao-deterministic-llm-mock-v1'
const MOCK_PROMPT_VERSION = 'showcase-mock-prompt/1.0.0'
const CONTENT_VERSION = 'showcase-mock@2026.07.23.1'

function choice(id: string, label: string, result: string) {
  return { id, label, result }
}

function payloadForKind(kind: CueKind, seed: ShowcaseContentSeed): MockCueDraft {
  switch (kind) {
    case 'context_card':
      return {
        kind,
        cueLabel: '概念卡',
        prompt: `先区分“${seed.conceptA}”和“${seed.conceptB}”`,
        learningObjective: `区分${seed.conceptA}与${seed.conceptB}`,
        payload: {
          title: `${seed.conceptA}，不是${seed.conceptB}`,
          body: `${seed.conceptA}：${seed.conceptADescription}。${seed.conceptB}：${seed.conceptBDescription}。`,
          keyPoint: `${seed.conceptA}描述起点，${seed.conceptB}描述结果或约束。`,
          feedback: '先把概念分开，再判断视频中的因果关系。'
        }
      }
    case 'quick_judgment':
      return {
        kind,
        cueLabel: '快判断',
        prompt: seed.judgmentQuestion,
        learningObjective: `识别${seed.conditionVariable}这一成立条件`,
        payload: {
          title: seed.judgmentQuestion,
          options: [
            choice('yes', '大体成立', `只有${seed.conditionVariable}支持时才更可能成立。`),
            choice('no', '不能直接下结论', '还需要区分事实、机制和条件。'),
            choice('insufficient', '信息不足', '仅凭标题与单一片段不能确认。')
          ],
          feedback: `别急着下结论，先检查${seed.conditionVariable}。`
        }
      }
    case 'condition_slider':
      return {
        kind,
        cueLabel: '换条件',
        prompt: `${seed.conditionVariable}变化，结果会怎样？`,
        learningObjective: `理解${seed.conditionVariable}对路径强弱的影响`,
        payload: {
          title: '只改变一个条件',
          variable: seed.conditionVariable,
          options: [
            choice('weak', '走弱', `“${seed.mechanism}”这条路径会减弱。`),
            choice('base', '维持', '当前证据不足以改变主路径判断。'),
            choice('strong', '走强', `“${seed.mechanism}”这条路径会增强。`)
          ]
        }
      }
    case 'causal_stitch':
      return {
        kind,
        cueLabel: '补因果',
        prompt: '补上中间发生了什么',
        learningObjective: `连接${seed.cause}与${seed.outcome}`,
        payload: {
          title: '哪一步把前因连到结果？',
          before: seed.cause,
          after: seed.outcome,
          options: [seed.mechanism, '只靠情绪直接发生', '与中间机制无关'],
          correctOption: seed.mechanism,
          feedback: `更完整的链条是：${seed.cause} → ${seed.mechanism} → ${seed.outcome}。`
        }
      }
    case 'counterexample_flip':
      return {
        kind,
        cueLabel: '找反例',
        prompt: '什么情况会让结论不成立？',
        learningObjective: `用反例检查“${seed.outcome}”是否必然`,
        payload: {
          title: '给主张加一个反例条件',
          baseClaim: `${seed.cause}会带来${seed.outcome}`,
          options: [
            choice('counter', '加入反例', seed.counterexample),
            choice('same', '条件不变', `仍需观察${seed.conditionVariable}。`),
            choice('unknown', '暂不确定', '需要更多视频证据才能判断路径强弱。')
          ],
          feedback: `反例提醒：${seed.counterexample}。`
        }
      }
    case 'concept_compare':
      return {
        kind,
        cueLabel: '辨概念',
        prompt: `这两个词有什么不同？`,
        learningObjective: `准确区分${seed.conceptA}和${seed.conceptB}`,
        payload: {
          title: '别把相关概念当成同一个结论',
          left: { term: seed.conceptA, description: seed.conceptADescription },
          right: { term: seed.conceptB, description: seed.conceptBDescription },
          keyDistinction: `${seed.conceptA}与${seed.conceptB}处在因果链的不同位置。`
        }
      }
  }
}

export class DeterministicShowcaseLlmMock implements ShowcaseLlmMock {
  async generate(input: {
    item: SourceItem
    seed: ShowcaseContentSeed
    kinds: CueKind[]
  }): Promise<MockCueDraft[]> {
    return input.kinds.map((kind) => payloadForKind(kind, input.seed))
  }
}

const SHOWCASE_GENERATED_KINDS: CueKind[] = [
  'context_card',
  'quick_judgment',
  'causal_stitch',
  'condition_slider',
  'counterexample_flip',
  'concept_compare'
]

/**
 * There is deliberately no separate automatic-cue cap. The mock emits every
 * content node that fits the 45-second spacing budget, up to the content
 * package's six semantic node types.
 */
function cueKindsForItem(item: SourceItem, index: number): CueKind[] {
  const durationMs = Math.round(item.durationSeconds * 1000)
  const firstMs = Math.round(durationMs * 0.1)
  const lastMs = Math.floor(durationMs * 0.9)
  const compatibleNodeCount = Math.floor((lastMs - firstMs) / 45_000) + 1
  const cueCount = Math.max(1, Math.min(SHOWCASE_GENERATED_KINDS.length, compatibleNodeCount))
  const tail = SHOWCASE_GENERATED_KINDS.slice(2)
  const rotatedTail = [...tail.slice(index % tail.length), ...tail.slice(0, index % tail.length)]
  return [...SHOWCASE_GENERATED_KINDS.slice(0, 2), ...rotatedTail].slice(0, cueCount)
}

function cueTimes(durationMs: number, count: number): number[] {
  const firstMs = Math.round(durationMs * 0.1)
  if (count === 1) return [firstMs]
  const lastMs = Math.floor(durationMs * 0.9)
  const stepMs = Math.floor((lastMs - firstMs) / (count - 1))
  return Array.from({ length: count }, (_, index) => firstMs + stepMs * index)
}

function authorSlug(author: string): string {
  if (author === '小Lin说') return 'xiaolin'
  if (author === '大陆姓陆') return 'dalu-xing-lu'
  return `author-${Buffer.from(author).toString('hex').slice(0, 16)}`
}

function assertCatalogCoverage(manifest: SourceManifest): void {
  const manifestIds = new Set(manifest.items.map((item) => item.itemId))
  const seedIds = new Set(SHOWCASE_CONTENT_SEEDS.map((seed) => seed.itemId))
  if (
    manifestIds.size !== manifest.items.length ||
    seedIds.size !== SHOWCASE_CONTENT_SEEDS.length ||
    manifestIds.size !== seedIds.size ||
    [...manifestIds].some((id) => !seedIds.has(id))
  ) {
    throw new Error('Every manifest item must have exactly one showcase content seed')
  }
}

export async function generateShowcaseBundle(input: {
  manifest: unknown
  preparedManifest?: unknown
  llm?: ShowcaseLlmMock
  generatedAt?: string
}): Promise<ShowcaseBundle> {
  const manifest = showcaseSourceManifestSchema.parse(input.manifest)
  const prepared = input.preparedManifest
    ? preparedManifestSchema.parse(input.preparedManifest)
    : undefined
  if (prepared && prepared.batchId !== manifest.batchId) {
    throw new Error('Prepared media batch does not match the source manifest')
  }
  assertCatalogCoverage(manifest)
  const llm = input.llm ?? new DeterministicShowcaseLlmMock()
  const generatedAt = new Date(input.generatedAt ?? Date.now()).toISOString()

  const experiences: ShowcaseExperience[] = []
  const catalog: ShowcaseCatalogItem[] = []
  for (const [index, item] of manifest.items.entries()) {
    const seed = findShowcaseSeed(item.itemId)
    if (!seed) throw new Error(`Missing showcase seed for ${item.itemId}`)
    const kinds = cueKindsForItem(item, index)
    const drafts = await llm.generate({ item, seed, kinds })
    if (drafts.length !== kinds.length) {
      throw new Error(`LLM mock returned an unexpected cue count for ${item.itemId}`)
    }
    const evidenceId = `mock-title-${item.itemId}`
    const starts = cueTimes(Math.round(item.durationSeconds * 1000), drafts.length)
    const candidates = drafts.map((draft, cueIndex) => ({
      candidateId: `${item.itemId}-cue-${cueIndex + 1}`,
      sourceEventId: `mock-event-${item.itemId}-${cueIndex + 1}`,
      kind: draft.kind,
      proposedStartMs: starts[cueIndex],
      proposedEndMs: Math.min(starts[cueIndex] + 6000, Math.round(item.durationSeconds * 1000)),
      windowId: `mock-window-${item.itemId}-${cueIndex + 1}`,
      prompt: draft.prompt,
      learningObjective: draft.learningObjective,
      rationale: 'LLM mock 根据标题与清单元数据生成的 PoC 候选',
      evidenceIds: [evidenceId],
      priority: 90 - cueIndex * 5,
      expectedInteractionMs: 10000,
      visualLoad: 'low' as const,
      subSignals: {
        learningValue: 0.8,
        timeSensitivity: 0.6,
        interactionFit: 0.8
      }
    }))
    const planned = planCueCandidates(candidates, {
      minGapMs: 45000,
      durationMs: Math.round(item.durationSeconds * 1000),
      knownEvidenceIds: new Set([evidenceId])
    })
    if (planned.accepted.length !== candidates.length || planned.rejected.length) {
      throw new Error(`Generated cue timing failed the deterministic planner for ${item.itemId}`)
    }

    const triggers = drafts.map((draft, cueIndex) => ({
      ...draft,
      payload: payloadSchemaByKind[draft.kind].parse(draft.payload),
      triggerId: candidates[cueIndex].candidateId,
      startMs: starts[cueIndex],
      endMs: Math.min(starts[cueIndex] + 6000, Math.round(item.durationSeconds * 1000)),
      priority: candidates[cueIndex].priority,
      cueDurationMs: 5000 as const,
      expectedInteractionMs: 10000 as const,
      halfSheetMaxRatio: 0.48 as const,
      evidenceIds: [evidenceId],
      reviewStatus: 'mock' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const
    }))

    const experienceId = SHOWCASE_EXPERIENCE_BY_VIDEO_ID[item.itemId]
    experiences.push({
      experienceId,
      videoId: item.itemId,
      contentVersion: CONTENT_VERSION,
      mediaFingerprint: item.sha256,
      publishStatus: 'internal_poc',
      approvalScope: 'internal_poc',
      approvalDecisionRef: 'user-goal-2026-07-23-public-showcase',
      timecodeQuality: 'estimated_mock',
      title: item.title,
      notice: 'LLM Mock：仅根据标题和清单元数据生成，未使用 ASR/OCR，未经财经审核。',
      generation: {
        mode: 'mock',
        provider: 'deterministic_llm_mock',
        model: MOCK_MODEL,
        promptVersion: MOCK_PROMPT_VERSION,
        generatedAt,
        evidenceBasis: 'title_and_manifest_metadata_only'
      },
      constraints: {
        minGapMs: 45000,
        maxConcurrent: 1,
        playbackPolicy: {
          invitation: 'continue',
          interaction: 'pause',
          exit: 'restore_previous'
        }
      },
      concepts: [
        { conceptId: `${item.itemId}-concept-a`, name: seed.conceptA, evidenceIds: [evidenceId] },
        { conceptId: `${item.itemId}-concept-b`, name: seed.conceptB, evidenceIds: [evidenceId] }
      ],
      triggers
    })

    const preparedItem = prepared?.items.find((entry) => entry.itemId === item.itemId)
    if (preparedItem && preparedItem.sourceSha256 !== item.sha256) {
      throw new Error(`Prepared media is stale for ${item.itemId}`)
    }
    catalog.push({
      videoId: item.itemId,
      financeExperienceId: experienceId,
      title: item.title,
      author: item.author,
      authorSlug: authorSlug(item.author),
      sourceUrl: item.sourceUrl,
      publishedAtObserved: item.publishedAtObserved,
      aiGeneratedDisclosureObserved: item.aiGeneratedDisclosureObserved,
      durationMs: Math.round((preparedItem?.video.durationSeconds ?? item.durationSeconds) * 1000),
      width: preparedItem?.video.width ?? item.width,
      height: preparedItem?.video.height ?? item.height,
      sourceSha256: item.sha256,
      derivativeSha256: preparedItem?.video.sha256 ?? null,
      derivativeBytes: preparedItem?.video.bytes ?? null,
      mediaFile: `${item.itemId}.mp4`,
      posterFile: `${item.itemId}.jpg`
    })
  }

  const authors = [...new Set(catalog.map((item) => item.author))].map((name) => ({
    name,
    slug: authorSlug(name),
    itemCount: catalog.filter((item) => item.author === name).length
  }))
  return {
    schemaVersion: 1,
    batchId: manifest.batchId,
    generatedAt,
    expiresAt: `${manifest.rights.retentionUntil}T23:59:59.999+08:00`,
    rights: {
      status: 'user_attested_not_independently_verified',
      subject: manifest.rights.authorizedSubject,
      attestationId: manifest.rights.attestationId,
      sourcePurpose: manifest.rights.purpose,
      deploymentInstruction: 'user_requested_github_pages_showcase'
    },
    disclosure: {
      product: '本项目是独立参赛学习原型，与抖音及原作者不存在官方隶属关系。',
      media: '媒体来自清单列明的抖音原作品；页面逐条提供作者与原视频链接。',
      content: '财包互动由 LLM Mock 根据标题和元数据生成，未使用最终 ASR/OCR，未经财经审核。',
      investment: '内容仅用于财经知识理解，不构成投资建议。'
    },
    authors,
    catalog,
    experiences
  }
}

export const SHOWCASE_CUE_KINDS = CUE_KINDS
