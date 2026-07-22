<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ShowcasePlayer from '@/showcase/components/ShowcasePlayer.vue'
import { isShowcaseExpired, showcaseBundle } from '@/showcase/catalog'

const feedEl = ref<HTMLElement>()
const activeIndex = ref(0)
const expired = computed(() => isShowcaseExpired())
const route = useRoute()
let observer: IntersectionObserver | undefined

onMounted(async () => {
  const requestedVideoId = String(route.query.video || '')
  const requestedIndex = showcaseBundle.catalog.findIndex(
    (item) => item.videoId === requestedVideoId
  )
  if (requestedIndex >= 0) activeIndex.value = requestedIndex
  await nextTick()
  if (requestedIndex >= 0) {
    feedEl.value?.querySelector<HTMLElement>(`[data-index="${requestedIndex}"]`)?.scrollIntoView()
  }
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
      if (!visible) return
      const index = Number((visible.target as HTMLElement).dataset.index)
      if (Number.isInteger(index)) activeIndex.value = index
    },
    { root: feedEl.value, threshold: [0.6, 0.8] }
  )
  feedEl.value
    ?.querySelectorAll<HTMLElement>('[data-feed-card]')
    .forEach((node) => observer?.observe(node))
})

onBeforeUnmount(() => observer?.disconnect())

function move(offset: number) {
  const target = Math.max(
    0,
    Math.min(showcaseBundle.catalog.length - 1, activeIndex.value + offset)
  )
  feedEl.value
    ?.querySelector<HTMLElement>(`[data-index="${target}"]`)
    ?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <main class="feed-shell">
    <section v-if="expired" class="empty-state">
      <div class="empty-card">
        <span>财包内容清单已到期</span>
        <h1>暂无可展示的授权视频</h1>
        <p>清单到期后系统会失败关闭，不回退到旧视频或未列明内容。</p>
      </div>
    </section>

    <section v-else ref="feedEl" class="feed" aria-label="财经视频推荐">
      <div
        v-for="(item, index) in showcaseBundle.catalog"
        :key="item.videoId"
        class="feed-card"
        data-feed-card
        :data-index="index"
      >
        <ShowcasePlayer
          :item="item"
          :active="index === activeIndex"
          :eager="Math.abs(index - activeIndex) <= 1"
        />
      </div>
    </section>

    <nav v-if="!expired" class="feed-nav" aria-label="视频翻页">
      <span>{{ activeIndex + 1 }} / {{ showcaseBundle.catalog.length }}</span>
      <button type="button" :disabled="activeIndex === 0" aria-label="上一条" @click="move(-1)">
        ↑
      </button>
      <button
        type="button"
        :disabled="activeIndex === showcaseBundle.catalog.length - 1"
        aria-label="下一条"
        @click="move(1)"
      >
        ↓
      </button>
    </nav>

    <details v-if="!expired" class="project-disclosure">
      <summary>项目与素材说明</summary>
      <div>
        <p>{{ showcaseBundle.disclosure.product }}</p>
        <p>{{ showcaseBundle.disclosure.media }}</p>
        <p>{{ showcaseBundle.disclosure.investment }}</p>
        <p>素材权利状态：用户声明，项目未独立核验；清单有效至 {{ showcaseBundle.expiresAt }}。</p>
      </div>
    </details>
  </main>
</template>

<style scoped>
.feed-shell,
.feed,
.empty-state {
  width: 100%;
  height: 100%;
  background: #0d0d0c;
}

.feed {
  overflow: auto;
  overscroll-behavior-y: contain;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
}

.feed::-webkit-scrollbar {
  display: none;
}

.feed-card {
  width: 100%;
  height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

.feed-nav {
  position: fixed;
  top: 50%;
  right: max(8px, calc((100vw - 500px) / 2 + 8px));
  z-index: 12;
  display: grid;
  gap: 6px;
  transform: translateY(-50%);
}

.feed-nav span,
.feed-nav button {
  display: grid;
  min-width: 44px;
  min-height: 44px;
  place-items: center;
  color: #fff;
  background: rgba(12, 12, 11, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 22px;
  font-size: 11px;
  backdrop-filter: blur(8px);
}

.feed-nav button {
  cursor: pointer;
  font-size: 18px;
}

.feed-nav button:disabled {
  opacity: 0.34;
}

.project-disclosure {
  position: fixed;
  z-index: 12;
  top: max(52px, calc(env(safe-area-inset-top) + 52px));
  right: max(12px, calc((100vw - 500px) / 2 + 12px));
  max-width: 230px;
  color: #2f2919;
  background: rgba(255, 248, 223, 0.96);
  border: 1px solid rgba(255, 213, 65, 0.8);
  border-radius: 12px;
  font-size: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

.project-disclosure summary {
  min-height: 44px;
  padding: 0 12px;
  line-height: 44px;
  cursor: pointer;
  font-weight: 800;
}

.project-disclosure div {
  padding: 0 12px 10px;
}

.project-disclosure p {
  margin: 5px 0;
  line-height: 1.45;
}

.empty-state {
  display: grid;
  place-items: center;
  padding: 24px;
  color: #fff8e8;
}

.empty-card {
  max-width: 340px;
  padding: 28px;
  background: #26231c;
  border: 1px solid #5f5026;
  border-radius: 24px;
}

.empty-card span {
  color: #ffd541;
  font-size: 12px;
  font-weight: 800;
}

.empty-card h1 {
  margin: 10px 0;
  font-size: 24px;
}

.empty-card p {
  margin: 0;
  color: #cfc7b5;
  line-height: 1.6;
}
</style>
