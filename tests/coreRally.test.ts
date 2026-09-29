import { describe, expect, it } from 'vitest'
import { distance, type PlayerId, type Point3, type ShotType } from '../src/domain/model'
import type { ConfirmedShot, ShotOutcome } from '../src/domain/rally'
import { evaluateConfirmedShot, inferShotTypes } from '../src/engine/coreRally'
import { evaluateGuidedShot, guidedShot } from '../src/engine/guidedLesson'
import {
  activePath, appendRallyShot, createRallySession, redoRally, selectHistoryNode,
  sessionPosition, undoRally,
} from '../src/engine/rallySession'
import { EVIDENCE_DATASET_VERSION, SIMULATION_PARAMETERS } from '../src/engine/simulationParameters'
import { activeLawVersion } from '../src/knowledge/laws'
import { findPreset } from '../src/knowledge/scenarios'

const law = activeLawVersion(new Date('2026-09-29T00:00:00Z'))
const scene = () => findPreset('attack-formation')!
const makeShot = (court: ReturnType<typeof scene>['court'], target: Point3, shotType: ShotType = 'straightSmash'): ConfirmedShot => ({
  shotType, contactPoint: { x: court.shuttle.x, y: court.shuttle.y, z: court.shuttle.z },
  drawnTrajectory: [{ x: court.shuttle.x, y: court.shuttle.y }, { x: target.x, y: target.y }],
  target, speed: 'slow', trajectory: 'arc', contactSide: 'forehand',
  initiative: 'active', extremeLine: false, assumeContact: false,
})
const evaluate = (court: ReturnType<typeof scene>['court'], cards: ReturnType<typeof scene>['cards'], context: ReturnType<typeof scene>['context'], shot: ConfirmedShot, movementConstraints?: Parameters<typeof evaluateConfirmedShot>[0]['movementConstraints']) =>
  evaluateConfirmedShot({ court, cards, context, shot, lawVersion: law, parameters: SIMULATION_PARAMETERS, evidenceDatasetVersion: EVIDENCE_DATASET_VERSION, movementConstraints })
const next = (result: ReturnType<typeof evaluateConfirmedShot>): ShotOutcome =>
  result.receiverCandidates[0] ?? result.assumedReceiverOptions[0] ?? result.defaultOutcome

