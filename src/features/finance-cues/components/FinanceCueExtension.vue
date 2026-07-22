<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type {
  InteractionExitReason,
  MediaClockState,
  PauseForInteractionRequest,
  ReleaseInteractionRequest,
  VideoContext
} from '@/features/video-extensions/contracts'
import type { ApprovedExperience, TimelineTrigger, TraceAction } from '../contracts'
import { advanceCueOrchestrator } from '../orchestrator'
import { experienceRepository } from '../repository'
import { useFinanceCueStore } from '../session-store'
import { buildLearningSummary, latestActions } from '../summary'
import CaibaoHalfSheet from './CaibaoHalfSheet.vue'
import CuePill from './CuePill.vue'
import CueTimeline from './CueTimeline.vue'
import InteractionRenderer from './InteractionRenderer.vue'
import LearningSummaryView from './LearningSummaryView.vue'
import caibaoImage from '../assets/caibao.png'

const props = defineProps<{
  context: VideoContext
  clock: MediaClockState
}>()

const emit = defineEmits<{
  'request-seek': [positionMs: number]
  'sheet-open-change': [open: boolean]
  'pause-for-interaction': [request: PauseForInteractionRequest]
  'release-interaction': [request: ReleaseInteractionRequest]
}>()

const store = useFinanceCueStore()
const experience = ref<ApprovedExperience | null>(null)
const activeCue = ref<TimelineTrigger | null>(null)
const expandedCue = ref<TimelineTrigger | null>(null)
const feedback = ref('')
const summaryOpen = ref(false)
const previousTimeMs = ref(0)
let cueTimer: ReturnType<typeof setTimeout> | null = null
let interactionSequence = 0
let playbackInteractionId: string | null = null

const session = computed(() => {
  if (!experience.value) return null
  return store.hydrate(experience.value)
})

const statuses = computed<Record<string, TraceAction | undefined>>(() => {
  return session.value ? latestActions(session.value) : {}
})

const summary = computed(() => {
  if (!experience.value || !session.value) return null
  return buildLearningSummary(experience.value, session.value)
})

const sheetOpen = computed(() => Boolean(expandedCue.value || summaryOpen.value))
const hasTrace = computed(() => Boolean(session.value?.events.length))

watch(
  () => [props.context.videoId, props.context.financeExperienceId] as const,
  async ([videoId, experienceId]) => {
    releasePlaybackInteraction('context-change', false)
    clearCueTimer()
    activeCue.value = null
    expandedCue.value = null
    summaryOpen.value = false
    experience.value = null
    previousTimeMs.value = props.clock.currentTimeMs
    if (!experienceId) return
    const loadedExperience = await experienceRepository.getExperience(experienceId)
    if (props.context.videoId !== videoId || props.context.financeExperienceId !== experienceId) {
      return
    }
    if (
      !loadedExperience ||
      loadedExperience.videoId !== videoId ||
      loadedExperience.mediaFingerprint !== props.context.item?.mediaFingerprint
    ) {
      return
    }
    experience.value = loadedExperience
    if (experience.value) store.hydrate(experience.value)
  },
  { immediate: true }
)

watch(
  () => props.clock.currentTimeMs,
  (currentTimeMs) => {
    const currentExperience = experience.value
    if (!currentExperience) {
      previousTimeMs.value = currentTimeMs
      return
    }

    const decision = advanceCueOrchestrator({
      triggers: currentExperience.triggers.filter((trigger) => trigger.delivery === 'automatic'),
      statuses: statuses.value,
      previousTimeMs: previousTimeMs.value,
      currentTimeMs,
      panelOpen: sheetOpen.value || Boolean(activeCue.value)
    })

    decision.missed.forEach((trigger) => {
      record(trigger, 'missed')
    })
    if (decision.surface) surface(decision.surface)
    previousTimeMs.value = currentTimeMs
  }
)

watch(
  () => props.clock.ended,
  (ended) => {
    if (ended && experience.value) {
      closeCue(false)
      expandedCue.value = null
      summaryOpen.value = true
      ensurePlaybackPaused('summary')
    }
  }
)

watch(sheetOpen, (open) => emit('sheet-open-change', open), { immediate: true })

onBeforeUnmount(() => {
  clearCueTimer()
  releasePlaybackInteraction('unmounted', false)
  emit('sheet-open-change', false)
})

function clearCueTimer() {
  if (cueTimer) clearTimeout(cueTimer)
  cueTimer = null
}

function record(
  trigger: TimelineTrigger,
  action: TraceAction,
  response?: string,
  evidenceIds: string[] = []
) {
  if (!experience.value) return
  store.record(experience.value, {
    triggerId: trigger.triggerId,
    action,
    playbackPositionMs: props.clock.currentTimeMs,
    response,
    evidenceIds
  })
}

function surface(trigger: TimelineTrigger) {
  if (activeCue.value || sheetOpen.value) {
    record(trigger, 'missed')
    return
  }
  activeCue.value = trigger
  record(trigger, 'surfaced')
  clearCueTimer()
  cueTimer = setTimeout(() => closeCue(true), trigger.cueDurationMs)
}

function openCue(trigger: TimelineTrigger) {
  clearCueTimer()
  activeCue.value = null
  feedback.value = ''
  ensurePlaybackPaused(trigger.triggerId)
  expandedCue.value = trigger
  summaryOpen.value = false
  record(trigger, 'expanded')
}

