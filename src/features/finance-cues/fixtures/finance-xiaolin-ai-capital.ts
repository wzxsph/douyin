import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'

const rawExperience = {
  experienceId: 'finance-xiaolin-ai-capital',
  videoId: '7659728419487337747',
  contentVersion: '2026.07.23.2',
  mediaFingerprint: '460b582fedb5dcec4c775ee295f245b7f93e5a3874164354bfe3a9b86ea14fca',
  publishStatus: 'approved' as const,
  approvalScope: 'internal_poc' as const,
  approvalDecisionRef: 'user-chat-2026-07-23',
  timecodeQuality: 'estimated_accepted' as const,
  title: '美国AI资本牌桌上的斗争，你觉得我这么说合理吗？',
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
    { conceptId: 'ai-capital-landscape', name: 'AI资本格局', evidenceIds: ['e-cap-landscape'] },
    { conceptId: 'capital-concentration', name: '资本集中度', evidenceIds: ['e-concentration'] },
    { conceptId: 'open-source-disruption', name: '开源冲击', evidenceIds: ['e-open-source'] },
    { conceptId: 'compute-vs-data-ai', name: '算力AI与数据AI', evidenceIds: ['e-compute-data'] }
  ],
  triggers: [
    {
      triggerId: 'aicapital-context-landscape',
      startMs: 20000,
      endMs: 26000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 8000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '背景补丁',
      prompt: '美国AI资本是如何分配和集中的？',
      learningObjective: '理解美国AI资本的分布格局和集中逻辑',
      evidenceIds: ['e-cap-landscape'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'context_card' as const,
      payload: {
        title: '美国AI资本的分配地图',
        body: '美国AI投资高度集中：OpenAI、Anthropic等闭源巨头获得数百亿美元融资，算力基础设施公司拿到最大份额。资本集中在少数玩家手中，形成了"钱→算力→模型→数据飞轮→更多钱"的正循环。',
        keyPoint: 'AI资本遵循幂律分布——少数头部公司拿走了绝大多数资金，算力是最大投入项。',
        feedback: '你看到了AI资本的分配地图，理解资本集中的核心逻辑。'
      }
    },
    {
      triggerId: 'aicapital-judgment-concentration',
      startMs: 70000,
      endMs: 76000,
      priority: 80,
      cueDurationMs: 5000,
      expectedInteractionMs: 7000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '快判断',
      prompt: '资本高度集中在几家巨头，是好事还是坏事？',
      learningObjective: '判断AI资本高度集中对产业发展的利弊',
      evidenceIds: ['e-concentration', 'e-cap-landscape'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'quick_judgment' as const,
      payload: {
        title: 'AI资本集中：好事还是坏事？',
        options: [
          {
            id: 'good',
            label: '好事，集中加速突破',
            result: '资本集中使头部公司能持续领先，加速AGI进程，但可能抑制多元技术路线。'
          },
          {
            id: 'bad',
            label: '坏事，加剧垄断',
            result: '资本分散催生更多创新方向，但可能导致资源不足、重复造轮子。'
          }
        ],
        feedback: '资本集中加速了技术突破，但也带来了垄断风险——这是当前AI产业的核心矛盾。'
      }
    },
    {
      triggerId: 'aicapital-counterexample-opensource',
      startMs: 130000,
      endMs: 136000,
      priority: 85,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '如果开源AI效果追上闭源，资本逻辑会变吗？',
      learningObjective: '评估开源AI追赶对闭源资本逻辑的颠覆程度',
      evidenceIds: ['e-open-source', 'e-concentration'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'counterexample_flip' as const,
      payload: {
        title: '换个条件：开源追上了',
        baseClaim: '闭源AI模式需要巨额资本，头部玩家的护城河无法撼动',
        options: [
          {
            id: 'opensource-wins',
            label: '开源追上，逻辑崩了',
            result: '闭源护城河被填平，AI公司估值逻辑需从技术稀缺转向生态和数据优势。'
          },
          {
            id: 'closed-wins',
            label: '闭源仍有绝对优势',
            result: '闭源仍有绝对优势，资本继续向头部集中，开源仅是低成本替代品。'
          }
        ],
        feedback: '开源追赶会动摇闭源AI的资本逻辑——技术壁垒变薄，估值溢价可能消解。'
      }
    },
    {
      triggerId: 'aicapital-compare-compute-data',
      startMs: 190000,
      endMs: 196000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '概念对比',
      prompt: '算力密集型和数据密集型AI，资本模式有何不同？',
      learningObjective: '区分算力驱动和数据驱动两种AI投资逻辑',
      evidenceIds: ['e-compute-data', 'e-cap-landscape'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'concept_compare' as const,
      payload: {
        title: '算力AI vs 数据AI',
        left: {
          term: '算力密集型AI',
          description: '巨额资本投入GPU和训练，算力规模决定模型能力上限。'
        },
        right: {
          term: '数据密集型AI',
          description: '资本投入数据获取和标注，数据质量和多样性决定模型表现。'
        },
        keyDistinction: '算力壁垒靠资本，数据壁垒靠生态——两种模式决定了不同的竞争格局和投资逻辑。'
      }
    }
  ]
} as const

export const financeXiaolinAiCapitalExperience: ApprovedExperience =
  approvedExperienceSchema.parse(rawExperience)
