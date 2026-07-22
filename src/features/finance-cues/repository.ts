import { approvedExperienceSchema, type ApprovedExperience } from './contracts'
import { financeFedExperience } from './fixtures/finance-fed-v1'

export interface ExperienceRepository {
  getExperience(experienceId: string): Promise<ApprovedExperience | null>
}

const staticExperiences: Record<string, ApprovedExperience> = {
  [financeFedExperience.experienceId]: financeFedExperience
}

export class StaticExperienceRepository implements ExperienceRepository {
  async getExperience(experienceId: string): Promise<ApprovedExperience | null> {
    const experience = staticExperiences[experienceId]
    return experience ? approvedExperienceSchema.parse(experience) : null
  }
}

export const experienceRepository: ExperienceRepository = new StaticExperienceRepository()
