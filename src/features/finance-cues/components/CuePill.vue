<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineTrigger } from '../contracts'
import caibaoImage from '../assets/caibao.png'

const props = defineProps<{
  trigger: TimelineTrigger
}>()

defineEmits<{
  open: []
  dismiss: []
}>()

const accessibleLabel = computed(
  () => `财包：${props.trigger.cueLabel}，${props.trigger.prompt}，打开互动`
)
</script>

<template>
  <section
    class="cue-pill"
    data-testid="finance-cue-pill"
    data-compact-height="44"
    data-max-width="216"
    @pointerdown.stop
    @pointerup.stop
    @pointercancel.stop
    @click.stop
  >
    <button
      class="cue-main"
      type="button"
      :aria-label="accessibleLabel"
      :title="trigger.cueLabel + '：' + trigger.prompt"
      @click.stop="$emit('open')"
    >
      <img :src="caibaoImage" alt="" />
      <span class="cue-copy" aria-hidden="true">
        <b>{{ trigger.cueLabel }}</b>
        <i>·</i>
        <span>{{ trigger.prompt }}</span>
      </span>
    </button>
    <button class="later" type="button" aria-label="稍后再看" @click.stop="$emit('dismiss')">
      稍后
    </button>
  </section>
</template>

<style scoped lang="less">
.cue-pill {
  position: absolute;
  left: 14px;
  bottom: 190px;
  z-index: 14;
  display: flex;
  box-sizing: border-box;
  width: min(216px, calc(100% - 92px));
  // Feed cards use a small inherited scale; 45 CSS px keeps the rendered hit target >= 44 px.
  height: 45px;
  overflow: hidden;
  color: #fff;
  background: rgba(23, 23, 21, 0.94);
  border: 1px solid rgba(255, 213, 65, 0.55);
  border-radius: 22px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(14px);
  pointer-events: auto;
  animation: cue-enter 220ms ease-out;

  button {
    color: inherit;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
}

.cue-main {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
  min-height: 45px;
  padding: 0 7px;
  text-align: left;

  img {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    object-fit: cover;
    border-radius: 8px;
    background: #ffd541;
  }
}

.cue-copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 3px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;

  b {
    flex: 0 0 auto;
    color: #ffd541;
    font-weight: 700;
  }

  i {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.45);
    font-style: normal;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.later {
  width: 45px;
  min-width: 45px;
  min-height: 45px;
  border-left: 1px solid rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.68) !important;
  font-size: 11px;
}

@keyframes cue-enter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cue-pill {
    animation: none;
  }
}
</style>
