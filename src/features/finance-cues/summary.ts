import type { ApprovedExperience, CueSession, LearningSummary, TraceAction } from './contracts'

const terminalActions: TraceAction[] = ['completed', 'dismissed', 'missed']

export function latestActions(session: CueSession): Record<string, TraceAction> {
  return session.events.reduce<Record<string, TraceAction>>((result, event) => {
    // A later revisit is navigation, not a regression of learning evidence.
    // Once a cue is completed it remains completed unless another completion
    // replaces its payload.
    if (result[event.triggerId] !== 'completed' || event.action === 'completed') {
      result[event.triggerId] = event.action
    }
    return result
  }, {})
}

export function buildLearningSummary(
  experience: ApprovedExperience,
  session: CueSession
): LearningSummary {
  const latest = latestActions(session)
  const observed = experience.triggers
    .filter((trigger) => latest[trigger.triggerId] === 'completed')
    .map((trigger) => ({
      triggerId: trigger.triggerId,
      title: trigger.learningObjective,
      evidenceIds: trigger.evidenceIds
    }))

  const notObserved = experience.triggers
    .filter((trigger) => {
      const action = latest[trigger.triggerId]
      return !action || action === 'dismissed' || action === 'missed'
    })
    .map((trigger) => ({
      triggerId: trigger.triggerId,
      title: trigger.learningObjective
    }))

  const corrections = session.events
    .filter((event) => event.action === 'completed' && event.response)
    .map((event) => ({
      triggerId: event.triggerId,
      detail: event.response || ''
    }))

  const revisitableCueIds = experience.triggers
    .filter((trigger) => {
      const action = latest[trigger.triggerId]
      return !action || terminalActions.includes(action)
    })
    .map((trigger) => trigger.triggerId)

  return {
    observed,
    corrections,
    notObserved,
    revisitableCueIds
  }
}
