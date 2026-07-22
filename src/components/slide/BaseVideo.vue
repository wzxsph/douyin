<template>
  <div
    class="video-wrapper"
    ref="videoWrapper"
    :class="[positionName, { 'extension-sheet-open': state.extensionSheetOpen }]"
  >
    <Loading v-if="state.loading" style="position: absolute" />
    <!--    <video :src="item.video + '?v=123'"-->
    <video
      :poster="poster"
      ref="videoEl"
      :muted="state.isMuted"
      preload="metadata"
      :loop="shouldLoop"
      x5-video-player-type="h5-page"
      :x5-video-player-fullscreen="false"
      :webkit-playsinline="true"
      :x5-playsinline="true"
      :playsinline="true"
      :fullscreen="false"
      :autoplay="isPlay"
      @loadedmetadata="onLoadedMetadata"
      @durationchange="syncMediaClock"
      @timeupdate="syncMediaClock"
      @play="onNativePlay"
      @pause="onNativePause"
      @playing="onPlaying"
      @waiting="onWaiting"
      @seeking="onSeeking(true)"
      @seeked="onSeeking(false)"
      @ended="onEnded"
      @ratechange="syncMediaClock"
      @volumechange="syncMediaClock"
    >
      <source
        v-for="(urlItem, index) in item.video.play_addr.url_list"
        :key="index"
        :src="urlItem"
      />
      <p>您的浏览器不支持 video 标签。</p>
    </video>
    <Icon icon="fluent:play-28-filled" class="pause-icon" v-if="!isPlaying" />
    <div class="float">
      <template v-if="isLive">
        <div class="living">点击进入直播间</div>
        <ItemDesc :is-live="true" v-model:item="state.localItem" :position="position" />
      </template>
      <template v-else>
        <div :style="{ opacity: state.isMove ? 0 : 1 }" class="normal">
          <template v-if="!state.commentVisible">
            <ItemToolbar v-model:item="state.localItem" />
            <ItemDesc v-model:item="state.localItem" />
          </template>
          <div v-if="isMy" class="comment-status">
            <div class="comment">
              <div class="type-comment">
                <img src="../../assets/img/icon/head-image.jpeg" alt="" class="avatar" />
                <div class="right">
                  <p>
                    <span class="name">zzzzz</span>
                    <span class="time">2020-01-20</span>
                  </p>
                  <p class="text">北京</p>
                </div>
              </div>
              <transition-group name="comment-status" tag="div" class="loveds">
                <div class="type-loved" :key="i" v-for="i in state.test">
                  <img src="../../assets/img/icon/head-image.jpeg" alt="" class="avatar" />
                  <img src="../../assets/img/icon/love.svg" alt="" class="loved" />
                </div>
              </transition-group>
            </div>
          </div>
        </div>
        <div
          class="progress"
          :class="progressClass"
          ref="progressEl"
          @click="null"
          @touchstart="touchstart"
          @touchmove="touchmove"
          @touchend="touchend"
        >
          <div class="time" v-if="state.isMove">
            <span class="currentTime">{{ _duration(state.currentTime) }}</span>
            <span class="duration"> / {{ _duration(state.duration) }}</span>
          </div>
          <template v-if="state.duration > 15 || state.isMove || !isPlaying">
            <div class="bg"></div>
            <div class="progress-line" :style="durationStyle"></div>
            <div class="point"></div>
          </template>
        </div>
      </template>
      <VideoExtensionHost
        v-if="!isLive && !state.commentVisible"
        :key="`${extensionContext.videoId}:${state.extensionEpoch}`"
        :context="extensionContext"
        :clock="mediaClock"
        @request-seek="handleExtensionSeek"
        @sheet-open-change="state.extensionSheetOpen = $event"
        @pause-for-interaction="handlePauseForInteraction"
        @release-interaction="handleReleaseInteraction"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { _checkImgUrl, _duration, _stopPropagation } from '@/utils'