function closeCue(recordDismissal = true) {
  const trigger = activeCue.value
  clearCueTimer()
  activeCue.value = null
  if (trigger && recordDismissal) record(trigger, 'dismissed')
}

function closeSheet(reason: InteractionExitReason = feedback.value ? 'completed' : 'closed') {
  expandedCue.value = null
  summaryOpen.value = false
  feedback.value = ''
  releasePlaybackInteraction(reason, true)
}

function complete(payload: { response: string; feedback: string }) {
  const trigger = expandedCue.value
  if (!trigger) return
  record(trigger, 'completed', payload.response, trigger.evidenceIds)
  feedback.value = payload.feedback
}

function skipInteraction() {
  const trigger = expandedCue.value
  if (trigger) record(trigger, 'dismissed')
  closeSheet('skipped')
}

function revisit(triggerId: string) {
  const trigger = experience.value?.triggers.find((candidate) => candidate.triggerId === triggerId)
  if (!trigger) return
  closeCue(false)
  record(trigger, 'revisited')
  emit('request-seek', trigger.startMs)
  openCue(trigger)
}

function openSummary() {
  closeCue(false)
  ensurePlaybackPaused('summary')
  expandedCue.value = null
  summaryOpen.value = true
}

function ensurePlaybackPaused(sourceId: string) {
  if (playbackInteractionId) return
  playbackInteractionId = `${props.context.videoId}:${sourceId}:${++interactionSequence}`
  emit('pause-for-interaction', {
    type: 'pause-for-interaction',
    interactionId: playbackInteractionId
  })
}

function releasePlaybackInteraction(reason: InteractionExitReason, allowResume: boolean) {
  if (!playbackInteractionId) return
  const interactionId = playbackInteractionId
  playbackInteractionId = null
  emit('release-interaction', {
    type: 'release-interaction',
    interactionId,
    reason,
    allowResume
  })
}
</script>

<template>
  <div v-if="experience" class="finance-extension" data-testid="finance-cue-extension">
    <div class="prototype-badge">财经推演 · 工程原型</div>
    <CuePill
      v-if="activeCue"
      :trigger="activeCue"
      @open="openCue(activeCue)"
      @dismiss="closeCue(true)"
    />

    <button
      v-if="hasTrace && !sheetOpen"
      type="button"
      class="trace-shortcut"
      data-testid="finance-trace-shortcut"
      @click.stop="openSummary"
      @pointerdown.stop
      @pointerup.stop
    >
      <img :src="caibaoImage" alt="" />
      <span>学习足迹</span>
    </button>

    <CueTimeline
      :triggers="experience.triggers"
      :statuses="statuses"
      :duration-ms="clock.durationMs"
      @revisit="revisit"
    />

    <CaibaoHalfSheet
      v-if="expandedCue"
      :title="expandedCue.payload.title"
      :eyebrow="expandedCue.cueLabel"
      @close="closeSheet"
    >
      <div v-if="feedback" class="feedback" data-testid="finance-feedback">
        <b>财包的反馈</b>
        <p>{{ feedback }}</p>
        <button type="button" @click.stop="closeSheet()">收好，继续看</button>
      </div>
      <div v-else class="interaction-task">
        <InteractionRenderer :trigger="expandedCue" @complete="complete" />
        <button
          type="button"
          class="skip-interaction"
          data-testid="finance-skip-interaction"
          @click.stop="skipInteraction"
        >
          跳过，继续看
        </button>
      </div>
    </CaibaoHalfSheet>

    <CaibaoHalfSheet
      v-else-if="summaryOpen && summary"
      title="这段视频，你实际看懂了什么"
      eyebrow="过程式学习总结"
      @close="closeSheet"
    >
      <LearningSummaryView :experience="experience" :summary="summary" @revisit="revisit" />
    </CaibaoHalfSheet>
  </div>
</template>

<style scoped lang="less">
.finance-extension {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.prototype-badge {
  position: absolute;
  top: calc(62px + env(safe-area-inset-top));
  left: 14px;
  z-index: 12;
  padding: 5px 9px;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(0, 0, 0, 0.46);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.03em;
  backdrop-filter: blur(8px);
}

.trace-shortcut {
  position: absolute;
  z-index: 17;
  right: 14px;
  bottom: 104px;
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 6px;
  color: #29271f;
  background: rgba(255, 213, 65, 0.96);
  border: 0;
  border-radius: 22px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  cursor: pointer;

  img {
    width: 34px;
    height: 34px;
    object-fit: cover;
    border-radius: 50%;
    background: #fff4c2;
  }

  span {
    font-size: 12px;
    font-weight: 700;
  }
}

.feedback {
  display: grid;
  gap: 10px;

  b {
    color: #8a681b;
    font-size: 13px;
  }

  p {
    margin: 0;
    color: #4e493f;
    font-size: 14px;
    line-height: 1.65;
  }

  button {
    min-height: 44px;
    color: #1b1a16;
    background: #ffd541;
    border: 0;
    border-radius: 12px;
    font-weight: 700;
    cursor: pointer;
  }
}

.interaction-task {
  display: grid;
  gap: 10px;
}

.skip-interaction {
  min-width: 44px;
  min-height: 44px;
  color: #6d6558;
  background: transparent;
  border: 1px solid #d7cebd;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
