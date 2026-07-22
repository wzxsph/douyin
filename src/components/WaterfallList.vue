<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    list?: any[]
  }>(),
  { list: () => [] }
)

defineSlots<{
  default(props: { item: any }): any
}>()

const leftList = computed(() => props.list.filter((_item, index) => index % 2 === 0))
const rightList = computed(() => props.list.filter((_item, index) => index % 2 !== 0))
</script>

<template>
  <div class="waterfall">
    <div class="waterfall-row">
      <slot v-for="item in leftList" :item="item"></slot>
    </div>
    <div class="waterfall-row">
      <slot v-for="item in rightList" :item="item"></slot>
    </div>
  </div>
</template>

<style scoped lang="less">
.waterfall {
  display: flex;
  gap: 10rem;

  .waterfall-row {
    width: 50%;
    display: flex;
    flex-direction: column;
  }
}
</style>
