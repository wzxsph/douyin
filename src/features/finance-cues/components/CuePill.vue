<script setup lang="ts">
import type { TimelineTrigger } from '../contracts'
import caibaoImage from '../assets/caibao.png'

defineProps<{
  trigger: TimelineTrigger
}>()

defineEmits<{
  open: []
  dismiss: []
}>()
</script>

<template>
  <section
    class="cue-pill"
    data-testid="finance-cue-pill"
    @pointerdown.stop
    @pointerup.stop
    @click.stop
  >
    <button class="cue-main" type="button" @click.stop="$emit('open')">
      <img :src="caibaoImage" alt="" />
      <span>
        <small>{{ trigger.cueLabel }}</small>
        <b>{{ trigger.prompt }}</b>
      </span>
      <em>打开</em>
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
  bottom: 104px;
  z-index: 14;
  display: flex;
  width: min(330px, calc(100% - 92px));
  min-height: 56px;
  overflow: hidden;
  color: #fff;
  background: rgba(23, 23, 21, 0.94);
  border: 1px solid rgba(255, 213, 65, 0.55);
  border-radius: 18px;
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
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  flex: 1;
  gap: 9px;
  align-items: center;
  min-width: 0;
  min-height: 56px;
  padding: 7px 8px;
  text-align: left;

  img {
    width: 38px;
    height: 38px;
    object-fit: cover;
    border-radius: 12px;
    background: #ffd541;
  }

  span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  small {
    color: #ffd541;
    font-size: 11px;
    line-height: 1.1;
  }

  b {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    color: #ffd541;
    font-size: 12px;
    font-style: normal;
  }
}

.later {
  width: 48px;
  min-height: 56px;
  border-left: 1px solid rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.68) !important;
  font-size: 12px;
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
