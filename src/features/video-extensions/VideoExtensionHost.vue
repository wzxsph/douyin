<script setup lang="ts">
import { computed } from 'vue'
import type { MediaClockState, VideoContext } from './contracts'
import { resolveVideoExtension } from './registry'

const props = defineProps<{
  context: VideoContext
  clock: MediaClockState
}>()

defineEmits<{
  'request-seek': [positionMs: number]
  'sheet-open-change': [open: boolean]
}>()

const extension = computed(() => resolveVideoExtension(props.context))
</script>

<template>
  <component
    :is="extension.component"
    v-if="extension"
    :key="extension.key + ':' + context.videoId"
    :context="context"
    :clock="clock"
    @request-seek="$emit('request-seek', $event)"
    @sheet-open-change="$emit('sheet-open-change', $event)"
  />
</template>
