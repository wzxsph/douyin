<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import VideoExtensionHost from '@/features/video-extensions/VideoExtensionHost.vue'
import type {
  MediaClockState,
  PauseForInteractionRequest,
  ReleaseInteractionRequest,
  VideoContext
} from '@/features/video-extensions/contracts'
import { createInteractionPlaybackController } from '@/features/video-extensions/interaction-playback'
import {
  showcaseBundle,
  showcaseMediaUrl,
  showcasePosterUrl,
  type ShowcaseCatalogItem
} from '@/showcase/catalog'
import { setShowcaseSoundEnabled, showcaseSoundEnabled } from '@/showcase/sound-preference'

const props = defineProps<{
  item: ShowcaseCatalogItem
  active: boolean
  eager?: boolean
}>()

const videoEl = ref<HTMLVideoElement>()
const sheetOpen = ref(false)
const loadError = ref(false)
const playbackBlocked = ref(false)
const clock = ref<MediaClockState>({
  currentTimeMs: 0,
  durationMs: props.item.durationMs,
  paused: true,
  muted: true,
  seeking: false,
  ended: false,
  playbackRate: 1
})

const mediaUrl = computed(() => showcaseMediaUrl(props.item))
const posterUrl = computed(() => showcasePosterUrl(props.item))
const authorInitial = computed(() => props.item.author.slice(0, 1))
const context = computed<VideoContext>(() => ({
  videoId: props.item.videoId,
  financeExperienceId: props.item.financeExperienceId,
  item: {
    ...props.item,
    mediaFingerprint: props.item.sourceSha256
  },
  position: { uniqueId: props.item.videoId }
}))

const interactionPlayback = createInteractionPlaybackController(
  () => videoEl.value,
  () => props.item.videoId
)

watch(
  () => props.active,
  async (active) => {
    interactionPlayback.cancel()
    sheetOpen.value = false
    await nextTick()
    const media = videoEl.value
    if (!media) return
    if (active) {
      media.muted = !showcaseSoundEnabled.value
      playbackBlocked.value = false
      try {
        await media.play()
      } catch {
        playbackBlocked.value = true
      }
    } else {
      media.pause()
      playbackBlocked.value = false
    }
    syncClock()
  },
  { immediate: true }
)

onBeforeUnmount(() => interactionPlayback.dispose())

function syncClock() {
  const media = videoEl.value
  if (!media) return
  clock.value = {
    currentTimeMs: Math.round((Number(media.currentTime) || 0) * 1000),
    durationMs: Math.round((Number(media.duration) || props.item.durationMs / 1000) * 1000),
    paused: media.paused,
    muted: media.muted,
    seeking: media.seeking,
    ended: media.ended,
    playbackRate: media.playbackRate || 1
  }
}

function togglePlayback() {
  if (sheetOpen.value) return
  const media = videoEl.value
  if (!media) return
  if (media.paused || media.muted) {
    void enableSoundAndPlay()
    return
  }
  media.pause()
}

async function enableSoundAndPlay() {
  const media = videoEl.value
  if (!media) return
  setShowcaseSoundEnabled(true)
  media.muted = false
  playbackBlocked.value = false
  try {
    await media.play()
  } catch {
    playbackBlocked.value = true
  } finally {
    syncClock()
  }
}

function toggleMuted() {
  const media = videoEl.value
  if (!media) return
  if (media.muted) {
    void enableSoundAndPlay()
    return
  }
  setShowcaseSoundEnabled(false)
  media.muted = true
  syncClock()
}

function handlePlaying() {
  playbackBlocked.value = false
  syncClock()
}

function handleLoadedMetadata() {
  loadError.value = false
  syncClock()
}

function seek(positionMs: number) {
  const media = videoEl.value
  if (!media || !Number.isFinite(positionMs)) return
  const upperBound = Number.isFinite(media.duration) ? media.duration * 1000 : props.item.durationMs
  media.currentTime = Math.max(0, Math.min(positionMs, upperBound)) / 1000
  syncClock()
}

function pauseForInteraction(request: PauseForInteractionRequest) {
  interactionPlayback.pauseForInteraction(request)
  syncClock()
}

function releaseInteraction(request: ReleaseInteractionRequest) {
  void interactionPlayback.releaseInteraction(request).finally(syncClock)
}

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
</script>

