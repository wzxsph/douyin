import { approvedExperienceSchema, type ApprovedExperience } from './contracts'
import { financeFedExperience } from './fixtures/finance-fed-v1'
import { financeXiaolinFifaExperience } from './fixtures/finance-xiaolin-fifa'
import { financeXiaolinAiPowerExperience } from './fixtures/finance-xiaolin-ai-power'
import { financeXiaolinAutopilotExperience } from './fixtures/finance-xiaolin-autopilot'
import { financeXiaolinAiCapitalExperience } from './fixtures/finance-xiaolin-ai-capital'
import { showcaseExperiences } from '@/showcase/catalog'

export interface ExperienceRepository {
  getExperience(experienceId: string): Promise<ApprovedExperience | null>
}

const staticExperiences: Record<string, ApprovedExperience> = {
  [financeFedExperience.experienceId]: financeFedExperience,
  [financeXiaolinFifaExperience.experienceId]: financeXiaolinFifaExperience,
  [financeXiaolinAiPowerExperience.experienceId]: financeXiaolinAiPowerExperience,
  [financeXiaolinAutopilotExperience.experienceId]: financeXiaolinAutopilotExperience,
  [financeXiaolinAiCapitalExperience.experienceId]: financeXiaolinAiCapitalExperience,
  ...showcaseExperiences
}

export class StaticExperienceRepository implements ExperienceRepository {
  async getExperience(experienceId: string): Promise<ApprovedExperience | null> {
    const experience = staticExperiences[experienceId]
    return experience ? approvedExperienceSchema.parse(experience) : null
  }
}

export const experienceRepository: ExperienceRepository = new StaticExperienceRepository()