describe('共用、确定性的逐拍计算', () => {
  it('教学控制器与自由推演对相同已确认球路得到完全相同的结果', () => {
    const preset = scene()
    const target = { x: 1.7, y: 3.1, z: 0.12 }
    const guided = evaluateGuidedShot(preset.court, preset.cards, preset.context, 'straightSmash', target, law, SIMULATION_PARAMETERS, EVIDENCE_DATASET_VERSION)
    const sandbox = evaluate(preset.court, preset.cards, preset.context, guidedShot(preset.court, 'straightSmash', target))
    expect(guided).toEqual(sandbox)
    expect(evaluate(preset.court, preset.cards, preset.context, guidedShot(preset.court, 'straightSmash', target))).toEqual(sandbox)
  })
  it('画线只提供球种候选；已确认球路分别返回成立性、难度与战术质量', () => {
    const preset = scene()
    expect(inferShotTypes(preset.court, preset.context, { x: 1.7, y: 3.1, z: 0.12 })).toContain('straightSmash')
    const result = evaluate(preset.court, preset.cards, preset.context, makeShot(preset.court, { x: 1.7, y: 3.1, z: 0.12 }))
    expect(result.physicalRuleValidity.status).toBe('valid')
    expect(result.executionDifficulty.level).toBeTruthy()
    expect(result.tacticalQuality.level).toBeTruthy()
    expect(result.executionDifficulty.modelNotice).toContain('教学用途')
  })
  it('不擅自移动过远的羽毛球；训练假设明确标记', () => {
    const preset = scene()
    preset.court.players.A.x = 5.5
    const shot = makeShot(preset.court, { x: 1.7, y: 3.1, z: 0.12 })
    const blocked = evaluate(preset.court, preset.cards, preset.context, shot)
    expect(blocked.physicalRuleValidity.status).toBe('invalid')
    expect(blocked.physicalRuleValidity.reasons.join('')).toContain('距离该球员过远')
    expect(blocked.origin.shotOrigin).toEqual(shot.contactPoint)
    expect(blocked.defaultOutcome.endReason).toBe('invalid')
    expect(blocked.defaultOutcome.terminalProgress).toBe(0)
    expect(blocked.defaultOutcome.nextCourt.players).toEqual(preset.court.players)
    const assumed = evaluate(preset.court, preset.cards, preset.context, { ...shot, assumeContact: true })
    expect(assumed.physicalRuleValidity.status).toBe('assumed')
    expect(assumed.origin.playerPosition.x).toBe(5.5)
  })
  it('明确触网在球网处终止，不把落点当作成功过网', () => {
    const preset = scene()
    const shot = { ...makeShot(preset.court, { x: 2, y: 3.1, z: 0.12 }), netCrossingHeight: 0.8 }
    const result = evaluate(preset.court, preset.cards, preset.context, shot)
    expect(result.defaultOutcome.endReason).toBe('net')
    expect(result.defaultOutcome.terminalProgress).toBeGreaterThan(0)
    expect(result.defaultOutcome.terminalProgress).toBeLessThan(1)
    expect(result.defaultOutcome.nextCourt.shuttle.y).toBeCloseTo(6.7)
  })
  it('能力降低会让高难度击球评价下降，且不显示成功概率', () => {
    const preset = scene()
    const shot = makeShot(preset.court, { x: 1.7, y: 3.1, z: 0.12 })
    const high = evaluate(preset.court, preset.cards, preset.context, shot)
    for (const key of ['smashPower', 'rearCourtAttack', 'attackContinuity', 'consistency', 'firstStep', 'movementSpeed'] as const) {
      preset.cards.A.attributes[key] = 5
    }
    const low = evaluate(preset.court, preset.cards, preset.context, shot)
    const levels = ['easy', 'executable', 'difficult', 'extreme', 'almostImpossible']
    expect(levels.indexOf(low.executionDifficulty.level)).toBeGreaterThan(levels.indexOf(high.executionDifficulty.level))
    expect(JSON.stringify(low.executionDifficulty)).not.toMatch(/\d+(\.\d+)?%/)
  })
  it('更快的搭档在相同飞行时间内移动更远；保持原位实际改变 T2', () => {
    const preset = scene()
    preset.court.players.B = { x: 0.5, y: 11, balance: 'balanced' }
    const shot = makeShot(preset.court, { x: 5.2, y: 3.2, z: 0.12 })
    preset.cards.B.attributes.movementSpeed = 95
    const fast = evaluate(preset.court, preset.cards, preset.context, shot)
    preset.cards.B.attributes.movementSpeed = 25
    const slow = evaluate(preset.court, preset.cards, preset.context, shot)
    expect(distance(next(fast).movements.B.from, next(fast).movements.B.actual))
      .toBeGreaterThan(distance(next(slow).movements.B.from, next(slow).movements.B.actual))
    const held = evaluate(preset.court, preset.cards, preset.context, shot, { B: { kind: 'hold' } })
    expect(next(held).movements.B.actual).toEqual(next(held).movements.B.from)
    expect(next(held).nextCourt.players.B.x).toBe(0.5)
    expect(next(held).movements.B.arrival).toBe('held')
    const follow = { ...makeShot(next(held).nextCourt, { x: 2.4, y: 10, z: 0.12 }, 'clear'), assumeContact: true }
    const nextAnalysis = evaluate(next(held).nextCourt, preset.cards, next(held).nextContext, follow)
    expect(nextAnalysis.origin.playerPosition).toEqual({
      x: next(held).nextCourt.players[next(held).nextCourt.hitterId].x,
      y: next(held).nextCourt.players[next(held).nextCourt.hitterId].y,
    })
    expect(next(nextAnalysis).movements.B.from).toEqual(next(held).movements.B.actual)
  })
  it('两个可达接球人保留各自四人 T2，供用户选择', () => {
    const preset = scene()
    preset.court.players.C = { x: 2.65, y: 3.8 }
    preset.court.players.D = { x: 3.45, y: 3.8 }
    const result = evaluateGuidedShot(preset.court, preset.cards, preset.context,
      'straightDrop', { x: 3.05, y: 4.1, z: 0.12 }, law, SIMULATION_PARAMETERS, EVIDENCE_DATASET_VERSION)
    expect(result.receiverCandidates).toHaveLength(2)
    expect(result.receiverCandidates.map((item) => item.receiver?.playerId)).toEqual(['C', 'D'])
    expect(result.receiverCandidates[0].movements).not.toEqual(result.receiverCandidates[1].movements)
  })
  it('保持原位的接球人不能靠后台移动成为可达候选', () => {
    const preset = scene()
    preset.court.players.C = { x: 2.65, y: 1.8 }
    preset.court.players.D = { x: 3.45, y: 1.8 }
    const shot = makeShot(preset.court, { x: 3.05, y: 4.1, z: 0.12 }, 'straightDrop')
    const moving = evaluate(preset.court, preset.cards, preset.context, shot)
    const held = evaluate(preset.court, preset.cards, preset.context, shot,
      { C: { kind: 'hold' }, D: { kind: 'hold' } })
    expect(moving.receiverCandidates.length).toBeGreaterThan(held.receiverCandidates.length)
  })
  it('无人可达时默认落地；假设接起保留真实球员位置', () => {
    const preset = scene()
    preset.court.players.C = { x: 5.8, y: 0.4 }
    preset.court.players.D = { x: 5.7, y: 0.6 }
    const shot = { ...makeShot(preset.court, { x: 0.2, y: 4.6, z: 0.12 }), speed: 'fast' as const, trajectory: 'downward' as const }
    const result = evaluate(preset.court, preset.cards, preset.context, shot)
    expect(result.receiverCandidates).toHaveLength(0)
    expect(result.defaultOutcome.endReason).toBe('ground')
    expect(result.assumedReceiverOptions).toHaveLength(2)
    const assumed = result.assumedReceiverOptions[0]
    expect(assumed.receiver?.assumed).toBe(true)
    expect(assumed.nextCourt.players[assumed.receiver!.playerId]).not.toEqual(assumed.receiver!.contactPoint)
  })
})

