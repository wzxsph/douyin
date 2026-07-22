import type {
  SemanticEvent,
  SemanticEventType,
  SemanticTimeline,
  SubSignals,
  TriggerCandidate
} from '../domain/contracts.js'
import type { CueKind } from '../domain/payload-contracts.js'

/**
 * Deterministic cue scorer. Turns each SemanticEvent into a TriggerCandidate by
 * mapping its type to a renderable-or-not CueKind and computing a 0..100 priority
 * from a versioned weight table. No LLM, no clocks, no randomness: identical input
 * yields deep-equal output.
 */

// ── Event → kind mapping ─────────────────────────────────────────────────────

/** Exhaustive map from every SemanticEventType to the cue kind it seeds. */
export const EVENT_KIND_MAP: Record<SemanticEventType, CueKind> = {
  concept_first_mention: 'context_card',
  causal_jump: 'causal_stitch',
  condition_boundary: 'condition_slider',
  directional_claim: 'quick_judgment',
  counterexample_window: 'counterexample_flip',
  concept_confusion: 'concept_compare'
}

export function kindForEvent(type: SemanticEventType): CueKind {
  return EVENT_KIND_MAP[type]
}

// ── Versioned weight table ───────────────────────────────────────────────────

export const WEIGHT_TABLE_VERSION = 'cue-weights.v1'

/**
 * Priority weights. Three dimensions come straight from the model's subSignals
 * (learningValue, timeSensitivity, interactionFit); the other three are computed
 * deterministically below. Weights sum to 1 so the raw score stays in 0..1.
 */
export const WEIGHTS = {
  learningValue: 0.28,
  evidenceStrength: 0.22,
  timeSensitivity: 0.18,
  interactionFit: 0.14,
  cognitiveLoad: 0.1,
  spacingNovelty: 0.08
} as const

// ── Deterministic constants ──────────────────────────────────────────────────

const CUE_DURATION_MS = 5000
const DEFAULT_EXPECTED_INTERACTION_MS = 9000
const MAX_EXPECTED_INTERACTION_MS = 12000
const MAX_PRIORITY = 100
const MAX_PROMPT_LENGTH = 40

/** Evidence-count normaliser: this many evidenceIds saturates the count term. */
const EVIDENCE_COUNT_SATURATION = 3
/** OCR items overlapping a window at which cognitive load is considered maxed. */
const DENSE_OCR_SATURATION = 4
/** Spacing gap (ms) at which the spacing term is fully rewarded. */
const SPACING_SATURATION_MS = 60_000

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

// ── Computed dimensions ──────────────────────────────────────────────────────

/**
 * Evidence strength in 0..1 from three deterministic parts, averaged:
 *  - breadth: evidenceId count normalised against EVIDENCE_COUNT_SATURATION
 *  - reliability: the minimum indexed confidence across the cited evidence
 *  - corroboration: 1 when both asr and ocr sources back the event, else 0
 * Returns 0 when the event cites no evidence.
 */
