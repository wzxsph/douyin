import { z } from 'zod'

const triggerBase = {
  triggerId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  priority: z.number().int().min(0).max(100).default(50),
  cueDurationMs: z.number().int().min(4000).max(6000),
  expectedInteractionMs: z.number().int().positive().max(12000),
  halfSheetMaxRatio: z.number().positive().max(0.48),
  cueLabel: z.string().min(1).max(8),
  prompt: z.string().min(1).max(40),
  learningObjective: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  reviewStatus: z.literal('approved'),
  fallbackBehavior: z.literal('collapse_to_timeline')
}

const contextCardTriggerSchema = z.object({
  ...triggerBase,
  kind: z.literal('context_card'),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    keyPoint: z.string().min(1),
    feedback: z.string().min(1).max(80)
  })
})

const conditionSliderTriggerSchema = z.object({
  ...triggerBase,
  kind: z.literal('condition_slider'),
  payload: z.object({
    title: z.string().min(1),
    variable: z.string().min(1),
    options: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          result: z.string().min(1).max(80)
        })
      )
      .min(2)
      .max(3)
  })
})

const causalStitchTriggerSchema = z.object({
  ...triggerBase,
  kind: z.literal('causal_stitch'),
  payload: z.object({
    title: z.string().min(1),
    before: z.string().min(1),
    after: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(3),
    correctOption: z.string().min(1),
    feedback: z.string().min(1).max(80)
  })
})

export const timelineTriggerSchema = z.discriminatedUnion('kind', [
  contextCardTriggerSchema,
  conditionSliderTriggerSchema,
  causalStitchTriggerSchema
])

export const approvedExperienceSchema = z
  .object({
    experienceId: z.string().min(1),
    videoId: z.string().min(1),
    contentVersion: z.string().min(1),
    mediaFingerprint: z.string().min(1),
    publishStatus: z.literal('approved'),
    title: z.string().min(1),
    notice: z.string().min(1),
    constraints: z.object({
      maxAutomaticCues: z.number().int().positive().max(6),
      minGapMs: z.number().int().min(45000),
      maxConcurrent: z.literal(1),
      keepPlayback: z.literal(true)
    }),
    triggers: z.array(timelineTriggerSchema).min(1).max(6),
    concepts: z.array(
      z.object({
        conceptId: z.string().min(1),
        name: z.string().min(1),
        evidenceIds: z.array(z.string().min(1)).min(1)
      })
    )
  })
  .superRefine((experience, context) => {
    const triggers = [...experience.triggers].sort((a, b) => a.startMs - b.startMs)
    for (const trigger of triggers) {
      if (trigger.endMs <= trigger.startMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '触点结束时间必须晚于开始时间',
          path: ['triggers', trigger.triggerId]
        })
      }
    }
    for (let index = 1; index < triggers.length; index += 1) {
      if (triggers[index].startMs - triggers[index - 1].startMs < experience.constraints.minGapMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '自动触点间隔不得小于内容包约束',
          path: ['triggers', index, 'startMs']
        })
      }
    }
  })

export type ApprovedExperience = z.infer<typeof approvedExperienceSchema>
export type TimelineTrigger = z.infer<typeof timelineTriggerSchema>
export type TriggerKind = TimelineTrigger['kind']

export type TraceAction =
  | 'surfaced'
  | 'expanded'
  | 'completed'
  | 'dismissed'
  | 'missed'
  | 'revisited'

export interface LearningTraceEvent {
  eventId: string
  sessionId: string
  videoId: string
  contentVersion: string
  triggerId: string
  action: TraceAction
  playbackPositionMs: number
  occurredAt: number
  response?: string
  evidenceIds: string[]
}

export interface CueSession {
  sessionId: string
  videoId: string
  contentVersion: string
  events: LearningTraceEvent[]
}

export interface LearningSummary {
  observed: Array<{
    triggerId: string
    title: string
    evidenceIds: string[]
  }>
  corrections: Array<{
    triggerId: string
    detail: string
  }>
  notObserved: Array<{
    triggerId: string
    title: string
  }>
  revisitableCueIds: string[]
}
