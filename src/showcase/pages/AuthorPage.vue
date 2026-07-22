<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { authorBySlug, itemsByAuthor, showcaseBundle, showcasePosterUrl } from '@/showcase/catalog'

const route = useRoute()
const authorSlug = computed(() => String(route.params.authorSlug || ''))
const author = computed(() => authorBySlug(authorSlug.value))
const items = computed(() => itemsByAuthor(authorSlug.value))
</script>

<template>
  <main class="author-page">
    <header class="author-header">
      <RouterLink class="back" to="/home" aria-label="返回推荐">←</RouterLink>
      <div v-if="author" class="author-avatar">{{ author.name.slice(0, 1) }}</div>
      <div v-if="author">
        <span>内容来源作者</span>
        <h1>{{ author.name }}</h1>
        <p>清单收录 {{ items.length }} 条作品 · 本页不是官方账号主页</p>
      </div>
    </header>

    <section v-if="author" class="work-list" aria-label="作者作品">
      <article v-for="item in items" :key="item.videoId" class="work-card">
        <img :src="showcasePosterUrl(item)" :alt="`${item.title} 封面`" loading="lazy" />
        <div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.publishedAtObserved }} · {{ Math.round(item.durationMs / 1000) }} 秒</p>
          <p v-if="item.aiGeneratedDisclosureObserved" class="ai-label">原页观察到“AI 生成”标注</p>
          <div class="work-actions">
            <RouterLink :to="`/home?video=${item.videoId}`">在推荐流观看</RouterLink>
            <a :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">原视频 ↗</a>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="not-found">
      <h1>未找到该作者</h1>
      <RouterLink to="/home">返回推荐流</RouterLink>
    </section>

    <footer>
      <p>{{ showcaseBundle.disclosure.product }}</p>
      <p>{{ showcaseBundle.disclosure.media }}</p>
      <p>{{ showcaseBundle.disclosure.investment }}</p>
    </footer>
  </main>
</template>

<style scoped>
.author-page {
  min-height: 100%;
  padding: 22px 16px 40px;
  color: #f8f2e5;
  background: #121210;
}

.author-header {
  display: grid;
  grid-template-columns: 44px 72px 1fr;
  align-items: center;
  gap: 12px;
  padding: 12px 0 24px;
  border-bottom: 1px solid #373329;
}

.back {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #fff;
  background: #29271f;
  border-radius: 50%;
  text-decoration: none;
  font-size: 20px;
}

.author-avatar {
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  color: #211d12;
  background: #ffd541;
  border: 3px solid #fff3bd;
  border-radius: 50%;
  font-size: 26px;
  font-weight: 900;
}

.author-header span {
  color: #d6ae35;
  font-size: 11px;
  font-weight: 800;
}

.author-header h1 {
  margin: 3px 0;
  font-size: 24px;
}

.author-header p,
.work-card p {
  margin: 0;
  color: #aaa391;
  font-size: 11px;
  line-height: 1.45;
}

.work-list {
  display: grid;
  gap: 14px;
  padding: 20px 0;
}

.work-card {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 12px;
  padding: 10px;
  background: #1f1e1a;
  border: 1px solid #343128;
  border-radius: 16px;
}

.work-card img {
  width: 112px;
  height: 150px;
  object-fit: cover;
  background: #090909;
  border-radius: 10px;
}

.work-card h2 {
  display: -webkit-box;
  margin: 2px 0 7px;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.ai-label {
  margin-top: 6px !important;
  color: #ffd541 !important;
}

.work-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.work-actions a {
  display: inline-grid;
  min-height: 44px;
  align-items: center;
  padding: 0 12px;
  color: #211d12;
  background: #ffd541;
  border-radius: 12px;
  text-decoration: none;
  font-size: 11px;
  font-weight: 800;
}

.work-actions a:last-child {
  color: #f8f2e5;
  background: #343128;
}

.not-found {
  padding: 80px 0;
  text-align: center;
}

.not-found a {
  color: #ffd541;
}

footer {
  padding: 16px;
  color: #8f897a;
  background: #1a1916;
  border-radius: 14px;
  font-size: 10px;
  line-height: 1.5;
}

footer p {
  margin: 4px 0;
}

@media (max-width: 390px) {
  .work-card {
    grid-template-columns: 94px 1fr;
  }

  .work-card img {
    width: 94px;
    height: 132px;
  }
}
</style>
