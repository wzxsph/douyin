<script setup lang="tsx">
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type PropType,
  type VNode
} from 'vue'
import {
  getSlideOffset,
  slideInit,
  slideReset,
  slideTouchEnd,
  slideTouchMove,
  slideTouchStart
} from '@/utils/slide'
import { SlideType } from '@/utils/const_var'
import SlideItem from '@/components/slide/SlideItem.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import Loading from '@/components/Loading.vue'
import { useBaseStore } from '@/store/pinia'
import { _css } from '@/utils/dom'

const props = defineProps({
  index: { type: Number, default: 0 },
  render: {
    type: Function as PropType<
      (item: any, index: number, play: boolean, uniqueId: string) => VNode
    >,
    required: true
  },
  list: { type: Array as PropType<any[]>, default: () => [] },
  virtualTotal: { type: Number, default: 5 },
  name: { type: String, default: '' },
  uniqueId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  active: { type: Boolean, default: false }
})

const emit = defineEmits<{
  'update:index': [index: number]
  loadMore: []
  refresh: []
}>()

const VNodeRenderer = defineComponent({
  name: 'VNodeRenderer',
  props: {
    vnode: { type: Object as PropType<VNode>, required: true }
  },
  setup(rendererProps) {
    return () => rendererProps.vnode
  }
})

const slideListEl = ref<HTMLDivElement | null>(null)
const baseStore = useBaseStore()
const state = reactive({
  judgeValue: 20,
  type: SlideType.VERTICAL_INFINITE,
  name: props.name,
  localIndex: props.index,
  needCheck: true,
  next: false,
  isDown: false,
  start: { x: 0, y: 0, time: 0 },
  move: { x: 0, y: 0 },
  wrapper: { width: 0, height: 0, childrenLength: 0 }
})

const visibleEntries = computed(() => {
  if (!props.list.length) return []
  const total = Math.max(1, Math.min(props.virtualTotal, props.list.length))
  const half = Math.floor(total / 2)
  let start = Math.max(0, state.localIndex - half)
  let end = Math.min(props.list.length, start + total)
  start = Math.max(0, end - total)

  return props.list.slice(start, end).map((item, offset) => ({
    item,
    index: start + offset
  }))
})

watch(
  () => props.index,
  (index) => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, props.list.length - 1)))
    if (state.localIndex === nextIndex) return
    state.localIndex = nextIndex
    nextTick(resetPosition)
  }
)

watch(
  () => props.list.length,
  () => {
    if (state.localIndex >= props.list.length) {
      state.localIndex = Math.max(0, props.list.length - 1)
      emit('update:index', state.localIndex)
    }
    nextTick(() => {
      syncMeasurements()
      resetPosition(false)
      if (props.list.length) bus.emit(EVENT_KEY.CURRENT_ITEM, props.list[state.localIndex])
    })
  },
  { immediate: true }
)

watch(
  () => state.localIndex,
  (newIndex, oldIndex) => {
    const item = props.list[newIndex]
    if (item) bus.emit(EVENT_KEY.CURRENT_ITEM, item)
    bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
      uniqueId: props.uniqueId,
      index: newIndex,
      type: EVENT_KEY.ITEM_PLAY
    })
    if (oldIndex !== undefined && oldIndex !== newIndex) {
      setTimeout(() => {
        bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
          uniqueId: props.uniqueId,
          index: oldIndex,
          type: EVENT_KEY.ITEM_STOP
        })
      }, 200)
    }
  }
)

watch(
  () => props.active,
  (active) => {
    if (active && !props.list.length) {
      emit('refresh')
      return
    }
    if (active && props.list[state.localIndex]) {
      bus.emit(EVENT_KEY.CURRENT_ITEM, props.list[state.localIndex])
    }
    setTimeout(
      () => {
        bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
          uniqueId: props.uniqueId,
          index: state.localIndex,
          type: active ? EVENT_KEY.ITEM_PLAY : EVENT_KEY.ITEM_STOP
        })
      },
      active ? 0 : 200
    )
  },
  { immediate: true }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!slideListEl.value) return
  slideInit(slideListEl.value, state)
  syncMeasurements()
  resetPosition(false)
  resizeObserver = new ResizeObserver(() => {
    syncMeasurements()
    resetPosition(false)
  })
  resizeObserver.observe(slideListEl.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

function syncMeasurements() {
  if (!slideListEl.value) return
  state.wrapper.width = slideListEl.value.getBoundingClientRect().width
  state.wrapper.height = slideListEl.value.getBoundingClientRect().height
  state.wrapper.childrenLength = visibleEntries.value.length
}

function resetPosition(animate = true) {
  if (!slideListEl.value) return
  _css(slideListEl.value, 'transition-duration', animate ? '300ms' : '0ms')
  _css(
    slideListEl.value,
    'transform',
    `translate3d(0px, ${getSlideOffset(state, slideListEl.value)}px, 0px)`
  )
}

function touchStart(event: PointerEvent) {
  if (!slideListEl.value) return
  slideTouchStart(event, slideListEl.value, state)
}

function touchMove(event: PointerEvent) {
  if (!slideListEl.value) return
  slideTouchMove(event, slideListEl.value, state, canNext)
}

function touchEnd(event: PointerEvent) {
  if (!slideListEl.value) return
  const movingNext = state.move.y < 0
  if (
    state.localIndex === 0 &&
    !movingNext &&
    state.move.y > baseStore.homeRefresh + baseStore.judgeValue
  ) {
    emit('refresh')
  }

  slideTouchEnd(event, state, canNext, (isNext: boolean) => {
    if (isNext && state.localIndex >= props.list.length - Math.ceil(props.virtualTotal / 2) - 1) {
      emit('loadMore')
    }
  })
  slideReset(event, slideListEl.value, state, emit)
}

function canNext(_state: typeof state, isNext: boolean) {
  return !(
    (state.localIndex === 0 && !isNext) ||
    (state.localIndex === props.list.length - 1 && isNext)
  )
}

function guardMovedClick(event: MouseEvent) {
  if (!window.isMoved) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function dislike() {
  // Kept as a compatibility hook for the existing share panel.
}

defineExpose({ dislike })
</script>

<template>
  <div class="slide slide-infinite">
    <Loading v-if="props.loading && props.list.length === 0" />
    <div
      ref="slideListEl"
      class="slide-list flex-direction-column"
      @pointerdown.prevent="touchStart"
      @pointermove.prevent="touchMove"
      @pointerup.prevent="touchEnd"
      @pointercancel.prevent="touchEnd"
      @click.capture="guardMovedClick"
    >
      <SlideItem
        v-for="entry in visibleEntries"
        :key="entry.item.aweme_id || entry.item.id || entry.index"
        :data-index="entry.index"
        class="virtual-slide-item"
        :style="{ top: entry.index * 100 + '%' }"
      >
        <VNodeRenderer
          :vnode="
            props.render(entry.item, entry.index, entry.index === state.localIndex, props.uniqueId)
          "
        />
      </SlideItem>
    </div>
  </div>
</template>

<style scoped lang="less">
.virtual-slide-item {
  position: absolute;
  inset-inline: 0;
}
</style>
