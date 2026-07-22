import type { VideoExtensionDefinition } from '@/features/video-extensions/contracts'
import FinanceCueExtension from './components/FinanceCueExtension.vue'

export const financeCueExtension: VideoExtensionDefinition = {
  key: 'finance-cues',
  priority: 100,
  match: (context) => Boolean(context.financeExperienceId),
  component: FinanceCueExtension
}
