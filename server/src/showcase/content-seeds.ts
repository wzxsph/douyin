export interface ShowcaseContentSeed {
  itemId: string
  conceptA: string
  conceptADescription: string
  conceptB: string
  conceptBDescription: string
  cause: string
  mechanism: string
  outcome: string
  conditionVariable: string
  counterexample: string
  judgmentQuestion: string
}

export const SHOWCASE_CONTENT_SEEDS: readonly ShowcaseContentSeed[] = [
  {
    itemId: '7664748624454192393',
    conceptA: '赛事注意力',
    conceptADescription: '观众投入的时间与讨论热度',
    conceptB: '商业变现',
    conceptBDescription: '版权、赞助和授权带来的收入',
    cause: '全球赛事吸引注意力',
    mechanism: '转化为转播、赞助与授权议价能力',
    outcome: '赛事组织获得商业收入',
    conditionVariable: '全球观看规模',
    counterexample: '主办成本和组织风险同步上升',
    judgmentQuestion: '关注度高就一定更赚钱吗？'
  },
  {
    itemId: '7660817965343870248',
    conceptA: '算力需求',
    conceptADescription: '模型训练和推理消耗的计算资源',
    conceptB: '电力约束',
    conceptBDescription: '发电、电网和并网能力形成的边界',
    cause: '数据中心扩张',
    mechanism: '持续抬升用电负荷和并网需求',
    outcome: '电网与电源成为扩张约束',
    conditionVariable: '单位算力能效',
    counterexample: '芯片和冷却效率改善会缓解用电压力',
    judgmentQuestion: '有算力芯片就能无限扩建吗？'
  },
  {
    itemId: '7660177158400216347',
    conceptA: '技术能力',
    conceptADescription: '系统能否完成目标驾驶任务',
    conceptB: '商业化能力',
    conceptBDescription: '产品能否合规、规模化并形成现金流',
    cause: '自动驾驶能力进步',
    mechanism: '降低部分运营成本并扩大应用范围',
    outcome: '商业模式出现扩张机会',
    conditionVariable: '监管和事故责任边界',
    counterexample: '技术领先不等于订单、牌照和利润同步出现',
    judgmentQuestion: 'L4能力等于商业成功吗？'
  },
  {
    itemId: '7659728419487337747',
    conceptA: '模型竞争',
    conceptADescription: '产品能力、用户和生态之间的竞争',
    conceptB: '资本开支',
    conceptBDescription: '算力、人才和基础设施的持续投入',
    cause: 'AI竞赛加速',
    mechanism: '推高算力与研发投入并改变合作关系',
    outcome: '资本与产业格局重新分配',
    conditionVariable: '商业收入兑现速度',
    counterexample: '高投入若缺少收入会放大现金流压力',
    judgmentQuestion: '投入越多就一定越领先吗？'
  },
  {
    itemId: '7631441410851360041',
    conceptA: '私募信贷',
    conceptADescription: '非公开市场中的企业借贷安排',
    conceptB: '流动性错配',
    conceptBDescription: '资产回收慢但资金退出要求更快',
    cause: '借款人偿付能力走弱',
    mechanism: '违约增加并降低贷款资产可交易性',
    outcome: '资金赎回和估值压力上升',
    conditionVariable: '抵押物质量与回收率',
    counterexample: '单个案例不必然代表整个信贷市场失灵',
    judgmentQuestion: '个别违约等于系统性风险吗？'
  },
  {
    itemId: '7633235465029684526',
    conceptA: '平台竞争',
    conceptADescription: '平台通过补贴、流量和服务争夺用户',
    conceptB: '监管成本',
    conceptBDescription: '合规整改、罚款和规则变化带来的成本',
    cause: '竞争手段越过规则边界',
    mechanism: '触发监管调查与经营方式整改',
    outcome: '短期获客优势被合规成本抵消',
    conditionVariable: '补贴强度与商户承受能力',
    counterexample: '竞争激烈也可能通过改善效率创造用户价值',
    judgmentQuestion: '低价竞争只会伤害市场吗？'
  },
  {
    itemId: '7645142738215652644',
    conceptA: '信息披露',
    conceptADescription: '企业主动说明经营与供应链信息',
    conceptB: '品牌信任',
    conceptBDescription: '消费者对品牌承诺可验证性的判断',
    cause: '企业公开更多经营细节',
    mechanism: '降低信息差并接受外部核验',
    outcome: '信任可能增强也可能暴露问题',
    conditionVariable: '披露内容的可验证程度',
    counterexample: '披露很多不等于披露完整或结论可靠',
    judgmentQuestion: '主动披露就代表没有风险吗？'
  },
  {
    itemId: '7644774425983864070',
    conceptA: '生产成本',
    conceptADescription: '完成一部内容所需的人力与工具成本',
    conceptB: '注意力分配',
    conceptBDescription: '平台把流量分给不同内容的机制',
    cause: '生成工具降低制作门槛',
    mechanism: '内容供给激增并加剧注意力竞争',
    outcome: '收益向平台、工具和头部内容重新分配',
    conditionVariable: '平台分发规则',
    counterexample: '供给增加不保证用户时长或付费同步增长',
    judgmentQuestion: '制作更便宜就一定更赚钱吗？'
  },
  {
    itemId: '7611478554081037578',
    conceptA: '产业集群',
    conceptADescription: '设计、制造、渠道和人才的地理聚集',
    conceptB: '时尚中心',
    conceptBDescription: '能够持续定义趋势并连接全球市场的城市',
    cause: '制造与设计资源长期聚集',
    mechanism: '形成专业网络和品牌协同',
    outcome: '城市获得更强的时尚话语权',
    conditionVariable: '国际渠道和人才流动',
    counterexample: '一次活动热度不能替代完整产业基础',
    judgmentQuestion: '办大秀就能成为时尚中心吗？'
  },
  {
    itemId: '7632518301003828507',
    conceptA: '场景零售',
    conceptADescription: '在住宿等场景中展示并销售商品',
    conceptB: '酒店收入',
    conceptBDescription: '客房、会员和零售共同形成的收入结构',
    cause: '用户在酒店真实体验商品',
    mechanism: '降低试用成本并连接后续购买',
    outcome: '住宿之外出现零售收入',
    conditionVariable: '体验转化率与复购率',
    counterexample: '陈列商品过多可能干扰核心住宿体验',
    judgmentQuestion: '多卖商品就一定提升酒店价值吗？'
  },
  {
    itemId: '7620609117891136822',
    conceptA: '战略目标',
    conceptADescription: '参与方希望通过行动实现的结果',
    conceptB: '升级成本',
    conceptBDescription: '冲突扩大带来的军事、经济与政治代价',
    cause: '各方试探对手底线',
    mechanism: '通过有限行动传递威慑和谈判信号',
    outcome: '冲突可能受控也可能误判升级',
    conditionVariable: '沟通渠道与报复强度',
    counterexample: '强硬表态不必然代表准备无限升级',
    judgmentQuestion: '行动更强硬就一定走向全面冲突吗？'
  },
  {
    itemId: '7600709478131977481',
    conceptA: '硬件收入',
    conceptADescription: '销售设备获得的一次性收入',
    conceptB: '生态收入',
    conceptBDescription: '软件、服务和配件形成的持续收入',
    cause: '设备用户规模扩大',
    mechanism: '带动服务、内容和配件的交叉使用',
    outcome: '收入从单次销售延伸到生命周期',
    conditionVariable: '用户留存和服务使用率',
    counterexample: '封闭生态可能提高迁移成本并降低用户接受度',
    judgmentQuestion: '用户多就一定能建成生态吗？'
  },
  {
    itemId: '7620607704406576425',
    conceptA: '海上咽喉',
    conceptADescription: '大量运输必须经过的狭窄通道',
    conceptB: '能源供应',
    conceptBDescription: '原油和天然气从产地到市场的流动',
    cause: '关键航道通行受扰',
    mechanism: '增加运输时间、保险和绕行成本',
    outcome: '能源供应预期与风险溢价变化',
    conditionVariable: '中断持续时间与替代路线',
    counterexample: '短暂事件若未影响实物流量，价格冲击可能消退',
    judgmentQuestion: '航道紧张就等于供应已经中断吗？'
  },
  {
    itemId: '7536509338895011081',
    conceptA: '盈利预期',
    conceptADescription: '市场对未来收入和利润的估计',
    conceptB: '公司估值',
    conceptBDescription: '对未来现金流和风险折现后的判断',
    cause: 'AI需求提升盈利预期',
    mechanism: '改变未来现金流估计和估值倍数',
    outcome: '公司市值快速变化',
    conditionVariable: '增长兑现与竞争强度',
    counterexample: '业务优秀也可能因预期过高出现估值压力',
    judgmentQuestion: '市值最高等于公司风险最低吗？'
  },
  {
    itemId: '7507542741346176296',
    conceptA: '债券价格',
    conceptADescription: '存量债券在市场中的交易价格',
    conceptB: '债券收益率',
    conceptBDescription: '按当前价格计算的持有回报水平',
    cause: '长期利率预期上升',
    mechanism: '旧债固定现金流相对吸引力下降',
    outcome: '长期债券价格承压',
    conditionVariable: '通胀与财政供给预期',
    counterexample: '避险需求上升时可能部分抵消利率压力',
    judgmentQuestion: '收益率上升时债券价格也会上升吗？'
  },
  {
    itemId: '7638141580495614437',
    conceptA: '担保风险',
    conceptADescription: '企业为关联方债务承担的潜在责任',
    conceptB: '公司治理',
    conceptBDescription: '决策、监督和利益约束的制度安排',
    cause: '关联交易或担保缺少约束',
    mechanism: '把外部债务风险传导到上市公司',
    outcome: '现金流与市场信任受到影响',
    conditionVariable: '担保规模与追偿能力',
    counterexample: '公告风险不等于损失已经全部实现',
    judgmentQuestion: '出现担保事项就等于公司已经亏损吗？'
  },
  {
    itemId: '7664831270933284217',
    conceptA: '内幕信息',
    conceptADescription: '尚未公开且可能显著影响判断的信息',
    conceptB: '市场公平',
    conceptBDescription: '参与者在公开规则下平等获取信息',
    cause: '特定主体提前掌握重大信息',
    mechanism: '形成不对称决策优势并破坏公平',
    outcome: '触发监管调查和信任损失',
    conditionVariable: '信息重大性与交易关联',
    counterexample: '时间接近并不能单独证明信息已被非法使用',
    judgmentQuestion: '交易时点巧合就能证明内幕交易吗？'
  },
  {
    itemId: '7664151518648828581',
    conceptA: '个人安排',
    conceptADescription: '婚姻与财产关系中的个人法律安排',
    conceptB: '控制权变化',
    conceptBDescription: '表决权和公司决策影响力的改变',
    cause: '大额股权发生分割或转移',
    mechanism: '改变持股结构和潜在表决安排',
    outcome: '市场重新评估控制权稳定性',
    conditionVariable: '表决权协议和锁定安排',
    counterexample: '股权转移不必然导致实际控制人变化',
    judgmentQuestion: '大额股权变动就等于控制权易主吗？'
  },
  {
    itemId: '7656039421858309242',
    conceptA: '个人责任',
    conceptADescription: '个人行为产生的刑事或民事后果',
    conceptB: '公司经营',
    conceptBDescription: '企业资产、团队和业务的持续运转',
    cause: '核心人物面临法律风险',
    mechanism: '影响决策、融资和合作方信心',
    outcome: '公司经营不确定性上升',
    conditionVariable: '公司治理独立性',
    counterexample: '个人被追责不等于所有公司资产同时失效',
    judgmentQuestion: '创始人出事就等于公司立即停止经营吗？'
  },
  {
    itemId: '7664981604339829114',
    conceptA: '技术资产',
    conceptADescription: '专利、人才和研发组织形成的能力',
    conceptB: '治理结构',
    conceptBDescription: '所有权、管理权与监督权的安排',
    cause: '技术资产与资本快速集中',
    mechanism: '提高扩张效率也放大治理依赖',
    outcome: '产业影响力和控制风险同时上升',
    conditionVariable: '监督机制与债务约束',
    counterexample: '个人影响力强不等于组织能力完全由一人构成',
    judgmentQuestion: '行业领军者等于治理结构稳健吗？'
  },
  {
    itemId: '7652299373405069425',
    conceptA: '产业成长',
    conceptADescription: '产品、产能和客户需求带来的扩张',
    conceptB: '资本扩张',
    conceptBDescription: '融资、并购和股权安排推动的扩张',
    cause: '产业机会与资本工具结合',
    mechanism: '加快产能、并购和控制范围扩大',
    outcome: '财富与企业规模快速变化',
    conditionVariable: '经营现金流与负债水平',
    counterexample: '财富增长不等于所有扩张项目都创造价值',
    judgmentQuestion: '资本扩张越快越好吗？'
  },
  {
    itemId: '7665270901798578873',
    conceptA: '家族控制',
    conceptADescription: '家族成员通过股权和职位影响企业',
    conceptB: '治理冲突',
    conceptBDescription: '不同利益方对决策和资源产生分歧',
    cause: '家族内部利益和角色发生变化',
    mechanism: '通过股权、董事会和诉讼传导冲突',
    outcome: '经营决策和外部信任受扰',
    conditionVariable: '董事会独立性与制度约束',
    counterexample: '家庭矛盾不一定改变公司的日常经营能力',
    judgmentQuestion: '家族冲突一定会让企业失去经营能力吗？'
  },
  {
    itemId: '7655332588454594939',
    conceptA: '关键人物风险',
    conceptADescription: '企业过度依赖少数管理者产生的风险',
    conceptB: '组织韧性',
    conceptBDescription: '组织在人员变化后继续运转的能力',
    cause: '关键管理者无法履职',
    mechanism: '影响授权、沟通和合作方预期',
    outcome: '治理与经营不确定性上升',
    conditionVariable: '接班机制和管理团队完整性',
    counterexample: '成熟团队可能降低单一人物事件的影响',
    judgmentQuestion: '关键人物缺席就等于业务停摆吗？'
  },
  {
    itemId: '7646697433079458545',
    conceptA: '收入确认',
    conceptADescription: '企业在何时把交易计入收入',
    conceptB: '审计证据',
    conceptBDescription: '支持财务数据真实完整的可验证材料',
    cause: '业绩压力推动不当会计处理',
    mechanism: '虚构或提前确认交易改善报表',
    outcome: '财务信息失真并触发监管责任',
    conditionVariable: '内部控制和审计独立性',
    counterexample: '报表差错与故意造假需要不同证据判断',
    judgmentQuestion: '财务更正就一定等于主观造假吗？'
  },
  {
    itemId: '7657748592710397797',
    conceptA: '市场叙事',
    conceptADescription: '参与者用故事解释公司与行业前景',
    conceptB: '经营基本面',
    conceptBDescription: '收入、现金流和竞争能力等经营事实',
    cause: '热门叙事吸引集中关注',
    mechanism: '放大预期并弱化短期事实权重',
    outcome: '市场判断与经营现实可能背离',
    conditionVariable: '信息披露与业绩兑现',
    counterexample: '叙事并非都虚假，关键是能否被事实持续验证',
    judgmentQuestion: '故事讲得好就等于基本面改善吗？'
  }
] as const

export const SHOWCASE_EXPERIENCE_BY_VIDEO_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    SHOWCASE_CONTENT_SEEDS.map((seed) => [seed.itemId, `finance-showcase-${seed.itemId}`])
  )
)

export function findShowcaseSeed(itemId: string): ShowcaseContentSeed | undefined {
  return SHOWCASE_CONTENT_SEEDS.find((seed) => seed.itemId === itemId)
}
