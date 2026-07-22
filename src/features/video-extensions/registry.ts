import { financeCueExtension } from '@/features/finance-cues'
import type { VideoContext, VideoExtensionDefinition } from './contracts'

const definitions: VideoExtensionDefinition[] = [financeCueExtension].sort(
  (left, right) => right.priority - left.priority
)

export function resolveVideoExtension(context: VideoContext): VideoExtensionDefinition | null {
  return definitions.find((definition) => definition.match(context)) || null
}
