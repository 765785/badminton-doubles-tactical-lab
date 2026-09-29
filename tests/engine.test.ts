import { describe, expect, it } from 'vitest'
import { analyze } from '../src/engine/analyze'
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
