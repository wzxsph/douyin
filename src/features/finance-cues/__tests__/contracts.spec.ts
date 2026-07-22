import { describe, expect, it } from 'vitest'
import { approvedExperienceSchema } from '../contracts'
import { financeFedExperience } from '../fixtures/finance-fed-v1'
import { financeXiaolinAiPowerExperience } from '../fixtures/finance-xiaolin-ai-power'
import { financeXiaolinAutopilotExperience } from '../fixtures/finance-xiaolin-autopilot'

function cloneExperience(): any {
  return JSON.parse(JSON.stringify(financeFedExperience))
}

describe('approvedExperienceSchema', () => {
  it('accepts the approved finance demo package', () => {
    expect(approvedExperienceSchema.parse(financeFedExperience).triggers).toHaveLength(3)
  })

  it('rejects automatic cues closer than 45 seconds', () => {
    const experience = cloneExperience()
    experience.triggers[1].startMs = 59_000
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(false)
  })

  it('allows timeline-only nodes inside the automatic invitation gap', () => {
    const experience = cloneExperience()
    experience.triggers[1].delivery = 'timeline_only'
    experience.triggers[1].startMs = 20_000
    experience.triggers[1].endMs = 25_000
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(true)
  })

  it('does not impose a separate cap on automatic cues', () => {
    const experience = cloneExperience()
    experience.triggers = Array.from({ length: 6 }, (_, index) => ({
      ...experience.triggers[0],
      triggerId: `automatic-${index + 1}`,
      startMs: 15_000 + index * 45_000,
      endMs: 21_000 + index * 45_000,
      delivery: 'automatic'
    }))
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(true)
  })

  it('keeps all five spaced AI power and autopilot nodes automatic', () => {
    for (const experience of [financeXiaolinAiPowerExperience, financeXiaolinAutopilotExperience]) {
      expect(approvedExperienceSchema.parse(experience).triggers).toHaveLength(5)
      expect(experience.triggers.every((trigger) => trigger.delivery === 'automatic')).toBe(true)
    }
  })

  it('requires the pause/restore policy and internal PoC audit decision', () => {
    const experience = cloneExperience()
    delete experience.constraints.playbackPolicy
    experience.constraints.keepPlayback = true
    delete experience.approvalDecisionRef
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(false)
  })

  it('rejects a sheet taller than 48 percent of the viewport', () => {
    const experience = cloneExperience()
    experience.triggers[0].halfSheetMaxRatio = 0.5
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(false)
  })

  it('rejects content that has not been approved or lacks evidence', () => {
    const experience = cloneExperience()
    experience.triggers[0].reviewStatus = 'draft'
    experience.triggers[0].evidenceIds = []
    expect(approvedExperienceSchema.safeParse(experience).success).toBe(false)
  })
})