<template>
  <article class="showcase-player" :data-video-id="item.videoId">
    <video
      v-if="eager || active"
      ref="videoEl"
      class="showcase-video"
      :src="mediaUrl"
      :poster="posterUrl"
      :preload="active ? 'auto' : 'metadata'"
      playsinline
      webkit-playsinline
      muted
      @click="togglePlayback"
      @loadedmetadata="handleLoadedMetadata"
      @durationchange="syncClock"
      @timeupdate="syncClock"
      @play="handlePlaying"
      @pause="syncClock"
      @seeking="syncClock"
      @seeked="syncClock"
      @ended="syncClock"
      @ratechange="syncClock"
      @volumechange="syncClock"
      @error="loadError = true"
    />
    <div v-else class="showcase-poster" :style="{ backgroundImage: `url(${posterUrl})` }" />

    <div v-if="loadError" class="media-error" role="status">
      <b>视频暂时无法加载</b>
      <span>仍可查看来源与财包内容说明。</span>
    </div>

    <header class="showcase-topbar">
      <span class="brand">财包 · 推荐</span>
      <span class="mock-chip">LLM Mock</span>
    </header>

    <button
      v-if="active && !sheetOpen && !loadError && (clock.muted || playbackBlocked)"
      type="button"
      class="sound-prompt"
      data-testid="showcase-sound-prompt"
      :aria-label="playbackBlocked ? '点击有声播放' : '点击开启声音'"
      @click.stop="enableSoundAndPlay"
    >
      <span aria-hidden="true">🔊</span>
      {{ playbackBlocked ? '点击有声播放' : '点击开启声音' }}
    </button>

    <div class="author-rail">
      <RouterLink
        class="author-avatar"
        :to="`/author/${item.authorSlug}`"
        :aria-label="`查看作者 ${item.author}`"
        @click.stop
      >
        {{ authorInitial }}
      </RouterLink>
      <span>作者</span>
      <button
        type="button"
        class="rail-button"
        :aria-label="clock.muted ? '打开声音' : '静音'"
        @click.stop="toggleMuted"
      >
        {{ clock.muted ? '静音' : '有声' }}
      </button>
    </div>

    <section class="video-copy">
      <RouterLink class="author-name" :to="`/author/${item.authorSlug}`" @click.stop>
        @{{ item.author }}
      </RouterLink>
      <h1>{{ item.title }}</h1>
      <div class="source-row">
        <a :href="item.sourceUrl" target="_blank" rel="noopener noreferrer" @click.stop>
          查看抖音原作品 ↗
        </a>
        <span v-if="item.aiGeneratedDisclosureObserved">原页标注 AI 生成</span>
      </div>
      <p class="content-notice">{{ showcaseBundle.disclosure.content }}</p>
    </section>

    <button
      v-if="clock.paused && !sheetOpen && !loadError"
      type="button"
      class="play-button"
      aria-label="播放视频"
      @click.stop="enableSoundAndPlay"
    >
      ▶
    </button>

    <div class="clock-label" aria-hidden="true">
      {{ formatTime(clock.currentTimeMs) }} / {{ formatTime(clock.durationMs) }}
    </div>

    <VideoExtensionHost
      v-if="active"
      :context="context"
      :clock="clock"
      @request-seek="seek"
      @sheet-open-change="sheetOpen = $event"
      @pause-for-interaction="pauseForInteraction"
      @release-interaction="releaseInteraction"
    />
  </article>
</template>

<style scoped>
.showcase-player {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fffaf0;
  background: #0d0d0c;
}

.showcase-video,
.showcase-poster {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #0d0d0c;
}

.showcase-poster {
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.showcase-player::after {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.5) 0,
    transparent 24%,
    transparent 55%,
    rgba(0, 0, 0, 0.82) 100%
  );
}

.showcase-topbar,
.author-rail,
.video-copy,
.play-button,
.sound-prompt,
.clock-label,
.media-error {
  position: absolute;
  z-index: 10;
}

.showcase-topbar {
  top: max(14px, env(safe-area-inset-top));
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.brand {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.mock-chip {
  padding: 5px 9px;
  color: #2b2515;
  background: #ffd541;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.sound-prompt {
  top: max(60px, calc(env(safe-area-inset-top) + 46px));
  left: 50%;
  display: inline-flex;
  min-height: 44px;
  max-width: 216px;
  align-items: center;
  gap: 7px;
  padding: 0 15px;
  color: #28200d;
  background: rgba(255, 213, 65, 0.96);
  border: 1px solid rgba(255, 249, 220, 0.9);
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.author-rail {
  right: 12px;
  bottom: 190px;
  display: grid;
  justify-items: center;
  gap: 6px;
  font-size: 10px;
}

.author-avatar {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  color: #1b1810;
  background: #fff4d1;
  border: 2px solid #fff;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 900;
  text-decoration: none;
}

.rail-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 7px;
  color: white;
  background: rgba(12, 12, 11, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 22px;
  font-size: 10px;
}

.video-copy {
  right: 74px;
  bottom: 64px;
  left: 16px;
  display: grid;
  gap: 7px;
  pointer-events: none;
}

.video-copy a {
  pointer-events: auto;
}

.author-name {
  width: fit-content;
  color: #ffd541;
  font-weight: 800;
  text-decoration: none;
}

.video-copy h1 {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.45;
  text-shadow: 0 1px 3px #000;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.source-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  font-size: 11px;
}

.source-row a {
  color: #fff2b7;
}

.source-row span {
  padding: 3px 6px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 213, 65, 0.45);
  border-radius: 999px;
}

.content-notice {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 9px;
  line-height: 1.4;
}

.play-button {
  top: 50%;
  left: 50%;
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.48);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  font-size: 21px;
}

.clock-label {
  right: 16px;
  bottom: 4px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 10px;
}

.media-error {
  top: 50%;
  left: 50%;
  display: grid;
  width: min(72%, 280px);
  gap: 5px;
  padding: 18px;
  color: #40371f;
  background: #fff8df;
  border-radius: 16px;
  transform: translate(-50%, -50%);
  text-align: center;
}

.media-error span {
  font-size: 12px;
  line-height: 1.45;
}
</style>
