import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'

const rawExperience = {
  experienceId: 'finance-xiaolin-ai-power',
  videoId: '7660817965343870248',
  contentVersion: '2026.07.23.2',
  mediaFingerprint: 'c2b1f2cd1fdb948142c3c2ec5978b97e70a7e24e2af07482b245e83d48495e52',
  publishStatus: 'approved' as const,
  approvalScope: 'internal_poc' as const,
  approvalDecisionRef: 'user-chat-2026-07-23',
  timecodeQuality: 'estimated_accepted' as const,
  title: '电，怎么卡住了AI的脖子？',
  notice: 'Internal PoC：用户已接受当前估算触点；不代表公开生产内容审核。',
  constraints: {
    minGapMs: 45000,
    maxConcurrent: 1 as const,
    playbackPolicy: {
      invitation: 'continue' as const,
      interaction: 'pause' as const,
      exit: 'restore_previous' as const
    }
  },
  concepts: [
    { conceptId: 'ai-power-demand', name: 'AI电力需求', evidenceIds: ['e-power-scale'] },
    { conceptId: 'grid-bottleneck', name: '电网瓶颈', evidenceIds: ['e-grid-limit'] },
    { conceptId: 'data-center-energy', name: '数据中心能耗', evidenceIds: ['e-dc-energy'] },
    { conceptId: 'nuclear-revival', name: '核电复兴', evidenceIds: ['e-nuclear'] }
  ],
  triggers: [
    {
      triggerId: 'aipower-context-demand',
      startMs: 25000,
      endMs: 31000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 8000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '背景补丁',
      prompt: 'AI到底有多耗电？一个数据给个概念。',
      learningObjective: '理解AI电力需求的规模和增长速度',
      evidenceIds: ['e-power-scale'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'context_card' as const,
      payload: {
        title: 'AI的电力胃口有多大',
        body: '训练一个大模型需要几万度电，相当于数百个家庭一年的用电量。推理阶段持续运行的数据中心用电量更为惊人，一座超大规模数据中心可以消耗一个中小城市的全部电力。',
        keyPoint: 'AI的电力需求已经不是锦上添花，而是基础设施级别的能源挑战。',
        feedback: '你对AI的电力消耗规模有了体感，这是理解电网瓶颈的基础。'
      }
    },
    {
      triggerId: 'aipower-judgment-bottleneck',
      startMs: 80000,
      endMs: 86000,
      priority: 80,
      cueDurationMs: 5000,
      expectedInteractionMs: 7000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '快判断',
      prompt: '电力真能卡死AI发展吗？',
      learningObjective: '判断电力供给是否构成AI发展的硬瓶颈',
      evidenceIds: ['e-grid-limit'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'quick_judgment' as const,
      payload: {
        title: '电力是不是AI的硬瓶颈？',
        options: [
          {
            id: 'yes-hard',
            label: '是硬瓶颈，短期无法解决',
            result: '电网扩容周期5-10年，短期内算力扩张确实被电力卡住。'
          },
          {
            id: 'not-hard',
            label: '不是硬瓶颈，可绕行',
            result: '效率提升和分布式部署可以部分绕开电网瓶颈，但无法完全替代。'
          }
        ],
        feedback: '电力是软硬兼有的瓶颈——算力需求弹性和电网刚性供给之间的张力将主导产业节奏。'
      }
    },
    {
      triggerId: 'aipower-compare-grid-dc',
      startMs: 150000,
      endMs: 156000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '概念对比',
      prompt: '传统电网和AI数据中心，能耗模式有何不同？',
      learningObjective: '区分传统电网负载与AI数据中心的能耗特征',
      evidenceIds: ['e-dc-energy', 'e-grid-limit'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'concept_compare' as const,
      payload: {
        title: '传统电网 vs AI数据中心',
        left: {
          term: '传统电网负载',
          description: '分散、可预测、允许一定波动，电力系统有成熟调度经验。'
        },
        right: {
          term: 'AI数据中心',
          description: '集中、高密度、24/7满负荷，对供电稳定性和容量提出极端要求。'
        },
        keyDistinction: 'AI数据中心高密度集中的负载模式打破了传统电力的分散调度模型，迫使电网重构。'
      }
    },
    {
      triggerId: 'aipower-stitch-grid-nuclear',
      startMs: 220000,
      endMs: 226000,
      priority: 85,
      cueDurationMs: 5000,
      expectedInteractionMs: 10000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '补一条边',
      prompt: '算力需求膨胀 → 电网瓶颈 → ？',
      learningObjective: '识别电网瓶颈与核电复兴之间的因果关系',
      evidenceIds: ['e-nuclear', 'e-grid-limit'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'causal_stitch' as const,
      payload: {
        title: '补全电网瓶颈的下一步',
        before: 'AI算力需求推动电网达到瓶颈',
        after: '科技巨头纷纷投资核电',
        options: ['核电提供稳定、零碳的基荷电力', '核电比天然气更便宜', '核电建设周期短于电网升级'],
        correctOption: '核电提供稳定、零碳的基荷电力',
        feedback:
          '关键逻辑是核电的基荷特性匹配了AI数据中心24/7满负荷需求，碳排约束也强化了核电优势。'
      }
    },
    {
      triggerId: 'aipower-condition-nuclear',
      startMs: 290000,
      endMs: 296000,
      priority: 80,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '核电复兴是虚火还是真趋势？',
      learningObjective: '评估核电复兴的可持续性条件',
      evidenceIds: ['e-nuclear'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'condition_slider' as const,
      payload: {
        title: '核电复兴的可持续条件',
        variable: '核电建设速度',
        options: [
          {
            id: 'fast-build',
            label: '建设周期缩短到5年内',
            result: '核电可能成为AI基础设施的标准配套，形成规模效应降低成本。'
          },
          {
            id: 'slow-build',
            label: '建设周期维持10年以上',
            result: '远水难解近渴，短期仍需依赖天然气和效率优化，核电更像是远期押注。'
          }
        ]
      }
    }
  ]
} as const

export const financeXiaolinAiPowerExperience: ApprovedExperience =
  approvedExperienceSchema.parse(rawExperience)
