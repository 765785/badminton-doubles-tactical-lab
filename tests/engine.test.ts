import { describe, expect, it } from 'vitest'
import { analyze, advanceRally } from '../src/engine/analyze'
import { activeLawVersion } from '../src/knowledge/laws'
import { findPreset } from '../src/knowledge/scenarios'
import { competitionFormat } from '../src/domain/model'

const now = new Date('2026-09-29T04:00:00Z')
const preset = (id: string) => findPreset(id)!

describe('规则版本与赛制', () => {
  it('只选在日期区间内的已核验版本', () => {
    expect(activeLawVersion(now)?.rulesVersion).toContain('V5.0 (2)')
    expect(activeLawVersion(new Date('2027-01-04T12:00:00Z'))).toBeNull()
  })
  it('将非正式组合标为训练模拟，且性别不改变能力', () => {
    const scene = preset('attack-formation')
    expect(competitionFormat(scene.cards)).toBe('mens')
    const original = scene.cards.B.attributes.smashPower
    scene.cards.B.gender = 'female'
    expect(competitionFormat(scene.cards)).toBe('training')
    expect(scene.cards.B.attributes.smashPower).toBe(original)
  })
})

describe('分析结果数量与可靠性', () => {
  it('有三个合理接发候选时恰好返回三条且均有证据', () => {
    const scene = preset('return-follow')
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.issues).toEqual([])
    expect(result.recommendations).toHaveLength(3)
    expect(result.recommendations.every((item) => item.evidenceIds.length > 0)).toBe(true)
    expect(result.recommendations.every((item) => item.partnerMovement.description.length > 0)).toBe(true)
  })
  it('球与击球者分处球网两侧时返回零条并给出修改办法', () => {
    const scene = preset('return-follow')
    scene.court.shuttle.y = 9
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations).toHaveLength(0)
    expect(result.issues.some((issue) => issue.code === 'wrong-side')).toBe(true)
    expect(result.issues[0].action).toBeTruthy()
  })
  it('失衡防守只保留可解释的安全选择', () => {
    const scene = preset('defence-formation')
    scene.court.balance = 'offBalance'
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].shotType).toBe('lift')
  })
  it('失衡时不把极限杀球排在前面', () => {
    const scene = preset('attack-formation')
    scene.court.balance = 'offBalance'
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations.every((item) => item.shotType !== 'middleSmash' && item.shotType !== 'straightSmash')).toBe(true)
  })
  it('搭档远离前场时不推荐依赖封网的杀球', () => {
    const scene = preset('attack-formation')
    scene.court.players.B.y = 11
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations.every((item) => item.shotType !== 'middleSmash' && item.shotType !== 'straightSmash')).toBe(true)
    expect(result.recommendations.length).toBeGreaterThan(0)
  })
  it('发球区与接触高度错误时不输出战术推荐', () => {
    const scene = preset('serve-low')
    scene.court.players.A.x = 2.5
    scene.court.shuttle.z = 1.2
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations).toHaveLength(0)
    expect(result.issues.map((issue) => issue.code)).toContain('serve-court')
    expect(result.issues.map((issue) => issue.code)).toContain('serve-height')
  })
  it('接发者越过短发球线时拒绝分析', () => {
    const scene = preset('serve-low')
    scene.court.players.C.y = 5.1
    const result = analyze(scene.court, scene.cards, scene.context, now)
    expect(result.recommendations).toHaveLength(0)
    expect(result.issues.map((issue) => issue.code)).toContain('receiver-court')
  })
  it('改变对方防守能力会改变候选排序分，但不显示胜率', () => {
    const scene = preset('attack-formation')
    const baseline = analyze(scene.court, scene.cards, scene.context, now)
    scene.cards.D.attributes.defence = 20
    const changed = analyze(scene.court, scene.cards, scene.context, now)
    const before = baseline.recommendations.find((item) => item.id === 'attack-middle')!
    const after = changed.recommendations.find((item) => item.id === 'attack-middle')!
    expect(after.tacticalScore).toBeGreaterThan(before.tacticalScore)
    expect(after.explanation.simple).toContain('能力设置')
    expect(after.explanation.simple).not.toMatch(/胜率|获胜概率/)
  })
  it('击球者的杀球能力会影响同一进攻候选的内部排序分', () => {
    const scene = preset('attack-formation')
    const before = analyze(scene.court, scene.cards, scene.context, now).recommendations.find((item) => item.id === 'attack-middle')!
    scene.cards.A.attributes.smashPower = 95
    const after = analyze(scene.court, scene.cards, scene.context, now).recommendations.find((item) => item.id === 'attack-middle')!
    expect(after.tacticalScore).toBeGreaterThan(before.tacticalScore)
  })
})

describe('逐拍分支', () => {
  it('低发球接发后进入第三拍，保存两次击球和搭档移动', () => {
    const scene = preset('serve-low')
    const result = analyze(scene.court, scene.cards, scene.context, now)
    const recommendation = result.recommendations[0]
    const response = recommendation.expectedOpponentResponses[0]
    const next = advanceRally(scene.court, scene.context, recommendation, response)
    expect(next.steps).toHaveLength(2)
    expect(next.steps[0].hitterMovement).toBeDefined()
    expect(next.steps[0].partnerMovement).toBeDefined()
    expect(next.context.phase).toBe('third')
    expect(next.context.shotIndex).toBe(2)
    expect(analyze(next.court, scene.cards, next.context, now).lawVersion).not.toBeNull()
  })
  it('对手挡网后进入网前转换，不误写成接杀防守', () => {
    const scene = preset('return-follow')
    const result = analyze(scene.court, scene.cards, scene.context, now)
    const next = advanceRally(scene.court, scene.context, result.recommendations[0], result.recommendations[0].expectedOpponentResponses[0])
    const follow = analyze(next.court, scene.cards, next.context, now)
    expect(follow.situation).toBe('transition')
    expect(follow.recommendations.every((item) => item.shotType !== 'block')).toBe(true)
  })
  it('从接发预设开始的教学链最多记录四次击球', () => {
    const scene = preset('return-follow')
    const first = analyze(scene.court, scene.cards, scene.context, now).recommendations[0]
    const secondState = advanceRally(scene.court, scene.context, first, first.expectedOpponentResponses[0])
    const third = analyze(secondState.court, scene.cards, secondState.context, now).recommendations[0]
    const fourthState = advanceRally(secondState.court, secondState.context, third, third.expectedOpponentResponses[0])
    expect([...secondState.steps, ...fourthState.steps].map((step) => step.index)).toEqual([1, 2, 3, 4])
    expect(fourthState.context.shotIndex).toBe(4)
  })
})
