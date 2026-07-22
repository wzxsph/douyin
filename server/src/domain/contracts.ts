import { z } from 'zod'
import type { AuthoredPayload } from './payload-contracts.js'
import { cueKindSchema } from './payload-contracts.js'

// ── Evidence (unchanged shapes; consumed by ASR/OCR providers) ───────────────

export const transcriptSegmentSchema = z
  .object({
    evidenceId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string().min(1),
    confidence: z.number().min(0).max(1).optional()
  })
  .refine((item) => item.endMs > item.startMs, 'ASR endMs must be greater than startMs')

export const transcriptSchema = z.object({
  fullText: z.string(),
  segments: z.array(transcriptSegmentSchema)
})

export const ocrEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  frameId: z.string().min(1),
  timeMs: z.number().int().nonnegative(),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  boundingBox: z
    .object({
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive()
    })
    .optional()
})

// ── Direction enum (rule-engine owned) ───────────────────────────────────────

export const DIRECTIONS = [
  'support_dominant',
  'pressure_dominant',
  'conflict',
  'insufficient'
] as const
export const directionSchema = z.enum(DIRECTIONS)
export type Direction = z.infer<typeof directionSchema>

// ── Rich semantic graph (replaces the flat semanticItemSchema) ───────────────

const nodeRefSchema = z.object({
  nodeType: z.enum(['concept', 'claim']),
  nodeId: z.string().min(1)
})

