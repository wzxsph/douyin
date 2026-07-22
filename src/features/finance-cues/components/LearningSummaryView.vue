<script setup lang="ts">
import type { ApprovedExperience, LearningSummary } from '../contracts'

defineProps<{
  experience: ApprovedExperience
  summary: LearningSummary
}>()

defineEmits<{
  revisit: [triggerId: string]
}>()
</script>

<template>
  <div class="summary-view" data-testid="finance-learning-summary">
    <p class="summary-intro">
      这里只记录你实际碰过的证据；没有点击的内容标记为“尚未观察”，不会扣分。
    </p>

    <section>
      <h3>你已经碰到</h3>
      <ul v-if="summary.observed.length">
        <li v-for="item in summary.observed" :key="item.triggerId">
          <span>✓</span>
          <b>{{ item.title }}</b>
        </li>
      </ul>
      <p v-else class="empty">还没有完成触点，可以从黄色圆点回看。</p>
    </section>

    <section>
      <h3>尚未观察</h3>
      <button
        v-for="item in summary.notObserved"
        :key="item.triggerId"
        type="button"
        @click.stop="$emit('revisit', item.triggerId)"
      >
        <span>{{ item.title }}</span>
        <em>回看</em>
      </button>
      <p v-if="!summary.notObserved.length" class="empty">本次三个关键触点都已观察。</p>
    </section>

    <footer>{{ experience.notice }}</footer>
  </div>
</template>

<style scoped lang="less">
.summary-view {
  display: grid;
  gap: 12px;
  color: #2a2823;
}

.summary-intro {
  margin: 0;
  padding: 10px 12px;
  color: #665f52;
  background: #f4ead4;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.55;
}

section {
  display: grid;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 14px;
  }

  ul {
    display: grid;
    gap: 7px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  li,
  button {
    display: flex;
    min-height: 44px;
    box-sizing: border-box;
    align-items: center;
    gap: 9px;
    padding: 9px 11px;
    color: #2e2c27;
    background: #fff;
    border: 1px solid #dfd5c1;
    border-radius: 11px;
    text-align: left;
  }

  li span {
    color: #4f9274;
    font-weight: 800;
  }

  button {
    justify-content: space-between;
    cursor: pointer;

    em {
      color: #9a7521;
      font-size: 12px;
      font-style: normal;
    }
  }
}

.empty {
  margin: 0;
  color: #888176;
  font-size: 12px;
}

footer {
  padding-bottom: 4px;
  color: #9b7662;
  font-size: 10px;
  line-height: 1.45;
}
</style>
