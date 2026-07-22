import type { AuthoredPayload } from '../../src/domain/payload-contracts.js'

/**
 * Golden authored payloads — one per CueKind. The three renderable-kind entries
 * are copied VERBATIM from the frontend fixture
 * (src/features/finance-cues/fixtures/finance-fed-v1.ts) so
 * payload-contract.spec.ts can assert server↔frontend shape equality.
 * The three non-renderable-kind entries define the target shape the frontend
 * renderers must satisfy once implemented.
 */
export const goldenPayloads: AuthoredPayload[] = [
  {
    kind: 'context_card',
    payload: {
      title: '政策利率不是所有利率的开关',
      body: '央行直接调整的是政策工具利率。贷款、债券和企业融资成本还要经过市场预期、信用风险与期限结构传导。',
      keyPoint: '降息影响的是资金价格起点，不代表所有融资成本立刻同步下降。',
      feedback: '你补上了传导起点：政策利率先变，市场融资条件再逐步响应。'
    }
  },
  {
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
    kind: 'quick_judgment',
    payload: {
      title: '美国降息，美元一定走弱吗？',
      options: [
        {
          id: 'relative',
          label: '相对利差可能让美元未必走弱',
          result: '汇率取决于相对利差，别国降更多时美元未必弱。'
        },
        {
          id: 'certain',
          label: '只要美国降息，美元必然走弱',
          result: '这是绝对化判断，忽略了别国政策与预期差。'
        },
        {
          id: 'insufficient',
          label: '方向取决于更多条件，当前信息不足',
          result: '需要更多条件才能定方向，先标记信息不足。'
        }
      ],
      feedback: '关键是相对利差与预期差，不是单看美国绝对利率。'
    }
  },
  {
    kind: 'counterexample_flip',
    payload: {
      title: '别国降得更多，结论会变吗？',
      baseClaim: '美国降息通常压低美元',
      options: [
        { id: 'us-only', label: '只有美国降息', result: '美元端相对利差走弱，压制路径占优。' },
        {
          id: 'others-more',
          label: '其他经济体降得更多',
          result: '相对利差反而支撑美元，原结论被翻转。'
        }
      ],
      feedback: '反例说明的是非必然性，不是原机制全错。'
    }
  },
  {
    kind: 'concept_compare',
    payload: {
      title: '黄金更敏感的是哪种利率？',
      left: { term: '名义利率', description: '未扣除通胀的账面利率。' },
      right: { term: '实际利率', description: '名义利率扣除通胀后的真实回报。' },
      keyDistinction: '黄金机会成本盯的是实际利率，不是名义利率。'
    }
  }
]