export const conceptSchema = z.object({
  conceptId: z.string().min(1),
  name: z.string().min(1),
  firstMentionMs: z.number().int().nonnegative().optional(),
  isCore: z.boolean().optional(),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

export const claimSchema = z.object({
  claimId: z.string().min(1),
  statement: z.string().min(1),
  assetClass: z.enum(['equity', 'gold', 'fx']).nullable().optional(),
  assertedDirection: directionSchema.nullable().optional(),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

export const causalEdgeSchema = z.object({
  edgeId: z.string().min(1),
  from: nodeRefSchema,
  to: nodeRefSchema,
  mechanism: z.string().min(1),
  omittedIntermediate: z.boolean(),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

export const conditionSchema = z.object({
  conditionId: z.string().min(1),
  variable: z.string().min(1),
  operator: z.enum(['increase', 'decrease', 'above', 'below', 'crosses']),
  threshold: z.number().optional(),
  unit: z.string().optional(),
  affectsEdgeId: z.string().optional(),
  statement: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

export const SEMANTIC_EVENT_TYPES = [
  'concept_first_mention',
  'causal_jump',
  'condition_boundary',
  'directional_claim',
  'counterexample_window',
  'concept_confusion'
] as const
export const semanticEventTypeSchema = z.enum(SEMANTIC_EVENT_TYPES)
export type SemanticEventType = z.infer<typeof semanticEventTypeSchema>

export const subSignalsSchema = z.object({
  learningValue: z.number().min(0).max(1),
  timeSensitivity: z.number().min(0).max(1),
  interactionFit: z.number().min(0).max(1)
})

export const semanticEventSchema = z.object({
  eventId: z.string().min(1),
  type: semanticEventTypeSchema,
  timeMs: z.number().int().nonnegative(),
  windowId: z.string().min(1),
  refs: z.object({
    conceptIds: z.array(z.string()).default([]),
    edgeIds: z.array(z.string()).default([]),
    conditionIds: z.array(z.string()).default([]),
    claimIds: z.array(z.string()).default([])
  }),
  evidenceIds: z.array(z.string().min(1)).min(1),
  subSignals: subSignalsSchema,
  rationale: z.string().max(120).optional()
})

export const semanticGraphSchema = z.object({
  concepts: z.array(conceptSchema),
  claims: z.array(claimSchema),
  causalEdges: z.array(causalEdgeSchema),
  conditions: z.array(conditionSchema),
  semanticEvents: z.array(semanticEventSchema)
})

export type Concept = z.infer<typeof conceptSchema>
export type Claim = z.infer<typeof claimSchema>
export type CausalEdge = z.infer<typeof causalEdgeSchema>
export type Condition = z.infer<typeof conditionSchema>
export type SemanticEvent = z.infer<typeof semanticEventSchema>
export type SubSignals = z.infer<typeof subSignalsSchema>
export type SemanticGraph = z.infer<typeof semanticGraphSchema>

// ── SemanticTimeline (deterministic scaffold) ────────────────────────────────

export const timelineWindowSchema = z.object({
  windowId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  source: z.enum(['shot', 'utterance_gap', 'fixed'])
})
export type TimelineWindow = z.infer<typeof timelineWindowSchema>

export interface EvidenceIndexEntry {
  startMs: number
  endMs: number
  source: 'asr' | 'ocr'
  confidence?: number
}

export interface SemanticTimeline {
  durationMs: number
  windows: TimelineWindow[]
  evidenceIndex: Map<string, EvidenceIndexEntry>
}

// ── Derived trigger candidate (scorer output; model no longer emits priority) ─

export const CUE_REJECTION_REASONS = [
  'EVIDENCE_REQUIRED',
  'EVIDENCE_NOT_FOUND',
  'MIN_GAP_VIOLATION',
  'MAX_CONTENT_NODE_COUNT',
  'HIGH_VISUAL_LOAD',
  'UNSAFE_FINANCIAL_LANGUAGE',
  'OUTSIDE_MEDIA_DURATION',
  'REPAIR_EXHAUSTED',
  'PAYLOAD_UNAUTHORABLE',
  'NON_RENDERABLE_KIND'
] as const
export type CueRejectionReason = (typeof CUE_REJECTION_REASONS)[number]

/**
 * A cue candidate derived deterministically by the scorer from a SemanticEvent.
 * `priority` comes from the versioned weight table, NOT the model.
 * `payload` and `direction` are filled in by later deterministic/LLM stages.
 */
export interface TriggerCandidate {
  candidateId: string
  sourceEventId: string
  kind: z.infer<typeof cueKindSchema>
  proposedStartMs: number
  proposedEndMs: number
  windowId: string
  priority: number
  expectedInteractionMs: number
  prompt: string
  learningObjective: string
  rationale: string
  evidenceIds: string[]
  visualLoad: 'low' | 'medium' | 'high'
  subSignals: SubSignals
  direction?: Direction
  activatedPaths?: string[]
  payload?: AuthoredPayload['payload']
}

export interface DirectionResolution {
  candidateId: string
  direction: Direction
  activatedPaths: string[]
  evidenceIds: string[]
  insufficientReason?: string
  ruleVersion: string
}

// ── Prepared media (unchanged) ───────────────────────────────────────────────

export interface PreparedFrame {
  frameId: string
  path: string
  timeMs: number
}

export interface PreparedMedia {
  durationMs: number
  fingerprint: string
  audio: { path: string; format: 'wav' | 'mp3' | 'ogg'; publicUrl?: string }
  frames: PreparedFrame[]
}

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>
export type Transcript = z.infer<typeof transcriptSchema>
export type OcrEvidence = z.infer<typeof ocrEvidenceSchema>

// ── Pipeline outputs ─────────────────────────────────────────────────────────

export interface DraftExperience {
  experienceId: string
  title: string
  contentVersion: string
  mediaFingerprint: string
  publishStatus: 'draft'
  blockers: string[]
  evidence: Array<TranscriptSegment | OcrEvidence>
  concepts: Concept[]
  claims: Claim[]
  causalEdges: CausalEdge[]
  conditions: Condition[]
  triggerCandidates: TriggerCandidate[]
  rejectedTriggerCandidates: Array<{ candidateId: string; reason: CueRejectionReason }>
  approvedTriggers: []
}

export interface CoverageCount {
  total: number
  coveredByAcceptedCue: number
  uncovered: string[]
}

export interface CoverageReport {
  coverage: {
    concepts: CoverageCount
    causalEdges: CoverageCount
    conditions: CoverageCount
  }
  evidenceGaps: Array<{ itemId: string; reason: 'single_source' | 'low_confidence' }>
  kindBalance: Record<string, number>
  directionResolutions: DirectionResolution[]
  rejectedCandidates: Array<{ candidateId: string; kind: string; reason: CueRejectionReason }>
  reviewDecisionsRequired: string[]
  versions: {
    contentVersion: string
    mediaFingerprint: string
    ruleEngineVersion: string
    weightTableVersion: string
    promptVersion: string
  }
}

// ── Media asset (unchanged) ──────────────────────────────────────────────────

export const mediaAssetSchema = z
  .object({
    assetId: z.string().min(1),
    source: z.enum(['user_upload', 'licensed_storage']),
    localPath: z.string().min(1),
    mimeType: z.string().regex(/^video\//),
    rightsAttested: z.boolean(),
    rightsAttestationId: z.string().min(1).optional()
  })
  .superRefine((asset, context) => {
    if (asset.rightsAttested && !asset.rightsAttestationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rightsAttestationId'],
        message: 'A rights attestation reference is required'
      })
    }
  })

export type MediaAsset = z.infer<typeof mediaAssetSchema>
