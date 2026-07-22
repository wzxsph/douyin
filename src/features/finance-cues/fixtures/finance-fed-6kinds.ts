import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'

const rawExperience = {
  experienceId: 'finance-fed-6kinds',
  videoId: 'finance-fed-demo',
  contentVersion: '2026.07.22.1',
  mediaFingerprint: 'pending-authorized-finance-video',
  publishStatus: 'approved',
  approvalScope: 'internal_poc',
  approvalDecisionRef: 'user-chat-2026-07-23',
  timecodeQuality: 'estimated_accepted',
  title: '美联储降息如何影响股票、黄金和汇率',
  notice: '当前媒体为工程占位，六种触点结构已审核；发布前替换真实视频、字幕与时间码。',
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
      conceptId: 'earnings-condition',
      name: '盈利条件',
      evidenceIds: ['e-growth-condition']
    },
    {
      conceptId: 'financing-cost',
      name: '融资成本',
      evidenceIds: ['e-financing-path']
    },
    {
      conceptId: 'real-yield',
      name: '实际利率',
      evidenceIds: ['e-gold-judgment']
    },
    {
      conceptId: 'rate-differential',
      name: '利差',
      evidenceIds: ['e-fx-flip']
    },
    {
      conceptId: 'nominal-vs-real',
      name: '名义与实际利率',
      evidenceIds: ['e-rate-compare']
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
      triggerId: 'judgment-first-take',
      startMs: 65000,
      endMs: 71000,
      priority: 65,
      cueDurationMs: 5000,
      expectedInteractionMs: 7000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '快判断',
      prompt: '降息之后，股票一定会涨吗？',
      learningObjective: '认识到降息与股价之间不是必然关系',
      evidenceIds: ['e-growth-condition'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'automatic',
      kind: 'quick_judgment',
      payload: {
        title: '降息就等于股票上涨吗？',
        options: [
          {
            id: 'always',
            label: '一定会涨',
            result: '现实里并不必然，盈利与预期同样会左右方向。'
          },
          {
            id: 'depends',
            label: '要看其他条件',
            result: '更接近实际：还要看盈利预期、估值起点与市场情绪。'
          }
        ],
        feedback: '关键是把降息看成一个条件，而不是结果的开关。'
      }
    },
    {
      triggerId: 'stitch-financing',
      startMs: 115000,
      endMs: 121000,
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
    },
    {
      triggerId: 'condition-gold',
      startMs: 165000,
      endMs: 171000,
      priority: 70,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '如果通胀更高，黄金的支撑路径会变吗？',
      learningObjective: '理解实际利率对黄金逻辑的主导作用',
      evidenceIds: ['e-gold-judgment'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'automatic',
      kind: 'condition_slider',
      payload: {
        title: '把通胀条件拨一下',
        variable: '通胀水平',
        options: [
          {
            id: 'low',
            label: '通胀温和',
            result: '名义降息带来的实际利率下行相对有限，黄金支撑路径未必明显。'
          },
          {
            id: 'high',
            label: '通胀偏高',
            result: '实际利率更可能走低，持有黄金的机会成本下降，支撑路径更容易显现。'
          }
        ]
      }
    },
    {
      triggerId: 'flip-fx-path',
      startMs: 215000,
      endMs: 221000,
      priority: 72,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '本国降息，汇率就一定走弱吗？',
      learningObjective: '识别利差与相对预期对汇率的主导作用',
      evidenceIds: ['e-fx-flip'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'timeline_only',
      kind: 'counterexample_flip',
      payload: {
        title: '换个条件看汇率的主导路径',
        baseClaim: '本国降息会让本币走弱',
        options: [
          {
            id: 'other-cuts-more',
            label: '其他经济体降得更多',
            result: '相对利差反而可能收窄压力，本币走弱的路径未必占优。'
          },
          {
            id: 'growth-improves',
            label: '本国增长预期改善',
            result: '增长与风险偏好可能主导资金流向，方向要看多条路径的合力。'
          }
        ],
        feedback: '换个条件后主导路径可能改变：利差与相对预期常常比单边降息更关键。'
      }
    },
    {
      triggerId: 'compare-nominal-real',
      startMs: 265000,
      endMs: 271000,
      priority: 68,
      cueDurationMs: 5000,
      expectedInteractionMs: 8000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '辨概念',
      prompt: '名义利率和实际利率，差在哪？',
      learningObjective: '区分名义利率与实际利率',
      evidenceIds: ['e-rate-compare'],
      reviewStatus: 'approved',
      fallbackBehavior: 'collapse_to_timeline',
      delivery: 'timeline_only',
      kind: 'concept_compare',
      payload: {
        title: '名义利率 vs 实际利率',
        left: {
          term: '名义利率',
          description: '账面上标出的利率，没有扣除通胀影响。'
        },
        right: {
          term: '实际利率',
          description: '名义利率扣掉通胀预期后，真正的资金成本。'
        },
        keyDistinction: '判断黄金等资产逻辑时，起作用的往往是实际利率而非名义利率。'
      }
    }
  ]
} as const

export const financeFed6KindsExperience: ApprovedExperience =
  approvedExperienceSchema.parse(rawExperience)
