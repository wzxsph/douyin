import { describe, expect, it } from 'vitest'
import { approvedExperienceSchema } from '../contracts'
import { financeFedExperience } from '../fixtures/finance-fed-v1'

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
