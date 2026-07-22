import { z } from 'zod'

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

export const triggerCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    kind: z.enum([
      'context_card',
      'condition_slider',
      'causal_stitch',
      'quick_prediction',
      'evidence_compare',
      'reflection'
    ]),
    proposedStartMs: z.number().int().nonnegative(),
    proposedEndMs: z.number().int().positive(),
    priority: z.number().int().min(0).max(100),
    expectedInteractionMs: z.number().int().positive().max(12_000),
    prompt: z.string().min(1).max(80),
    learningObjective: z.string().min(1),
    rationale: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    visualLoad: z.enum(['low', 'medium', 'high'])
  })
  .refine((item) => item.proposedEndMs > item.proposedStartMs, 'Cue window must be positive')

const conceptSchema = z.object({
  conceptId: z.string().min(1),
  name: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

const semanticItemSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
})

export const semanticAnalysisSchema = z.object({
  concepts: z.array(conceptSchema),
  claims: z.array(semanticItemSchema),
  causalEdges: z.array(semanticItemSchema),
  conditions: z.array(semanticItemSchema),
  triggerCandidates: z.array(triggerCandidateSchema)
})

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
export type TriggerCandidate = z.infer<typeof triggerCandidateSchema>
export type SemanticAnalysis = z.infer<typeof semanticAnalysisSchema>
export type MediaAsset = z.infer<typeof mediaAssetSchema>

export interface DraftExperience {
  experienceId: string
  title: string
  contentVersion: string
  mediaFingerprint: string
  publishStatus: 'draft'
  blockers: string[]
  evidence: Array<TranscriptSegment | OcrEvidence>
  concepts: SemanticAnalysis['concepts']
  claims: SemanticAnalysis['claims']
  causalEdges: SemanticAnalysis['causalEdges']
  conditions: SemanticAnalysis['conditions']
  triggerCandidates: TriggerCandidate[]
  rejectedTriggerCandidates: Array<{ candidateId: string; reason: string }>
  approvedTriggers: []
}
