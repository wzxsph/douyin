<script setup lang="ts">
import type { TimelineTrigger, TraceAction } from '../contracts'

const props = defineProps<{
  triggers: TimelineTrigger[]
  statuses: Record<string, TraceAction | undefined>
  durationMs: number
}>()

defineEmits<{
  revisit: [triggerId: string]
}>()

function position(trigger: TimelineTrigger): string {
  const duration = props.durationMs || Math.max(...props.triggers.map((item) => item.endMs), 1)
  return Math.min(98, Math.max(2, (trigger.startMs / duration) * 100)) + '%'
}

function statusClass(triggerId: string): string {
  const status = props.statuses[triggerId]
  if (status === 'completed') return 'completed'
  if (status === 'dismissed' || status === 'missed') return 'pending'
  if (status) return 'seen'
  return 'scheduled'
}
</script>

<template>
  <div
    class="cue-timeline"
    data-testid="finance-cue-timeline"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @pointercancel.stop
    @click.stop
  >
    <i class="track"></i>
    <button
      v-for="trigger in triggers"
      :key="trigger.triggerId"
      type="button"
      :class="statusClass(trigger.triggerId)"
      :style="{ left: position(trigger) }"
      :aria-label="'回看：' + trigger.prompt"
      @click.stop="$emit('revisit', trigger.triggerId)"
    >
      <span></span>
    </button>
  </div>
</template>

<style scoped lang="less">
.cue-timeline {
  position: absolute;
  right: 7%;
  bottom: 12px;
  left: 7%;
  z-index: 16;
  height: 44px;
  pointer-events: auto;

  .track {
    position: absolute;
    top: 21px;
    right: 0;
    left: 0;
    height: 2px;
    background: rgba(255, 255, 255, 0.28);
  }

  button {
    position: absolute;
    top: 0;
    width: 44px;
    height: 44px;
    padding: 0;
    transform: translateX(-50%);
    background: transparent;
    border: 0;
    cursor: pointer;

    span {
      display: block;
      width: 9px;
      height: 9px;
      margin: auto;
      background: #8e8b84;
      border: 2px solid rgba(0, 0, 0, 0.48);
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
    }

    &.completed span {
      background: #64b88d;
    }

    &.pending span {
      background: #ffd541;
    }

    &.seen span {
      background: #fff1b7;
    }
  }
}
</style>