import Loading from '../Loading.vue'
import ItemToolbar from './ItemToolbar.vue'
import ItemDesc from './ItemDesc.vue'
import bus, { EVENT_KEY } from '../../utils/bus'
import { SlideItemPlayStatus } from '@/utils/const_var'
import { computed, onBeforeUnmount, onMounted, onUnmounted, provide, reactive, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { _css } from '@/utils/dom'
import VideoExtensionHost from '@/features/video-extensions/VideoExtensionHost.vue'
import type {
  MediaClockState,
  PauseForInteractionRequest,
  ReleaseInteractionRequest,
  VideoContext
} from '@/features/video-extensions/contracts'
import { createInteractionPlaybackController } from '@/features/video-extensions/interaction-playback'

defineOptions({
  name: 'BaseVideo'
})

const props = defineProps({
  item: {
    type: Object,
    default: () => {
      return {}
    }
  },
  position: {
    type: Object,
    default: () => {
      return {}
    }
  },
  //用于第一条数据，自动播放，如果都用事件去触发播放，有延迟
  isPlay: {
    type: Boolean,
    default: () => {
      return true
    }
  },
  isMy: {
    type: Boolean,
    default: () => {
      return false
    }
  },
  isLive: {
    type: Boolean,
    default: () => {
      return false
    }
  }
})

provide(
  'isPlaying',
  computed(() => isPlaying)
)
provide(
  'isMuted',
  computed(() => state.isMuted)
)
provide(
  'position',
  computed(() => props.position)
)
provide(
  'item',
  computed(() => props.item)
)

const videoEl = $ref<HTMLVideoElement>()
const progressEl = $ref<HTMLDivElement>()
let state = reactive({
  loading: false,
  paused: false,
  isMuted: window.isMuted,
  status: props.isPlay ? SlideItemPlayStatus.Play : SlideItemPlayStatus.Pause,
  duration: 0,
  step: 0,
  currentTime: 0,
  currentTimeMs: 0,
  durationMs: 0,
  seeking: false,
  ended: false,
  playbackRate: 1,
  playX: 0,
  start: { x: 0 },
  last: { x: 0, time: 0 },
  height: 0,
  width: 0,
  isMove: false,
  ignoreWaiting: false, //忽略waiting事件。因为改变进度会触发waiting事件，烦的一批
  test: [1, 2],
  localItem: props.item,
  progressBarRect: {
    height: 0,
    width: 0
  },
  videoScreenHeight: 0,
  commentVisible: false,
  extensionSheetOpen: false,
  extensionEpoch: 0
})
const poster = $computed(() => {
  return _checkImgUrl(props.item.video.poster ?? props.item.video.cover.url_list[0])
})
const durationStyle = $computed(() => {
  return { width: state.playX + 'px' }
})
const isPlaying = $computed(() => {
  return state.status === SlideItemPlayStatus.Play
})
const shouldLoop = $computed(() => {
  return props.item.financeExperienceId ? false : props.item.video?.loop !== false
})
const extensionContext = computed<VideoContext>(() => ({
  videoId: String(props.item.aweme_id || props.item.id || ''),
  financeExperienceId: props.item.financeExperienceId,
  item: props.item,
  position: props.position
}))
const interactionPlayback = createInteractionPlaybackController(
  () => videoEl,
  () => extensionContext.value.videoId
)
const mediaClock = computed<MediaClockState>(() => ({
  currentTimeMs: state.currentTimeMs,
  durationMs: state.durationMs,
  paused: state.paused,
  muted: state.isMuted,
  seeking: state.seeking,
  ended: state.ended,
  playbackRate: state.playbackRate
}))
const positionName = $computed(() => {
  return 'item-' + Object.values(props.position).join('-')
})
const progressClass = $computed(() => {
  if (state.isMove) {
    return 'move'
  } else {
    return isPlaying ? '' : 'stop'
  }
})

onMounted(() => {
  // console.log('video', this.localItem.aweme_id)
  // console.log(this.commentVisible)
  state.height = document.body.clientHeight
  state.width = document.body.clientWidth
  videoEl.currentTime = 0
  state.progressBarRect = progressEl.getBoundingClientRect()

  // console.log('mounted')
  // bus.off('singleClickBroadcast')
  bus.on(EVENT_KEY.SINGLE_CLICK_BROADCAST, click)
  bus.on(EVENT_KEY.DIALOG_MOVE, onDialogMove)
  bus.on(EVENT_KEY.DIALOG_END, onDialogEnd)
  bus.on(EVENT_KEY.OPEN_COMMENTS, onOpenComments)
  bus.on(EVENT_KEY.CLOSE_COMMENTS, onCloseComments)
  bus.on(EVENT_KEY.OPEN_SUB_TYPE, onOpenSubType)
  bus.on(EVENT_KEY.CLOSE_SUB_TYPE, onCloseSubType)

  bus.on(EVENT_KEY.REMOVE_MUTED, removeMuted)
})

onBeforeUnmount(() => {
  interactionPlayback.dispose()
})

onUnmounted(() => {
  // console.log('unmounted')
  bus.off(EVENT_KEY.SINGLE_CLICK_BROADCAST, click)
  bus.off(EVENT_KEY.DIALOG_MOVE, onDialogMove)
  bus.off(EVENT_KEY.DIALOG_END, onDialogEnd)
  bus.off(EVENT_KEY.OPEN_COMMENTS, onOpenComments)
  bus.off(EVENT_KEY.CLOSE_COMMENTS, onCloseComments)
  bus.off(EVENT_KEY.OPEN_SUB_TYPE, onOpenSubType)
  bus.off(EVENT_KEY.CLOSE_SUB_TYPE, onCloseSubType)
  bus.off(EVENT_KEY.REMOVE_MUTED, removeMuted)
})

watch(
  () => [extensionContext.value.videoId, extensionContext.value.financeExperienceId] as const,
  ([videoId, experienceId], previousContext) => {
    if (
      previousContext &&
      (videoId !== previousContext[0] || experienceId !== previousContext[1])
    ) {
      interactionPlayback.cancel()
      state.extensionSheetOpen = false
      state.extensionEpoch += 1
    }
  }
)

function removeMuted() {
  state.isMuted = false
  syncMediaClock()
}

function onLoadedMetadata() {
  if (!videoEl) return
  state.videoScreenHeight = videoEl.videoWidth
    ? videoEl.videoHeight / (videoEl.videoWidth / state.width)
    : state.height
  state.progressBarRect = progressEl.getBoundingClientRect()
  syncMediaClock()
}

function syncMediaClock() {
  if (!videoEl) return
  state.currentTime = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0
  state.duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0
  state.currentTimeMs = Math.round(state.currentTime * 1000)
  state.durationMs = Math.round(state.duration * 1000)
  state.paused = videoEl.paused
  state.playbackRate = videoEl.playbackRate || 1
  state.isMuted = videoEl.muted
  state.step = state.duration ? state.progressBarRect.width / state.duration : 0
  state.playX = state.duration
    ? Math.max(
        0,
        Math.min(
          state.progressBarRect.width,
          (state.currentTime / state.duration) * state.progressBarRect.width
        )
      )
    : 0
}

function onNativePlay() {
  state.status = SlideItemPlayStatus.Play
  state.paused = false
  state.ended = false
  syncMediaClock()
}

function onNativePause() {
  state.status = SlideItemPlayStatus.Pause
  state.paused = true
  syncMediaClock()
}

function onPlaying() {
  state.loading = false
  onNativePlay()
}

function onWaiting() {
  if (!state.paused && !state.ignoreWaiting) state.loading = true
}

function onSeeking(seeking: boolean) {
  state.seeking = seeking
  syncMediaClock()
}

function onEnded() {
  state.ended = true
  state.paused = true
  state.status = SlideItemPlayStatus.Pause
  syncMediaClock()
}

function handleExtensionSeek(positionMs: number) {
  if (!videoEl || !Number.isFinite(positionMs)) return
  const durationMs = state.durationMs || positionMs
  videoEl.currentTime = Math.max(0, Math.min(positionMs, durationMs)) / 1000
  syncMediaClock()
}

function handlePauseForInteraction(request: PauseForInteractionRequest) {
  interactionPlayback.pauseForInteraction(request)
  syncMediaClock()
}

function handleReleaseInteraction(request: ReleaseInteractionRequest) {
  void interactionPlayback.releaseInteraction(request).finally(syncMediaClock)
}

function onOpenSubType() {
  state.commentVisible = true
}

function onCloseSubType() {
  state.commentVisible = false
}

function onDialogMove({ tag, e }) {
  if (state.commentVisible && tag === 'comment') {
    _css(videoEl, 'transition-duration', `0ms`)
    _css(videoEl, 'height', `calc(var(--vh, 1vh) * 30 + ${e}px)`)
  }
}

function onDialogEnd({ tag, isClose }) {
  if (state.commentVisible && tag === 'comment') {
    console.log('isClose', isClose)
    _css(videoEl, 'transition-duration', `300ms`)
    if (isClose) {
      state.commentVisible = false
      _css(videoEl, 'height', '100%')
    } else {
      _css(videoEl, 'height', 'calc(var(--vh, 1vh) * 30)')
    }
  }
}

function onOpenComments(id) {
  if (id === props.item.aweme_id) {
    _css(videoEl, 'transition-duration', `300ms`)
    _css(videoEl, 'height', 'calc(var(--vh, 1vh) * 30)')
    state.commentVisible = true
  }
}

function onCloseComments() {
  if (state.commentVisible) {
    _css(videoEl, 'transition-duration', `300ms`)
    _css(videoEl, 'height', '100%')
    state.commentVisible = false
  }
}

function click({ uniqueId, index, type }) {
  if (props.position.uniqueId === uniqueId && props.position.index === index) {
    if (type === EVENT_KEY.ITEM_TOGGLE) {
      if (state.extensionSheetOpen) return
      if (props.isLive) {
        pause()
        bus.emit(EVENT_KEY.NAV, {
          path: '/home/live',
          query: { id: props.item.aweme_id }
        })
      } else {
        if (state.status === SlideItemPlayStatus.Play) {
          pause()
        } else {
          play()
        }
      }
    }
    if (type === EVENT_KEY.ITEM_STOP) {
      interactionPlayback.cancel()
      state.extensionSheetOpen = false
      state.extensionEpoch += 1
      videoEl.currentTime = 0
      state.ignoreWaiting = true
      pause()
      setTimeout(() => (state.ignoreWaiting = false), 300)
    }
    if (type === EVENT_KEY.ITEM_PLAY) {
      if (state.extensionSheetOpen) return
      videoEl.currentTime = 0
      state.ignoreWaiting = true
      play()
      setTimeout(() => (state.ignoreWaiting = false), 300)
    }
  }
}

function play() {
  state.status = SlideItemPlayStatus.Play
  videoEl.volume = 1
  void videoEl.play().catch(() => {
    state.status = SlideItemPlayStatus.Pause
  })
}

function pause() {
  state.status = SlideItemPlayStatus.Pause
  videoEl.pause()
}

function touchstart(e) {
  _stopPropagation(e)
  state.start.x = e.touches[0].pageX
  state.last.x = state.playX
  state.last.time = state.currentTime
}

function touchmove(e) {
  // console.log('move',e)
  _stopPropagation(e)
  state.isMove = true
  pause()
  let dx = e.touches[0].pageX - state.start.x
  state.playX = state.last.x + dx
  state.currentTime = state.last.time + Math.ceil(Math.ceil(dx) / state.step)
  if (state.currentTime <= 0) state.currentTime = 0
  if (state.currentTime >= state.duration) state.currentTime = state.duration
  state.currentTimeMs = Math.round(state.currentTime * 1000)
}

function touchend(e) {
  // console.log('end', e)
  _stopPropagation(e)
  if (isPlaying) return
  setTimeout(() => (state.isMove = false), 1000)
  videoEl.currentTime = state.currentTime
  play()
}
</script>

<style scoped lang="less">
.video-wrapper {
  position: relative;
  font-size: 14rem;
  width: 100%;
  height: 100%;
  text-align: center;

  video {
    max-width: 100%;
    height: 100%;
    transition:
      height,
      margin-top 0.3s;
    //background: black;
    /*position: absolute;*/
  }

  .float {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 100%;

    .normal {
      position: absolute;
      bottom: 0;
      width: 100%;
      transition: all 0.3s;

      .comment-status {
        display: flex;
        align-items: center;

        .comment {
          .type-comment {
            display: flex;
            background: rgb(130, 21, 44);
            border-radius: 50px;
            padding: 3px;
            margin-bottom: 20px;

            .avatar {
              width: 36px;
              height: 36px;
              border-radius: 50%;
            }

            .right {
              margin: 0 10px;
              color: var(--second-text-color);

              .name {
                margin-right: 10px;
              }

              .text {
                color: white;
              }
            }
          }

          .loveds {
          }

          .type-loved {
            width: 40px;
            height: 40px;
            position: relative;
            margin-bottom: 20px;
            animation: test 1s;
            animation-delay: 0.5s;

            .avatar {
              width: 36px;
              height: 36px;
              border-radius: 50%;
            }

            .loved {
              position: absolute;
              bottom: 0;
              left: 20px;
              width: 10px;
              height: 10px;
              background: red;
              padding: 3px;
              border-radius: 50%;
              border: 2px solid white;
            }
          }

          @keyframes test {
            from {
              display: block;
              transform: translate3d(0, 0, 0);
            }
            to {
              display: none;
              transform: translate3d(0, -60px, 0);
            }
          }
        }
      }
    }

    .progress {
      z-index: 10;
      @w: 90%;
      position: absolute;
      bottom: -1rem;
      height: 10rem;
      left: calc((100% - @w) / 2);
      width: @w;
      display: flex;
      align-items: flex-end;
      margin-bottom: 2rem;

      .time {
        position: absolute;
        z-index: 9;
        font-size: 24px;
        bottom: 50px;
        left: 0;
        right: 0;
        color: white;
        text-align: center;

        .duration {
          color: darkgray;
        }
      }

      @radius: 10rem;

      @h: 2rem;
      @tr: height 0.3s;

      .bg {
        transition: @tr;
        position: absolute;
        width: 100%;
        height: @h;
        background: #4f4f4f;
        border-radius: @radius;
      }

      @p: 50px;

      .progress-line {
        transition: @tr;
        height: calc(@h + 0.5rem);
        width: @p;
        border-radius: @radius 0 0 @radius;
        background: #777777;
        z-index: 1;
      }

      .point {
        transition: all 0.2s;
        width: @h+2;
        height: @h+2;
        border-radius: 50%;
        background: gray;
        z-index: 2;
        transform: translate(-1rem, 1rem);
      }
    }

    & .move {
      @h: 10rem;

      .bg {
        height: @h;
        background: var(--active-main-bg);
      }

      .progress-line {
        height: @h;
        background: var(--second-text-color);
      }

      .point {
        width: @h+2;
        height: @h+2;
        background: white;
      }
    }

    & .stop {
      @h: 4rem;

      .bg {
        height: @h;
      }

      .progress-line {
        height: @h;
        background: white;
      }

      .point {
        width: @h+2;
        height: @h+2;
        background: white;
      }
    }
  }

  &.extension-sheet-open {
    .float .normal {
      bottom: min(48vh, 420px);
    }

    .float .progress {
      bottom: min(48vh, 420px);
    }
  }
}

.living {
  position: absolute;
  left: 50%;
  font-size: 18rem;
  border-radius: 50rem;
  border: 1px solid #e0e0e0;
  padding: 15rem 20rem;
  line-height: 1;
  color: white;
  top: 70%;
  transform: translate(-50%, -50%);
}
</style>