export function evidenceStrength(event: SemanticEvent, timeline: SemanticTimeline): number {
  if (!event.evidenceIds.length) return 0

  const entries = event.evidenceIds
    .map((id) => timeline.evidenceIndex.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  const breadth = clamp01(event.evidenceIds.length / EVIDENCE_COUNT_SATURATION)

  const confidences = entries
    .map((entry) => entry.confidence)
    .filter((value): value is number => value !== undefined)
  const reliability = confidences.length ? Math.min(...confidences) : 0

  const sources = new Set(entries.map((entry) => entry.source))
  const corroboration = sources.has('asr') && sources.has('ocr') ? 1 : 0

  return clamp01((breadth + reliability + corroboration) / 3)
}

/**
 * Cognitive load as an INVERTED 0..1 score (low on-screen load → high score).
 * Heuristic: count OCR-source evidence whose timestamp falls inside the event's
 * window; a denser screen means a busier frame, so we return 1 minus that
 * normalised density. Windowless or empty timelines score a full 1 (no load).
 */
export function cognitiveLoad(event: SemanticEvent, timeline: SemanticTimeline): number {
  const window = timeline.windows.find((candidate) => candidate.windowId === event.windowId)
  if (!window) return 1

  let ocrInWindow = 0
  for (const entry of timeline.evidenceIndex.values()) {
    if (entry.source !== 'ocr') continue
    if (entry.startMs >= window.startMs && entry.startMs <= window.endMs) ocrInWindow += 1
  }

  const density = clamp01(ocrInWindow / DENSE_OCR_SATURATION)
  return clamp01(1 - density)
}

/**
 * Spacing + novelty in 0..1 relative to the events already scored, averaged:
 *  - spacing: distance in ms to the nearest earlier event's timeMs, normalised
 *    against SPACING_SATURATION_MS (first event, with nothing before it, is 1)
 *  - novelty: 1 when this event's (kind, learningObjective) pairing is unseen so
 *    far, otherwise 0.5 for a repeat
 */
export function spacingNovelty(
  event: SemanticEvent,
  kind: CueKind,
  learningObjective: string,
  scored: ReadonlyArray<{ timeMs: number; kind: CueKind; learningObjective: string }>
): number {
  const previousTimes = scored.map((item) => item.timeMs)
  const nearestGap = previousTimes.length
    ? Math.min(...previousTimes.map((time) => Math.abs(event.timeMs - time)))
    : SPACING_SATURATION_MS
  const spacing = clamp01(nearestGap / SPACING_SATURATION_MS)

  const seen = scored.some(
    (item) => item.kind === kind && item.learningObjective === learningObjective
  )
  const novelty = seen ? 0.5 : 1

  return clamp01((spacing + novelty) / 2)
}

// ── Candidate derivation ─────────────────────────────────────────────────────

/**
 * Map an inverted cognitive-load score back to a visual-load bucket. Low load
 * score means a busy frame, so it surfaces as 'high' visual load.
 */
function visualLoadFor(loadScore: number): TriggerCandidate['visualLoad'] {
  if (loadScore < 0.34) return 'high'
  if (loadScore < 0.67) return 'medium'
  return 'low'
}

/** Neutral, structural placeholder objective — never finance-specific language. */
function objectiveFor(event: SemanticEvent): string {
  return `Review ${event.type} at window ${event.windowId}`
}

/** Neutral prompt placeholder, clamped to MAX_PROMPT_LENGTH characters. */
function promptFor(event: SemanticEvent): string {
  return `Check point ${event.eventId}`.slice(0, MAX_PROMPT_LENGTH)
}

interface ScoredMemo {
  timeMs: number
  kind: CueKind
  learningObjective: string
}

function deriveCandidate(
  event: SemanticEvent,
  timeline: SemanticTimeline,
  scored: ScoredMemo[],
  expectedInteractionMs: number
): TriggerCandidate {
  const kind = kindForEvent(event.type)
  const learningObjective = objectiveFor(event)

  const dimensions = {
    learningValue: event.subSignals.learningValue,
    evidenceStrength: evidenceStrength(event, timeline),
    timeSensitivity: event.subSignals.timeSensitivity,
    interactionFit: event.subSignals.interactionFit,
    cognitiveLoad: cognitiveLoad(event, timeline),
    spacingNovelty: spacingNovelty(event, kind, learningObjective, scored)
  }

  const rawScore =
    WEIGHTS.learningValue * dimensions.learningValue +
    WEIGHTS.evidenceStrength * dimensions.evidenceStrength +
    WEIGHTS.timeSensitivity * dimensions.timeSensitivity +
    WEIGHTS.interactionFit * dimensions.interactionFit +
    WEIGHTS.cognitiveLoad * dimensions.cognitiveLoad +
    WEIGHTS.spacingNovelty * dimensions.spacingNovelty

  const priority = Math.min(MAX_PRIORITY, Math.max(0, Math.round(MAX_PRIORITY * rawScore)))

  const proposedStartMs = event.timeMs
  const proposedEndMs = Math.min(timeline.durationMs, proposedStartMs + CUE_DURATION_MS)
  const subSignals: SubSignals = {
    learningValue: event.subSignals.learningValue,
    timeSensitivity: event.subSignals.timeSensitivity,
    interactionFit: event.subSignals.interactionFit
  }

  return {
    candidateId: `cue-${event.eventId}`,
    sourceEventId: event.eventId,
    kind,
    proposedStartMs,
    proposedEndMs: Math.max(proposedEndMs, proposedStartMs + 1),
    windowId: event.windowId,
    priority,
    expectedInteractionMs,
    prompt: promptFor(event),
    learningObjective,
    rationale: event.rationale ?? `${event.type} at ${event.timeMs}ms`,
    evidenceIds: [...event.evidenceIds],
    visualLoad: visualLoadFor(dimensions.cognitiveLoad),
    subSignals
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface ScoreEventsResult {
  candidates: TriggerCandidate[]
  weightTableVersion: string
}

/**
 * Score every SemanticEvent into a TriggerCandidate. Events are processed in the
 * given order so the spacing/novelty term sees a stable "already scored" prefix;
 * the result is fully deterministic for identical input.
 */
export function scoreEvents(
  events: SemanticEvent[],
  timeline: SemanticTimeline,
  options: { expectedInteractionMs?: number } = {}
): ScoreEventsResult {
  const expectedInteractionMs = Math.min(
    MAX_EXPECTED_INTERACTION_MS,
    options.expectedInteractionMs ?? DEFAULT_EXPECTED_INTERACTION_MS
  )

  const scored: ScoredMemo[] = []
  const candidates: TriggerCandidate[] = []

  for (const event of events) {
    const candidate = deriveCandidate(event, timeline, scored, expectedInteractionMs)
    candidates.push(candidate)
    scored.push({
      timeMs: event.timeMs,
      kind: candidate.kind,
      learningObjective: candidate.learningObjective
    })
  }

  return { candidates, weightTableVersion: WEIGHT_TABLE_VERSION }
}
