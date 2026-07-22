import { z } from 'zod'

/**
 * Cue taxonomy + authored payload shapes.
 *
 * This module is the single owner of the unified CueKind taxonomy and the
 * server-side mirror of the frontend authored payload shapes
 * (src/features/finance-cues/contracts.ts). The two definitions are kept in
 * lock-step by server/test/payload-contract.spec.ts using golden fixtures.
 * The module boundary (server tsconfig vs app tsconfig) prevents a live shared
 * import, so duplication + a contract test is the sanctioned pattern.
 */

export const CUE_KINDS = [
  'context_card',
  'quick_judgment',
  'condition_slider',
  'causal_stitch',
  'counterexample_flip',
  'concept_compare'
] as const

export const cueKindSchema = z.enum(CUE_KINDS)
export type CueKind = z.infer<typeof cueKindSchema>

/**
 * Only kinds with a runtime renderer in InteractionRenderer.vue may be authored
 * into a payload. Since the frontend renderer now covers all six kinds, the set
 * is complete; it remains the gate for any future kind added without a renderer.
 * Non-renderable kinds stay candidate-only and surface in the CoverageReport.
 */
export const RENDERABLE_KINDS: ReadonlySet<CueKind> = new Set<CueKind>(CUE_KINDS)

export function isRenderableKind(kind: CueKind): boolean {
  return RENDERABLE_KINDS.has(kind)
}

const feedback = z.string().min(1).max(80)
const optionResult = z.string().min(1).max(80)
const choiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  result: optionResult
})

export const contextCardPayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  keyPoint: z.string().min(1),
  feedback
})

export const conditionSliderPayloadSchema = z.object({
  title: z.string().min(1),
  variable: z.string().min(1),
  options: z.array(choiceSchema).min(2).max(3)
})

export const causalStitchPayloadSchema = z.object({
  title: z.string().min(1),
  before: z.string().min(1),
  after: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(3),
  correctOption: z.string().min(1),
  feedback
})

export const quickJudgmentPayloadSchema = z.object({
  title: z.string().min(1),
  options: z.array(choiceSchema).min(2).max(4),
  feedback
})

export const counterexampleFlipPayloadSchema = z.object({
  title: z.string().min(1),
  baseClaim: z.string().min(1),
  options: z.array(choiceSchema).min(2).max(3),
  feedback
})

export const conceptComparePayloadSchema = z.object({
  title: z.string().min(1),
  left: z.object({ term: z.string().min(1), description: z.string().min(1).max(60) }),
  right: z.object({ term: z.string().min(1), description: z.string().min(1).max(60) }),
  keyDistinction: z.string().min(1).max(80)
})

/** Discriminated map from CueKind → its authored payload schema. */
export const payloadSchemaByKind = {
  context_card: contextCardPayloadSchema,
  quick_judgment: quickJudgmentPayloadSchema,
  condition_slider: conditionSliderPayloadSchema,
  causal_stitch: causalStitchPayloadSchema,
  counterexample_flip: counterexampleFlipPayloadSchema,
  concept_compare: conceptComparePayloadSchema
} as const satisfies Record<CueKind, z.ZodTypeAny>

/** Any authored payload, tagged by kind, for validating a whole trigger. */
export const authoredPayloadByKindSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('context_card'), payload: contextCardPayloadSchema }),
  z.object({ kind: z.literal('quick_judgment'), payload: quickJudgmentPayloadSchema }),
  z.object({ kind: z.literal('condition_slider'), payload: conditionSliderPayloadSchema }),
  z.object({ kind: z.literal('causal_stitch'), payload: causalStitchPayloadSchema }),
  z.object({ kind: z.literal('counterexample_flip'), payload: counterexampleFlipPayloadSchema }),
  z.object({ kind: z.literal('concept_compare'), payload: conceptComparePayloadSchema })
])

export type ContextCardPayload = z.infer<typeof contextCardPayloadSchema>
export type QuickJudgmentPayload = z.infer<typeof quickJudgmentPayloadSchema>
export type ConditionSliderPayload = z.infer<typeof conditionSliderPayloadSchema>
export type CausalStitchPayload = z.infer<typeof causalStitchPayloadSchema>
export type CounterexampleFlipPayload = z.infer<typeof counterexampleFlipPayloadSchema>
export type ConceptComparePayload = z.infer<typeof conceptComparePayloadSchema>
export type AuthoredPayload = z.infer<typeof authoredPayloadByKindSchema>

/**
 * Collect all human-readable text in an authored payload so the final safety
 * gate can run the forbidden-language regex over authored prose, not just the
 * cue prompt/objective. Kept exhaustive over CueKind.
 */
export function collectPayloadText(entry: AuthoredPayload): string {
  switch (entry.kind) {
    case 'context_card':
      return [
        entry.payload.title,
        entry.payload.body,
        entry.payload.keyPoint,
        entry.payload.feedback
      ].join(' ')
    case 'quick_judgment':
      return [
        entry.payload.title,
        entry.payload.feedback,
        ...entry.payload.options.flatMap((o) => [o.label, o.result])
      ].join(' ')
    case 'condition_slider':
      return [
        entry.payload.title,
        entry.payload.variable,
        ...entry.payload.options.flatMap((o) => [o.label, o.result])
      ].join(' ')
    case 'causal_stitch':
      return [
        entry.payload.title,
        entry.payload.before,
        entry.payload.after,
        entry.payload.correctOption,
        entry.payload.feedback,
        ...entry.payload.options
      ].join(' ')
    case 'counterexample_flip':
      return [
        entry.payload.title,
        entry.payload.baseClaim,
        entry.payload.feedback,
        ...entry.payload.options.flatMap((o) => [o.label, o.result])
      ].join(' ')
    case 'concept_compare':
      return [
        entry.payload.title,
        entry.payload.left.term,
        entry.payload.left.description,
        entry.payload.right.term,
        entry.payload.right.description,
        entry.payload.keyDistinction
      ].join(' ')
  }
}
