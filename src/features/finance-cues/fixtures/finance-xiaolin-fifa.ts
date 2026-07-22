import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'

const rawExperience = {
  experienceId: 'finance-xiaolin-fifa',
  videoId: '7664748624454192393',
  contentVersion: '2026.07.23.2',
  mediaFingerprint: 'a75cb3f796e0f96d3574d3d0b210cf3276de3fe8cf8382def76b1a0edc0cb464',
  publishStatus: 'approved' as const,
  approvalScope: 'internal_poc' as const,
  approvalDecisionRef: 'user-chat-2026-07-23',
  timecodeQuality: 'estimated_accepted' as const,
  title: '大家看的是比赛，FIFA看的是生意',
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
    { conceptId: 'sports-economics', name: '体育经济学', evidenceIds: ['e-sports-intro'] },
    { conceptId: 'broadcast-rights', name: '转播权', evidenceIds: ['e-broadcast'] },
    { conceptId: 'sponsorship-model', name: '赞助模式', evidenceIds: ['e-sponsor'] },
    { conceptId: 'host-economy', name: '主办国经济账', evidenceIds: ['e-host-cost'] }
  ],
  triggers: [
    {
      triggerId: 'fifa-context-sports-econ',
      startMs: 20000,
      endMs: 26000,
      priority: 70,
      cueDurationMs: 5000,
      expectedInteractionMs: 8000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '背景补丁',
      prompt: '体育赛事怎么变成一门大生意？',
      learningObjective: '理解体育经济学的基本框架：转播权、赞助、主办国经济',
      evidenceIds: ['e-sports-intro'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'context_card' as const,
      payload: {
        title: '体育赛事的经济引擎',
        body: '大型赛事的经济价值分三层：转播权卖给全球媒体、赞助商获得品牌曝光、主办国获得旅游和基建投资。FIFA在这三层都有收入。',
        keyPoint: '赛事经济=转播权+赞助+主办国投入产出，FIFA是核心分配者。',
        feedback: '你理解了体育赛事的商业三层结构，这是分析FIFA生意模式的基础。'
      }
    },
    {
      triggerId: 'fifa-condition-revenue',
      startMs: 65000,
      endMs: 71000,
      priority: 80,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '赞助费和转播费，哪个更决定FIFA收入？',
      learningObjective: '识别不同收入来源对FIFA的依赖程度',
      evidenceIds: ['e-sponsor', 'e-broadcast'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'condition_slider' as const,
      payload: {
        title: '拨动FIFA的收入杠杆',
        variable: '收入来源比重',
        options: [
          {
            id: 'broadcast-heavy',
            label: '转播权收入为主',
            result: 'FIFA对媒体合同依赖度最高，转播权谈判结果直接决定收入上限。'
          },
          {
            id: 'sponsor-heavy',
            label: '赞助收入为主',
            result: '品牌赞助分散单一依赖风险，但单个赞助商退出造成的缺口可能更大。'
          }
        ]
      }
    },
    {
      triggerId: 'fifa-stitch-host',
      startMs: 120000,
      endMs: 126000,
      priority: 85,
      cueDurationMs: 5000,
      expectedInteractionMs: 10000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '补一条边',
      prompt: 'FIFA赚钱 → 主办国？中间缺了什么？',
      learningObjective: '识别FIFA商业成功与主办国经济之间的关系链条',
      evidenceIds: ['e-host-cost'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'causal_stitch' as const,
      payload: {
        title: '补全FIFA与主办国的中间环节',
        before: 'FIFA从赛事中获取巨额商业收入',
        after: '主办国可能面临财务亏损',
        options: [
          '主办国承担场馆和基建成本，回报不确定',
          'FIFA直接把收入分给主办国',
          '赞助商替主办国买单'
        ],
        correctOption: '主办国承担场馆和基建成本，回报不确定',
        feedback: '关键缺口是主办国前期投入。FIFA的商业成功不等于主办国盈利——成本-收益是两条线。'
      }
    },
    {
      triggerId: 'fifa-counterexample-loss',
      startMs: 165000,
      endMs: 171000,
      priority: 75,
      cueDurationMs: 5000,
      expectedInteractionMs: 9000,
      halfSheetMaxRatio: 0.48,
      cueLabel: '换个条件',
      prompt: '如果每个主办国都亏损，FIFA模式可持续吗？',
      learningObjective: '认识赛事经济模式的内生矛盾',
      evidenceIds: ['e-host-cost', 'e-sports-intro'],
      reviewStatus: 'approved' as const,
      fallbackBehavior: 'collapse_to_timeline' as const,
      delivery: 'automatic' as const,
      kind: 'counterexample_flip' as const,
      payload: {
        title: '换个条件看FIFA模式',
        baseClaim: 'FIFA商业模式持续增长，赛事经济共赢',
        options: [
          {
            id: 'host-profit',
            label: '主办国实现盈利',
            result: 'FIFA商业模式形成正向循环，更多国家愿意申办。'
          },
          {
            id: 'host-loss',
            label: '主办国持续亏损',
            result: '申办意愿下降，FIFA面临主办国稀缺风险，可能需要降低申办要求或分担成本。'
          }
        ],
        feedback: '现实是多数主办国基建成本远超预期。这个条件变化会倒逼FIFA改革分配机制。'
      }
    }
  ]
} as const

export const financeXiaolinFifaExperience: ApprovedExperience =
  approvedExperienceSchema.parse(rawExperience)
