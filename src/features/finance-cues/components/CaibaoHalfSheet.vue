<script setup lang="ts">
import { ref } from 'vue'
import caibaoImage from '../assets/caibao.png'

defineProps<{
  title: string
  eyebrow?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const startY = ref(0)
const offsetY = ref(0)

function pointerDown(event: PointerEvent) {
  startY.value = event.clientY
  offsetY.value = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function pointerMove(event: PointerEvent) {
  if (!startY.value) return
  offsetY.value = Math.max(0, event.clientY - startY.value)
}

function pointerUp() {
  if (offsetY.value > 64) emit('close')
  startY.value = 0
  offsetY.value = 0
}
</script>

<template>
  <section
    class="caibao-half-sheet"
    data-testid="caibao-half-sheet"
    data-max-viewport-ratio="0.48"
    :style="{ transform: 'translate3d(0,' + offsetY + 'px,0)' }"
    @pointerdown.stop
    @pointerup.stop
    @click.stop
  >
    <div
      class="drag-handle"
      aria-label="向下拖动关闭"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
    >
      <i></i>
    </div>
    <header>
      <img :src="caibaoImage" alt="" />
      <div>
        <small>{{ eyebrow || '财包知识触点' }}</small>
        <h2>{{ title }}</h2>
      </div>
      <button type="button" aria-label="关闭" @click.stop="$emit('close')">×</button>
    </header>
    <div class="sheet-body">
      <slot></slot>
    </div>
  </section>
</template>

<style scoped lang="less">
.caibao-half-sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: flex;
  box-sizing: border-box;
  height: min(48vh, 420px);
  max-height: 48vh;
  flex-direction: column;
  overflow: hidden;
  color: #1d1c18;
  background: #fffaf0;
  border: 1px solid rgba(211, 163, 43, 0.35);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -14px 36px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  transition: transform 200ms ease;
  animation: sheet-enter 220ms ease-out;
}

.drag-handle {
  display: flex;
  height: 22px;
  flex: 0 0 22px;
  align-items: center;
  justify-content: center;
  touch-action: none;

  i {
    width: 42px;
    height: 4px;
    border-radius: 4px;
    background: #d7cebd;
  }
}

header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 44px;
  gap: 10px;
  align-items: center;
  padding: 0 16px 12px;
  text-align: left;

  img {
    width: 42px;
    height: 42px;
    object-fit: cover;
    border-radius: 13px;
    background: #ffd541;
  }

  small {
    color: #9a7521;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  h2 {
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.25;
  }

  button {
    width: 44px;
    height: 44px;
    color: #5f5a50;
    background: #f1eadc;
    border: 0;
    border-radius: 50%;
    font-size: 26px;
    cursor: pointer;
  }
}

.sheet-body {
  flex: 1;
  min-height: 0;
  padding: 0 16px calc(14px + env(safe-area-inset-bottom));
  overflow: auto;
  overscroll-behavior: contain;
  text-align: left;
}

@keyframes sheet-enter {
  from {
    transform: translate3d(0, 100%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .caibao-half-sheet {
    animation: none;
    transition: none;
  }
}
</style>
