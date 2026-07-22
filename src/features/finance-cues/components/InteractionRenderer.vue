<script setup lang="ts">
import type { TimelineTrigger } from '../contracts'

const props = defineProps<{
  trigger: TimelineTrigger
}>()

const emit = defineEmits<{
  complete: [payload: { response: string; feedback: string }]
}>()

function completeContext() {
  if (props.trigger.kind !== 'context_card') return
  emit('complete', {
    response: props.trigger.payload.keyPoint,
    feedback: props.trigger.payload.feedback
  })
}

function selectCondition(optionId: string) {
  if (props.trigger.kind !== 'condition_slider') return
  const option = props.trigger.payload.options.find((candidate) => candidate.id === optionId)
  if (!option) return
  emit('complete', {
    response: option.label + '：' + option.result,
    feedback: option.result
  })
}

function selectCausal(option: string) {
  if (props.trigger.kind !== 'causal_stitch') return
  const correct = option === props.trigger.payload.correctOption
  emit('complete', {
    response: (correct ? '识别正确：' : '已修正：') + props.trigger.payload.correctOption,
    feedback: props.trigger.payload.feedback
  })
}
</script>

<template>
  <div class="interaction" data-testid="finance-interaction">
    <template v-if="trigger.kind === 'context_card'">
      <p class="lead">{{ trigger.payload.body }}</p>
      <div class="key-point">
        <small>记住这一点</small>
        <b>{{ trigger.payload.keyPoint }}</b>
      </div>
      <button class="primary" type="button" @click.stop="completeContext">我知道了</button>
    </template>

    <template v-else-if="trigger.kind === 'condition_slider'">
      <p class="lead">只换一个条件，看看哪条路径会变强。</p>
      <div class="variable">
        <small>变量</small>
        <b>{{ trigger.payload.variable }}</b>
      </div>
      <div class="option-grid">
        <button
          v-for="option in trigger.payload.options"
          :key="option.id"
          type="button"
          @click.stop="selectCondition(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
    </template>

    <template v-else>
      <div class="causal-path">
        <span>{{ trigger.payload.before }}</span>
        <i>→</i>
        <b>补上中间一步</b>
        <i>→</i>
        <span>{{ trigger.payload.after }}</span>
      </div>
      <div class="option-list">
        <button
          v-for="option in trigger.payload.options"
          :key="option"
          type="button"
          @click.stop="selectCausal(option)"
        >
          {{ option }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="less">
.interaction {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #24221d;
}

.lead {
  margin: 0;
  color: #5e594f;
  font-size: 14px;
  line-height: 1.65;
}

.key-point,
.variable {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: #f5ead0;
  border-left: 4px solid #d3a32b;
  border-radius: 12px;

  small {
    color: #8f6d1f;
    font-size: 11px;
  }

  b {
    font-size: 14px;
    line-height: 1.5;
  }
}

.primary,
.option-grid button,
.option-list button {
  min-height: 44px;
  border-radius: 12px;
  cursor: pointer;
}

.primary {
  color: #1a1915;
  background: #ffd541;
  border: 0;
  font-size: 14px;
  font-weight: 700;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  button {
    padding: 10px;
    color: #fff;
    background: #24231f;
    border: 1px solid #35332d;
    font-size: 13px;
  }
}

.causal-path {
  display: grid;
  grid-template-columns: 1fr auto 1.15fr auto 1fr;
  gap: 6px;
  align-items: center;
  color: #3b3932;
  text-align: center;

  span,
  b {
    display: flex;
    min-height: 54px;
    padding: 8px;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.35;
  }

  span {
    background: #efe9dc;
  }

  b {
    color: #7e5f18;
    background: #fff1b7;
    border: 1px dashed #d3a32b;
  }

  i {
    color: #aa8122;
    font-style: normal;
  }
}

.option-list {
  display: grid;
  gap: 8px;

  button {
    padding: 8px 12px;
    color: #2c2a25;
    background: #fff;
    border: 1px solid #d9cfbb;
    font-size: 13px;
    text-align: left;
  }
}
</style>
