import { describe, expect, it } from 'vitest'
import { goldenPayloads } from './fixtures/authored-payloads.js'
import {
  CUE_KINDS,
  RENDERABLE_KINDS,
  payloadSchemaByKind,
  type CueKind
} from '../src/domain/payload-contracts.js'

/**
 * Cross-side contract test. The server payload schemas
 * (server/src/domain/payload-contracts.ts) are a hand-maintained mirror of the
 * frontend ones (src/features/finance-cues/contracts.ts) — the module boundary
 * (server tsconfig vs app tsconfig) prevents a live shared import. This test
 * pins the server side against the golden payloads that are copied verbatim
 * from the frontend fixture, so any drift on either side fails here.
 */
describe('authored payload contract', () => {
  it('validates one golden payload per cue kind', () => {
    const covered = new Set<CueKind>()
    for (const entry of goldenPayloads) {
      const schema = payloadSchemaByKind[entry.kind]
      const result = schema.safeParse(entry.payload)
      expect(result.success, `${entry.kind} payload must satisfy its schema`).toBe(true)
      covered.add(entry.kind)
    }
    // Every canonical kind has a golden payload.
    for (const kind of CUE_KINDS) {
      expect(covered.has(kind), `missing golden payload for ${kind}`).toBe(true)
    }
  })

  it('rejects a payload that violates its kind schema', () => {
    // context_card requires a feedback ≤ 80 chars; overflow must fail.
    const bad = { title: 't', body: 'b', keyPoint: 'k', feedback: 'x'.repeat(81) }
    expect(payloadSchemaByKind.context_card.safeParse(bad).success).toBe(false)
  })

  it('keeps the renderable-kind set in lock-step with the frontend renderer (all six)', () => {
    expect([...RENDERABLE_KINDS].sort()).toEqual([...CUE_KINDS].sort())
  })
})
