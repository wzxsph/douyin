import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'

const rawExperience = {
  experienceId: 'finance-fed-v1',
  videoId: 'finance-fed-demo',
  contentVersion: '2026.07.22.1',
  mediaFingerprint: 'finance-real-venezuela',
  publishStatus: 'approved',
  approvalScope: 'internal_poc',
  approvalDecisionRef: 'user-chat-2026-07-23',
  timecodeQuality: 'estimated_accepted',
  title: '美联储降息如何影响股票、黄金和汇率',
  notice: 'Real Venezuela finance commentary video loaded; 3 pre-approved cues active.',
  constraints: {
    minGapMs: 45000,
    maxConcurrent: 1,
    playbackPolicy: {
      invitation: 'continue',
      interaction: 'pause',
      exit: 'restore_previous'
    }
  },
  concepts: [
    {
      conceptId: 'policy-rate',
      name: '政策利率',
      evidenceIds: ['e-rate-context']
    },
    {
      conceptId: 'financing-cost',
      name: '融资成本',
      evidenceIds: ['e-financing-path']
    },
    {
      conceptId: 'earnings-condition',
      name: '盈利条件',
      evidenceIds: ['e-growth-condition']
    }
  ],
  triggers: [
    {
      triggerId: 'context-policy-rate',
      startMs: 15000,
      endMs: 21000,
      priority: 70,
      cueDurationMs: 5000,
      expectedInteractionMs: 8000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '背景补丁',
      prompt: '这里说的“降息”，到底降的是什么？',
      learningObjective: '区分政策利率与所有贷款利率',
      evidenceIds: ['e-rate-context'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'automatic',
      kind: 'context_card',
      payload: {
        title: '政策利率不是所有利率的开关',
        body: '央行直接调整的是政策工具利率。贷款、债券和企业融资成本还要经过市场预期、信用风险与期限结构传导。',
        keyPoint: '降息影响的是资金价格起点，不代表所有融资成本立刻同步下降。',
        feedback: '你补上了传导起点：政策利率先变，市场融资条件再逐步响应。'
      }
    },
    {
      triggerId: 'condition-growth',
      startMs: 75000,
      endMs: 81000,
      priority: 80,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '如果衰退信号增强，股票路径还占优吗？',
      learningObjective: '识别估值支撑和盈利压制的竞争',
      evidenceIds: ['e-growth-condition'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'automatic',
      kind: 'condition_slider',
      payload: {
        title: '把增长条件拨一下',
        variable: '经济增长',
        options: [
          {
            id: 'stable',
            label: '增长相对稳健',
            result: '融资成本与折现率下降的支撑路径更容易显现，但仍不是必然上涨。'
          },
          {
            id: 'recession',
            label: '衰退信号增强',
            result: '盈利下修可能压过估值支撑，结果转为路径冲突或压制路径占优。'
          }
        ]
      }
    },
    {
      triggerId: 'stitch-financing',
      startMs: 135000,
      endMs: 141000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 10000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '补一条边',
      prompt: '从降息到股票估值，中间缺了哪一步？',
      learningObjective: '识别融资成本这一中间机制',
      evidenceIds: ['e-financing-path'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'automatic',
      kind: 'causal_stitch',
      payload: {
        title: '补全中间机制',
        before: '政策利率下降',
        after: '股票估值可能获得支撑',
        options: ['企业融资成本可能下降', '企业数量立刻增加', '所有利润同步上涨'],
        correctOption: '企业融资成本可能下降',
        feedback: '关键中间边是融资成本与折现率，而不是从降息直接跳到股价。'
      }
    }
  ]
} as const

export const financeFedExperience: ApprovedExperience =
  approvedExperienceSchema.parse(rawExperience)