describe('连续状态、历史与分支', () => {
  it('五拍以上不被四拍截断，且每拍以真实 T2 位置为下一拍 T0', () => {
    const preset = scene()
    let session = createRallySession('session', '测试', preset.cards, preset.court, preset.context, '2026-09-29T00:00:00Z')
    for (let index = 0; index < 6; index++) {
      const { court, context } = sessionPosition(session)
      const target = court.hitterId === 'A' || court.hitterId === 'B'
        ? { x: 2.5, y: 3.3, z: 0.12 } : { x: 2.5, y: 10, z: 0.12 }
      const shot = { ...makeShot(court, target, 'clear'), assumeContact: true }
      const result = evaluate(court, session.cards, context, shot)
      const outcome = next(result)
      session = appendRallyShot(session, result, outcome, 'shot-' + index, '2026-09-29T00:00:0' + index + 'Z')
      if (index > 0) {
        const previous = session.nodes['shot-' + (index - 1)]
        expect(session.nodes['shot-' + index].startCourt.players).toEqual(previous.outcome.nextCourt.players)
      }
    }
    expect(activePath(session)).toHaveLength(6)
    expect(sessionPosition(session).context.shotIndex).toBe(6)
  })
  it('撤销、重做和改打分支不修改旧节点；重播保留原结果与模型版本', () => {
    const preset = scene()
    let session = createRallySession('session', '测试', preset.cards, preset.court, preset.context, '2026-09-29T00:00:00Z')
    const first = evaluate(preset.court, preset.cards, preset.context, makeShot(preset.court, { x: 1.7, y: 3.1, z: 0.12 }))
    session = appendRallyShot(session, first, next(first), 'first', '2026-09-29T00:00:01Z')
    const original = structuredClone(session.nodes.first)
    const undone = undoRally(session)
    expect(undone.currentNodeId).toBeNull()
    expect(redoRally(undone).currentNodeId).toBe('first')
    const branchShot = makeShot(preset.court, { x: 4.5, y: 3.1, z: 0.12 }, 'crossSmash')
    const alternate = evaluate(preset.court, preset.cards, preset.context, branchShot)
    const branched = appendRallyShot(selectHistoryNode(session, null), alternate, next(alternate), 'alternate', '2026-09-29T00:00:02Z')
    expect(branched.nodes.first).toEqual(original)
    expect(branched.nodes.alternate.outcome.nextCourt.players).not.toEqual(original.outcome.nextCourt.players)
    expect(branched.nodes.first.simulationParametersVersion).toBe(SIMULATION_PARAMETERS.version)
    expect(branched.nodes.first.outcome).toEqual(original.outcome)
    const newerParameters = { ...SIMULATION_PARAMETERS, version: 'teaching-next-test', maximumPlayerSpeed: 1.8 }
    const newer = evaluateConfirmedShot({ court: preset.court, cards: preset.cards,
      context: preset.context, shot: branchShot, lawVersion: law,
      parameters: newerParameters, evidenceDatasetVersion: 'research-next-test' })
    const crossVersion = appendRallyShot(selectHistoryNode(branched, null), newer, next(newer), 'newer', '2026-09-29T00:00:03Z')
    expect(crossVersion.nodes.first).toEqual(original)
    expect(crossVersion.nodes.newer.simulationParametersVersion).toBe('teaching-next-test')
    expect(crossVersion.nodes.first.evaluation.shuttleTrajectory).toEqual(original.evaluation.shuttleTrajectory)
  })
  it('不同第三拍使第四拍从不同的四人状态开始', () => {
    const preset = scene()
    const ids: PlayerId[] = ['A', 'B', 'C', 'D']
    const shot = makeShot(preset.court, { x: 1.7, y: 3.1, z: 0.12 })
    const straight = evaluate(preset.court, preset.cards, preset.context, shot)
    const cross = evaluate(preset.court, preset.cards, preset.context, { ...shot, shotType: 'crossSmash', target: { x: 4.6, y: 3.1, z: 0.12 } })
    const a = next(straight).nextCourt
    const b = next(cross).nextCourt
    expect(ids.some((id) => distance(a.players[id], b.players[id]) > 0.01)).toBe(true)
    expect(a.players).not.toEqual(b.players)
  })
})
