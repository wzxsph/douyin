import type {
  Claim,
  Condition,
  Direction,
  DirectionResolution,
  SemanticGraph,
  TriggerCandidate
} from '../domain/contracts.js'

/**
 * Versioned direction rule engine (PRD §9.2 / §21.3).
 *
 * The RULE ENGINE — never the model — decides an asset direction. A candidate's
 * referenced conditions and claims are normalised into a deterministic signature
 * which is looked up in a versioned table. Unknown signatures always resolve to
 * `insufficient`; the model is not allowed to "fill in" a direction.
 *
 * CRITICAL: `Claim.assertedDirection` is the model's guess. It is IGNORED for the
 * resolution — the rule table always wins. We never read it to pick a direction
 * (see `resolveDirection`); it may only ever be cross-checked by callers, never
 * substituted. This is the schema/permission boundary from PRD §19.1 (交互方向:
 * 无模型决定) made explicit in code.
 */
export const RULE_ENGINE_VERSION = 'direction-rules.v1'

/**
 * Canonical path labels activated by the rule table. These name the competing
 * transmission paths from the two P0 causal chains (PRD §12.2):
 * - valuation_support: 政策利率下降 → 折现率下降 → 估值获得支撑 (equity chain).
 * - earnings_pressure: 增长走弱 → 盈利下修 → 估值承压 (competing equity path).
 * - gold_support: 实际利率下降 → 黄金机会成本下降 → 黄金获支撑 (gold chain).
 * - relative_rate_differential: 汇率看相对利差，不看美国绝对利率 (cross-chain fx).
 */
export const ACTIVATED_PATHS = {
  valuationSupport: 'valuation_support',
  earningsPressure: 'earnings_pressure',
  goldSupport: 'gold_support',
  relativeRateDifferential: 'relative_rate_differential'
} as const

/**
 * Normalised signal tokens derived from a candidate's referenced conditions and
 * claims. A token is `variable:operator` (e.g. `policy_rate:decrease`) or a bare
 * asset-class marker (e.g. `asset:equity`). Building a signature from these keeps
 * the lookup deterministic and independent of evidence-id ordering.
 */
const SIGNAL_VARIABLES = {
  policyRate: 'policy_rate',
  inflation: 'inflation',
  growth: 'growth',
  riskAversion: 'risk_aversion',
  foreignPolicyRate: 'foreign_policy_rate'
} as const

interface RuleEntry {
  readonly signature: string
  readonly direction: Direction
  readonly activatedPaths: readonly string[]
  /** Populated only for `insufficient` outcomes that still carry a reason. */
  readonly insufficientReason?: string
}

/**
 * The versioned rule table: the three approved P0 scenarios (PRD §9.3 A/B/C),
 * keyed by a normalised, order-independent condition signature.
 *
 * The direction each scenario locks:
 * - A 温和降息 → support_dominant (equity valuation + gold both supported).
 * - B 衰退式降息 → conflict (valuation support competes with earnings pressure;
 *   PRD §21.3 permits pressure_dominant OR conflict — v1 LOCKS `conflict`).
 * - C 相对降息 → insufficient (fx depends on the relative differential which the
 *   inputs do not determine; USD weakness must NOT be hardcoded — PRD §21.3).
 *   The relative-rate path is still activated so the reason is traceable.
 */
const RULE_TABLE: readonly RuleEntry[] = [
  {
    // A 温和降息: 利率下降、通胀下降、避险低. Growth "stable" is not a threshold
    // operator in the Condition enum, so it is NOT encoded as a token; scenario A
    // is positively identified by low risk-aversion + falling inflation, and by
    // the ABSENCE of the `growth:decrease` token that defines scenario B.
    signature: 'inflation:decrease|policy_rate:decrease|risk_aversion:below',
    direction: 'support_dominant',
    activatedPaths: [ACTIVATED_PATHS.valuationSupport, ACTIVATED_PATHS.goldSupport]
  },
  {
    // B 衰退式降息: 利率下降、增长明显走弱、避险升高
    signature: 'growth:decrease|policy_rate:decrease|risk_aversion:above',
    direction: 'conflict',
    activatedPaths: [ACTIVATED_PATHS.valuationSupport, ACTIVATED_PATHS.earningsPressure]
  },
  {
    // C 相对降息: 美国降息、其他经济体降息更多 → 汇率看相对利差，美元未必走弱
    signature: 'foreign_policy_rate:decrease|policy_rate:decrease',
    direction: 'insufficient',
    activatedPaths: [ACTIVATED_PATHS.relativeRateDifferential],
    insufficientReason:
      'Relative rate differential is indeterminate: USD direction is not fixed by policy-rate cuts alone (PRD §9.3 C).'
  }
] as const

const RULE_BY_SIGNATURE: ReadonlyMap<string, RuleEntry> = new Map(
  RULE_TABLE.map((entry) => [entry.signature, entry])
)

