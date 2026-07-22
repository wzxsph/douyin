import type { TimelineTrigger, TraceAction } from './contracts'

export type TriggerStatusMap = Record<string, TraceAction | undefined>

export interface OrchestratorDecision {
  surface?: TimelineTrigger
  missed: TimelineTrigger[]
}

export function advanceCueOrchestrator(params: {
  triggers: TimelineTrigger[]
  statuses: TriggerStatusMap
  previousTimeMs: number
  currentTimeMs: number
  panelOpen: boolean
}): OrchestratorDecision {
  const { triggers, statuses, previousTimeMs, currentTimeMs, panelOpen } = params
  if (currentTimeMs < previousTimeMs) {
    return { missed: [] }
  }

  const candidates = triggers.filter((trigger) => {
    if (statuses[trigger.triggerId]) return false
    const crossedStart = previousTimeMs < trigger.startMs && currentTimeMs >= trigger.startMs
    const currentlyInside = currentTimeMs >= trigger.startMs && currentTimeMs <= trigger.endMs
    return crossedStart || currentlyInside
  })

  if (!candidates.length) return { missed: [] }
  if (panelOpen) return { missed: candidates }

  const ordered = [...candidates].sort((left, right) => {
    const distance =
      Math.abs(currentTimeMs - left.startMs) - Math.abs(currentTimeMs - right.startMs)
    return distance || right.priority - left.priority
  })

  return {
    surface: ordered[0],
    missed: ordered.slice(1)
  }
}