/**
 * Only these kinds imply an asset direction and get a real table lookup. Purely
 * expository kinds (context_card, concept_compare) never assert a direction and
 * resolve to `insufficient` — but still return a valid DirectionResolution.
 */
const DIRECTIONAL_KINDS: ReadonlySet<TriggerCandidate['kind']> = new Set<TriggerCandidate['kind']>([
  'condition_slider',
  'causal_stitch',
  'counterexample_flip',
  'quick_judgment'
])

const REASON_NON_DIRECTIONAL_KIND =
  'Cue kind does not assert an asset direction; no rule lookup performed.'
const REASON_NO_SIGNALS =
  'Candidate references no conditions or claims from the graph; signature is empty.'
const REASON_UNKNOWN_SIGNATURE =
  'Condition signature is not in the versioned rule table; direction is undetermined.'

function normaliseCondition(condition: Condition): string {
  return `${condition.variable}:${condition.operator}`
}

/**
 * Collect the conditions and claims a candidate references. A candidate links to
 * graph nodes through shared evidenceIds (its traceability set), so any condition
 * or claim that shares at least one evidenceId is considered referenced.
 */
function collectReferences(
  candidate: TriggerCandidate,
  graph: SemanticGraph
): { conditions: Condition[]; claims: Claim[] } {
  const evidence = new Set(candidate.evidenceIds)
  const references = (ids: readonly string[]): boolean => ids.some((id) => evidence.has(id))
  return {
    conditions: graph.conditions.filter((condition) => references(condition.evidenceIds)),
    claims: graph.claims.filter((claim) => references(claim.evidenceIds))
  }
}

/**
 * Build a deterministic, order-independent signature from referenced conditions
 * and claims. Only the modelled signal variables contribute; unknown variables
 * are dropped so an unrecognised combo collapses to a signature the table lacks
 * (→ insufficient) rather than a false match.
 */
function buildSignature(conditions: Condition[], claims: Claim[]): string {
  const known = new Set<string>(Object.values(SIGNAL_VARIABLES))
  const tokens = new Set<string>()
  for (const condition of conditions) {
    if (known.has(condition.variable)) tokens.add(normaliseCondition(condition))
  }
  // Claims contribute asset-class context but NEVER their assertedDirection.
  for (const claim of claims) {
    if (claim.assetClass) tokens.add(`asset:${claim.assetClass}`)
  }
  return [...tokens].sort().join('|')
}

/**
 * Match a full signature against the rule table. The table keys use only the
 * decision-relevant condition tokens, so we test whether every token of a rule
 * key is present in the candidate's signature (asset tokens are additive context
 * and do not need to appear in the key).
 */
function matchRule(signatureTokens: Set<string>): RuleEntry | undefined {
  for (const entry of RULE_TABLE) {
    const required = entry.signature.split('|')
    if (required.every((token) => signatureTokens.has(token))) return entry
  }
  return RULE_BY_SIGNATURE.get([...signatureTokens].sort().join('|'))
}

function insufficient(
  candidate: TriggerCandidate,
  reason: string,
  activatedPaths: readonly string[] = []
): DirectionResolution {
  return {
    candidateId: candidate.candidateId,
    direction: 'insufficient',
    activatedPaths: [...activatedPaths],
    evidenceIds: [...candidate.evidenceIds],
    insufficientReason: reason,
    ruleVersion: RULE_ENGINE_VERSION
  }
}

/**
 * Resolve the asset direction for a single candidate via the versioned rule table.
 *
 * Always returns a valid DirectionResolution with `ruleVersion` set. The model's
 * `assertedDirection` is never consulted here — the rule table is the sole source
 * of truth; unknown/empty signatures yield `insufficient` with a reason.
 */
export function resolveDirection(
  candidate: TriggerCandidate,
  graph: SemanticGraph
): DirectionResolution {
  if (!DIRECTIONAL_KINDS.has(candidate.kind)) {
    return insufficient(candidate, REASON_NON_DIRECTIONAL_KIND)
  }

  const { conditions, claims } = collectReferences(candidate, graph)
  const signature = buildSignature(conditions, claims)
  if (!signature) return insufficient(candidate, REASON_NO_SIGNALS)

  const entry = matchRule(new Set(signature.split('|')))
  if (!entry) return insufficient(candidate, REASON_UNKNOWN_SIGNATURE)

  if (entry.direction === 'insufficient') {
    return insufficient(
      candidate,
      entry.insufficientReason ?? REASON_UNKNOWN_SIGNATURE,
      entry.activatedPaths
    )
  }

  return {
    candidateId: candidate.candidateId,
    direction: entry.direction,
    activatedPaths: [...entry.activatedPaths],
    evidenceIds: [...candidate.evidenceIds],
    ruleVersion: RULE_ENGINE_VERSION
  }
}

/** Resolve many candidates deterministically, preserving input order. */
export function resolveMany(
  candidates: TriggerCandidate[],
  graph: SemanticGraph
): DirectionResolution[] {
  return candidates.map((candidate) => resolveDirection(candidate, graph))
}
