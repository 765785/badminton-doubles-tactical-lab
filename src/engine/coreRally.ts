import {
  COURT_LENGTH, COURT_WIDTH, DOUBLE_LONG_SERVICE_DISTANCE, NET_Y, PLAYER_IDS,
  SHORT_SERVICE_DISTANCE, SHOT_LABELS, distance, opponentIds, partnerOf,
  teamOf, type CourtState, type LawVersion, type PlayerId, type Point, type Point3,
  type RallyContext, type ShotType, type TeamId,
} from '../domain/model'
import type {
  Cards, ConfirmedShot, CoverageZone, ExecutionDifficulty, FormationState,
  MovementConstraints, PartnershipAnalysis, PhysicalRuleValidity, PlayerMovementPlan,
  ReceiverCandidate, ShotDraft, ShotEvaluation, ShotOutcome, SimulationParameters,
  TacticalQuality, TacticalRole,
} from '../domain/rally'
import { FORMATION_LABELS } from '../domain/rally'
import { ENGINE_VERSION, SIMULATION_PARAMETERS } from './simulationParameters'

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const copy = <T,>(value: T): T => structuredClone(value)
const halfPoint = (id: PlayerId, point: Point): Point => ({
  x: clamp(point.x, 0.15, COURT_WIDTH - 0.15),
  y: clamp(point.y, teamOf(id) === 1 ? NET_Y + 0.2 : 0.2, teamOf(id) === 1 ? COURT_LENGTH - 0.2 : NET_Y - 0.2),
})
const toPoint = (point: Point3): Point => ({ x: point.x, y: point.y })
const isAttack = (shot: ShotType) => ['middleSmash', 'straightSmash', 'crossSmash', 'halfSmash', 'netKill', 'fastDrop'].includes(shot)
const isDefensive = (shot: ShotType) => ['lift', 'clear', 'block'].includes(shot)
const isFront = (shot: ShotType) => ['net', 'block', 'netKill', 'straightDrop', 'crossDrop', 'fastDrop'].includes(shot)
const isServe = (shot: ShotType) => shot === 'lowServe' || shot === 'flickServe'

export function defaultShotMotion(shot: ShotType): Pick<ShotDraft, 'speed' | 'trajectory'> {
  const forceful = ['middleSmash', 'straightSmash', 'crossSmash', 'halfSmash', 'netKill']
  if (forceful.includes(shot)) return { speed: 'fast', trajectory: 'downward' }
  if (shot === 'drive' || shot === 'push') return { speed: 'fast', trajectory: 'flat' }
  return { speed: 'medium', trajectory: 'arc' }
}

export function inferShotTypes(court: CourtState, context: RallyContext, target: Point3, parameters = SIMULATION_PARAMETERS): ShotType[] {
  const from = court.shuttle
  const hitterTeam = teamOf(court.hitterId)
  const front = Math.abs(target.y - NET_Y) < parameters.inference.frontDistanceMeters
  const cross = (from.x < COURT_WIDTH / 2) !== (target.x < COURT_WIDTH / 2)
  if (context.phase === 'serve') return front ? ['lowServe', 'flickServe'] : ['flickServe', 'lowServe']
  if (from.z >= parameters.inference.rearContactHeightMeters
      && Math.abs(from.y - NET_Y) > parameters.inference.rearContactDistanceMeters) {
    return front ? [cross ? 'crossDrop' : 'straightDrop', 'fastDrop'] : [cross ? 'crossSmash' : 'straightSmash', 'halfSmash']
  }
  if (front) return from.z > parameters.inference.netHighHeightMeters ? ['netKill', 'net'] : ['net', 'block']
  if (target.y < NET_Y && hitterTeam === 1 || target.y > NET_Y && hitterTeam === 2) {
    return from.z < parameters.inference.lowContactHeightMeters ? ['lift', 'clear'] : ['drive', 'push']
  }
  return ['drive', 'push']
}

export function flightSeconds(shot: ConfirmedShot, parameters: SimulationParameters): number {
  const meters = distance(shot.contactPoint, shot.target)
  const arcFactor = shot.trajectory === 'arc' ? parameters.arcFlightFactor : 1
  return clamp(
    meters / parameters.flightSpeedMetersPerSecond[shot.speed] * arcFactor,
    parameters.minimumFlightSeconds,
    parameters.maximumFlightSeconds,
  )
}

function reachMeters(cards: Cards, id: PlayerId, parameters: SimulationParameters): number {
  const card = cards[id]
  const reachAdjustment = card.reachCm ? clamp(
    (card.reachCm - parameters.reachReferenceCm) / 100,
    ...parameters.reachAdjustmentRangeMeters,
  ) : 0
  return parameters.baseReachMeters + card.attributes.coverage / 100 * parameters.attributeReachMeters + reachAdjustment
}

function startDelay(court: CourtState, cards: Cards, id: PlayerId, toward: Point, parameters: SimulationParameters): number {
  const card = cards[id]
  const player = court.players[id]
  let delay = parameters.baseStartDelaySeconds
    - card.attributes.firstStep / 100 * parameters.firstStepDelayReductionSeconds
    - card.attributes.anticipation / 100 * parameters.anticipationDelayReductionSeconds
  if (player.readyState === 'recovering') delay += parameters.recoveryDelaySeconds
  if (id === court.hitterId) delay += parameters.recoveryDelaySeconds * (1 - card.attributes.attackContinuity / parameters.attackContinuityDelayDivisor)
  const desired = Math.atan2(toward.y - player.y, toward.x - player.x)
  if (player.movementDirection !== undefined && Math.cos(desired - player.movementDirection) < 0) {
    delay += parameters.directionChangeDelaySeconds
  }
  return Math.max(0, delay)
}

function movementBudget(
  court: CourtState, cards: Cards, id: PlayerId, toward: Point,
  seconds: number, parameters: SimulationParameters,
): number {
  const attr = cards[id].attributes
  const player = court.players[id]
  const speed = parameters.minimumPlayerSpeed
    + attr.movementSpeed / 100 * (parameters.maximumPlayerSpeed - parameters.minimumPlayerSpeed)
  const acceleration = parameters.minimumAcceleration
    + (attr.firstStep * parameters.firstStepAccelerationWeight + attr.movementSpeed * (1 - parameters.firstStepAccelerationWeight)) / 100
      * (parameters.maximumAcceleration - parameters.minimumAcceleration)
  const balanceFactor = player.balance === 'offBalance'
    ? parameters.offBalanceSpeedFactor
    : player.balance === 'stretched' ? parameters.stretchedSpeedFactor : 1
  const movingSeconds = Math.max(0, seconds - startDelay(court, cards, id, toward, parameters))
  const timeToSpeed = speed / acceleration
  const meters = movingSeconds <= timeToSpeed
    ? acceleration * movingSeconds * movingSeconds / 2
    : acceleration * timeToSpeed * timeToSpeed / 2 + speed * (movingSeconds - timeToSpeed)
  return meters * balanceFactor
}

function shotHeight(shot: ConfirmedShot, progress: number, parameters: SimulationParameters): number {
  const direct = shot.contactPoint.z * (1 - progress) + shot.target.z * progress
  const rise = parameters.trajectoryRiseMeters[shot.trajectory]
  return Math.max(0.05, direct + Math.sin(progress * Math.PI) * rise)
}

export function shuttlePointAt(shot: ConfirmedShot, progress: number, parameters: SimulationParameters): Point3 {
  return {
    x: shot.contactPoint.x + (shot.target.x - shot.contactPoint.x) * progress,
    y: shot.contactPoint.y + (shot.target.y - shot.contactPoint.y) * progress,
    z: shotHeight(shot, progress, parameters),
  }
}

function validate(
  court: CourtState, cards: Cards, context: RallyContext,
  shot: ConfirmedShot, lawVersion: LawVersion | null, parameters: SimulationParameters,
): PhysicalRuleValidity {
  const reasons: string[] = []
  const assumable: string[] = []
  let terminalReason: PhysicalRuleValidity['terminalReason'] = null
  const hitter = court.players[court.hitterId]
  if (!lawVersion) reasons.push('当前没有完成核验的生效竞赛规则版本。')
  if (!hitter || !cards[court.hitterId]) reasons.push('当前击球者资料不完整。')
  if (!Number.isFinite(shot.contactPoint.x) || !Number.isFinite(shot.contactPoint.y)
      || !Number.isFinite(shot.target.x) || !Number.isFinite(shot.target.y)
      || !Number.isFinite(shot.contactPoint.z) || !Number.isFinite(shot.target.z)) {
    reasons.push('接触点或落点无效。')
  }
  if (shot.contactPoint.x < 0 || shot.contactPoint.x > COURT_WIDTH
      || shot.contactPoint.y < 0 || shot.contactPoint.y > COURT_LENGTH
      || shot.contactPoint.z > 6) reasons.push('羽毛球接触点不在有效球场范围内。')
  if (distance(shot.contactPoint, court.shuttle) > parameters.contactToleranceMeters) {
    assumable.push('设定接触点与当前羽毛球位置不一致。')
  }
  if (hitter && distance(hitter, shot.contactPoint) > reachMeters(cards, court.hitterId, parameters)) {
    assumable.push('当前羽毛球距离该球员过远，无法在此位置完成击球。')
  }
  if (teamOf(court.hitterId) === 1 ? shot.contactPoint.y < NET_Y : shot.contactPoint.y > NET_Y) {
    reasons.push('接触点位于击球者的对方半场。')
  }
  if (shot.contactPoint.z <= 0) reasons.push('羽毛球已落地。')
  if (context.phase === 'serve' || isServe(shot.shotType)) {
    if (context.phase !== 'serve' || !isServe(shot.shotType)
        || context.serverId !== court.hitterId || context.servingTeam !== teamOf(court.hitterId)
        || context.servingScore === undefined) reasons.push('发球者、发球阶段或比分信息不完整。')
    if (lawVersion && shot.contactPoint.z >= lawVersion.serviceHeightLimitMeters) {
      reasons.push('发球击球高度达到或超过当前规则限制。')
    }
    if (hitter && context.servingScore !== undefined) {
      const right = context.servingScore % 2 === 0
      const serverRight = teamOf(court.hitterId) === 1 ? hitter.x > COURT_WIDTH / 2 : hitter.x < COURT_WIDTH / 2
      const validDepth = teamOf(court.hitterId) === 1
        ? hitter.y > NET_Y + SHORT_SERVICE_DISTANCE && hitter.y < COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE
        : hitter.y < NET_Y - SHORT_SERVICE_DISTANCE && hitter.y > DOUBLE_LONG_SERVICE_DISTANCE
      if (right !== serverRight || !validDepth) reasons.push('发球者不在与比分对应的有效发球区。')
      const targetLeft = teamOf(court.hitterId) === 1 ? right : !right
      const targetDepth = teamOf(court.hitterId) === 1
        ? shot.target.y > DOUBLE_LONG_SERVICE_DISTANCE && shot.target.y < NET_Y - SHORT_SERVICE_DISTANCE
        : shot.target.y < COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE && shot.target.y > NET_Y + SHORT_SERVICE_DISTANCE
      if (!targetDepth || (targetLeft ? shot.target.x >= COURT_WIDTH / 2 : shot.target.x <= COURT_WIDTH / 2)) {
        reasons.push('发球目标不在斜对角有效发球区。')
      }
      if (context.receiverId) {
        const receiver = court.players[context.receiverId]
        const receiverOnOtherTeam = teamOf(context.receiverId) !== teamOf(court.hitterId)
        const receiverDepth = receiver && (teamOf(context.receiverId) === 1
          ? receiver.y > NET_Y + SHORT_SERVICE_DISTANCE && receiver.y < COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE
          : receiver.y < NET_Y - SHORT_SERVICE_DISTANCE && receiver.y > DOUBLE_LONG_SERVICE_DISTANCE)
        const receiverAcross = receiver && (targetLeft
          ? receiver.x < COURT_WIDTH / 2 : receiver.x > COURT_WIDTH / 2)
        if (!receiverOnOtherTeam || !receiverDepth || !receiverAcross) {
          reasons.push('指定接发球员不在斜对角有效发球区。')
        }
      }
    }
  }
  if (shot.netCrossingHeight === undefined && lawVersion &&
      Math.max(shot.contactPoint.z, shot.target.z) + parameters.trajectoryRiseMeters[shot.trajectory]
        < lawVersion.netHeightAtCentreMeters) {
    terminalReason = 'net'
    reasons.push('按设定高度和轨迹，羽毛球明确无法越过球网。')
  }
  if (lawVersion && shot.netCrossingHeight !== undefined && shot.netCrossingHeight < lawVersion.netHeightAtCentreMeters) {
    terminalReason = 'net'
    reasons.push('用户设定的过网高度低于球网中央高度，按触网结束。')
  }
  if (!terminalReason && (shot.target.x < 0 || shot.target.x > COURT_WIDTH || shot.target.y < 0 || shot.target.y > COURT_LENGTH)) {
    terminalReason = 'out'
    reasons.push('目标落在双打球场界外。')
  }
  if (!terminalReason && (teamOf(court.hitterId) === 1 ? shot.target.y > NET_Y : shot.target.y < NET_Y)) {
    terminalReason = 'invalid'
    reasons.push('目标位于本方半场，未形成过网回球。')
  }
  if (shot.declaredEndReason) {
    terminalReason = shot.declaredEndReason
    reasons.push('按用户明确设定的回合结果结束。')
  }
  if (reasons.length || assumable.length && !shot.assumeContact) terminalReason = terminalReason ?? 'invalid'
  const status: PhysicalRuleValidity['status'] = reasons.length || assumable.length && !shot.assumeContact
    ? 'invalid' : assumable.length ? 'assumed' : 'valid'
  return {
    status,
    reasons: reasons.length || assumable.length ? [...reasons, ...assumable]
      : ['当前已提供的信息未显示明确的规则或接触障碍。'],
    terminalReason,
  }
}

function difficulty(
  court: CourtState, cards: Cards, shot: ConfirmedShot,
  validity: PhysicalRuleValidity, parameters: SimulationParameters,
): ExecutionDifficulty {
  const card = cards[court.hitterId]
  const attr = card.attributes
  let skill = (attr.consistency + attr.movementSpeed + attr.firstStep) / 3
  if (isAttack(shot.shotType)) skill = (skill + attr.smashPower + attr.rearCourtAttack + attr.attackContinuity) / 4
  else if (isFront(shot.shotType)) skill = (skill + attr.netPlay + attr.frontCourtInterception) / 3
  else if (shot.shotType === 'drive' || shot.shotType === 'push') skill = (skill + attr.drive + attr.counterAttack) / 3
  else if (isDefensive(shot.shotType)) skill = (skill + attr.defence + attr.backhand) / 3
  if (shot.contactSide === 'backhand') skill = (skill + attr.backhand) / 2
  const calibration = parameters.execution
  let load = distance(court.players[court.hitterId], shot.contactPoint) / reachMeters(cards, court.hitterId, parameters) * calibration.contactLoadWeight
  if (court.balance === 'offBalance') load += calibration.offBalanceLoad
  else if (court.balance === 'stretched') load += calibration.stretchedLoad
  if (court.contactTiming === 'late') load += calibration.lateLoad
  if (shot.extremeLine) load += calibration.extremeLineLoad
  if (shot.initiative === 'passive' && isAttack(shot.shotType)) load += calibration.passiveAttackLoad
  if (isAttack(shot.shotType) && shot.contactPoint.z < calibration.lowAttackHeight) load += calibration.lowAttackLoad
  const margin = skill - load
  const level: ExecutionDifficulty['level'] = validity.status === 'invalid' ? 'almostImpossible'
    : margin >= calibration.thresholds[0] ? 'easy' : margin >= calibration.thresholds[1] ? 'executable'
      : margin >= calibration.thresholds[2] ? 'difficult' : margin >= calibration.thresholds[3] ? 'extreme' : 'almostImpossible'
  const reasons = [
    '按当前球员的相关能力、接触距离和身体状态估算。',
    shot.contactSide === 'backhand' ? '本拍使用反手，反手能力参与评价。' : '本拍使用正手。',
  ]
  if (court.balance !== 'balanced') reasons.push('身体失衡增加完成高质量击球的难度。')
  if (shot.extremeLine) reasons.push('极限线路增加精度要求。')
  if (validity.status === 'assumed') reasons.push('接触点依赖用户的训练假设。')
  return { level, reasons, modelNotice: '教学用途的运动启发式估算，不是现实成功率。' }
}

function evidenceFor(shot: ShotType, lawVersion: LawVersion | null): string[] {
  if (isServe(shot)) return lawVersion ? [lawVersion.evidenceId, 'COACH_BWF_L1_2017_SERVE'] : []
  if (isAttack(shot) || shot === 'straightDrop' || shot === 'crossDrop') return ['COACH_BWF_L1_2017_ATTACK']
  if (isDefensive(shot) || shot === 'drive') return ['COACH_BWF_L1_2017_DEFENCE']
  if (shot === 'net' || shot === 'push') return ['COACH_BWF_L1_2017_SERVE']
  return []
}

function tactical(court: CourtState, cards: Cards, shot: ConfirmedShot, difficultyResult: ExecutionDifficulty, lawVersion: LawVersion | null, parameters: SimulationParameters): TacticalQuality {
  const evidenceIds = evidenceFor(shot.shotType, lawVersion)
  const calibration = parameters.tactical
  const partner = court.players[partnerOf(court.hitterId)]
  const targetNear = distance(partner, { x: shot.target.x, y: calibration.partnerFrontY[teamOf(court.hitterId) - 1] })
  const nearestOpponent = opponentIds(court.hitterId)
    .sort((a, b) => distance(court.players[a], shot.target) - distance(court.players[b], shot.target))[0]
  const opponent = court.players[nearestOpponent]
  const opponentCard = cards[nearestOpponent]
  let rank = calibration.baseRank
  if (isAttack(shot.shotType)) rank += (cards[court.hitterId].attributes.smashPower - calibration.skillBaseline) * calibration.smashPowerWeight
  if (shot.shotType === 'drive') rank += (cards[court.hitterId].attributes.drive - calibration.skillBaseline) * calibration.driveWeight
  if (isServe(shot.shotType)) rank += (cards[court.hitterId].attributes.serve - calibration.skillBaseline) * calibration.serveWeight
  if (isAttack(shot.shotType) && targetNear > calibration.partnerGapMeters) rank -= calibration.partnerGapPenalty
  if (shot.extremeLine) rank -= calibration.extremeLinePenalty
  if (difficultyResult.level === 'extreme' || difficultyResult.level === 'almostImpossible') rank -= calibration.difficultyPenalty
  const weakDefence = distance(opponent, shot.target) < calibration.weakDefenceRangeMeters
    && opponentCard.attributes.defence < calibration.weakAbilityThreshold
  if (weakDefence) rank += (calibration.weakAbilityThreshold - opponentCard.attributes.defence) * calibration.weakDefenceWeight
  const backhandSide = (teamOf(nearestOpponent) === 2) === (opponentCard.dominantHand === 'right')
    ? shot.target.x > opponent.x : shot.target.x < opponent.x
  const weakBackhand = distance(opponent, shot.target) < calibration.weakBackhandRangeMeters
    && Math.abs(shot.target.x - opponent.x) > calibration.backhandLateralThresholdMeters && backhandSide
    && opponentCard.attributes.backhand < calibration.weakAbilityThreshold
  if (weakBackhand) rank += (calibration.weakAbilityThreshold - opponentCard.attributes.backhand) * calibration.weakBackhandWeight
  const level: TacticalQuality['level'] = !evidenceIds.length ? 'insufficientEvidence'
    : rank >= calibration.recommendedThreshold ? 'recommended' : rank >= calibration.viableThreshold ? 'viable' : 'highRisk'
  const reasons = [
    '评价以当前落点、搭档覆盖和下一拍风险为条件，不代表得分概率。',
    targetNear > calibration.partnerGapMeters && isAttack(shot.shotType)
      ? '搭档离预期前场覆盖区较远，可能无法及时封网。'
      : '搭档位置与本拍球路共同影响后续覆盖。',
  ]
  if (shot.extremeLine) reasons.push('极限线路增加失误与恢复风险。')
  if (weakDefence) reasons.push(`对方球员 ${nearestOpponent} 的防守能力设置较低，会影响该球路排序。`)
  if (weakBackhand) reasons.push(`对方球员 ${nearestOpponent} 的反手能力设置较低，会影响该球路排序。`)
  if (!evidenceIds.length) reasons.push('当前缺少足够直接的战术依据，暂不提供推荐等级。')
  return { level, reasons, evidenceIds, internalRank: clamp(Math.round(rank), 0, 100) }
}

function receiverOptions(
  court: CourtState, cards: Cards, seconds: number,
  trajectory: Point3[], constraints: MovementConstraints, parameters: SimulationParameters,
): ReceiverCandidate[] {
  const options: ReceiverCandidate[] = []
  for (const id of opponentIds(court.hitterId)) {
    let best: ReceiverCandidate | null = null
    let bestMargin = -Infinity
    for (let sample = parameters.receiverSamples.first; sample <= parameters.receiverSamples.last; sample++) {
      const progress = sample / parameters.receiverSamples.divisions
      const contact = trajectory[sample]
      if (teamOf(id) === 1 ? contact.y <= NET_Y : contact.y >= NET_Y) continue
      if (contact.z < parameters.receiverSamples.minimumHeight || contact.z > parameters.receiverSamples.maximumHeight) continue
      const from = toPoint(court.players[id] as Point3)
      const constraint = constraints[id]
      const target = constraint.kind === 'hold' ? from
        : constraint.kind === 'manualTarget' ? halfPoint(id, constraint.target) : toPoint(contact)
      const travel = constraint.kind === 'hold' ? 0
        : movementBudget(court, cards, id, target, seconds * progress, parameters)
      const targetDistance = distance(from, target)
      const ratio = targetDistance ? Math.min(1, travel / targetDistance) : 1
      const actual = {
        x: from.x + (target.x - from.x) * ratio,
        y: from.y + (target.y - from.y) * ratio,
      }
      const margin = reachMeters(cards, id, parameters) - distance(actual, contact)
      if (margin >= 0 && margin > bestMargin) {
        bestMargin = margin
        best = {
          playerId: id, contactPoint: contact, contactTimeSeconds: seconds * progress,
          assumed: false, explanation: '按当前能力和教学移动模型估算，该球员可在此处接触羽毛球。',
        }
      }
    }
    if (best) options.push(best)
  }
  return options
}

function idealTargets(court: CourtState, shot: ConfirmedShot, receiver: ReceiverCandidate | null, parameters: SimulationParameters): Record<PlayerId, Point> {
  const hitterId = court.hitterId
  const hitterTeam = teamOf(hitterId)
  const hitter = court.players[hitterId]
  const partnerId = partnerOf(hitterId)
  const attacking = isAttack(shot.shotType) || isServe(shot.shotType)
  const side = hitterTeam - 1
  const rearY = parameters.positioning.hitterRearY[side]
  const frontY = parameters.positioning.hitterFrontY[side]
  const defensiveY = parameters.positioning.hitterDefenceY[side]
  const result = {} as Record<PlayerId, Point>
  result[hitterId] = isDefensive(shot.shotType)
    ? { x: hitter.x < COURT_WIDTH / 2 ? parameters.positioning.defenceLeftX : parameters.positioning.defenceRightX, y: defensiveY }
    : isFront(shot.shotType) && !isAttack(shot.shotType)
      ? { x: clamp(hitter.x, 0.6, 5.5), y: frontY }
      : { x: clamp(hitter.x * parameters.positioning.hitterLateralWeights[0]
        + COURT_WIDTH / 2 * parameters.positioning.hitterLateralWeights[1]
        + shot.target.x * parameters.positioning.hitterLateralWeights[2], 0.5, 5.6), y: attacking ? rearY : defensiveY }
  result[partnerId] = isDefensive(shot.shotType)
    ? { x: result[hitterId].x < COURT_WIDTH / 2 ? parameters.positioning.defenceRightX : parameters.positioning.defenceLeftX, y: defensiveY }
    : { x: clamp(shot.target.x * parameters.positioning.partnerTargetWeight
      + COURT_WIDTH / 2 * (1 - parameters.positioning.partnerTargetWeight), 0.6, 5.5), y: attacking || isFront(shot.shotType) ? frontY : rearY }
  if (receiver) {
    const id = receiver.playerId
    const other = partnerOf(id)
    const theirFrontY = parameters.positioning.receiverFrontY[1 - side]
    const theirRearY = parameters.positioning.receiverRearY[1 - side]
    result[id] = toPoint(receiver.contactPoint)
    result[other] = {
      x: clamp(receiver.contactPoint.x < COURT_WIDTH / 2 ? parameters.positioning.receiverCoverRightX : parameters.positioning.receiverCoverLeftX, 0.5, 5.6),
      y: isAttack(shot.shotType) ? theirRearY : theirFrontY,
    }
  } else {
    for (const id of opponentIds(hitterId)) {
      const player = court.players[id]
      result[id] = { x: clamp((player.x + shot.target.x) / 2, 0.4, 5.7), y: clamp((player.y + shot.target.y) / 2, 0.4, 13) }
    }
  }
  for (const id of PLAYER_IDS) result[id] = halfPoint(id, result[id] ?? court.players[id])
  return result
}

function formation(team: TeamId, positions: Record<PlayerId, Point>, context: RallyContext, shot: ConfirmedShot, hitterTeam: TeamId, parameters: SimulationParameters): FormationState {
  const ids = team === 1 ? ['A', 'B'] as const : ['C', 'D'] as const
  const a = positions[ids[0]]
  const b = positions[ids[1]]
  if (distance(a, b) < parameters.formation.overlapMeters) return 'broken'
  if (context.phase === 'serve') return team === context.servingTeam ? 'serve' : 'receive'
  if (Math.abs(a.y - b.y) > parameters.formation.frontBackSeparationMeters) return 'frontBackAttack'
  if (Math.abs(a.x - b.x) > parameters.formation.sideSeparationMeters && Math.abs(a.y - b.y) < parameters.formation.frontBackSeparationMeters) {
    return shot.shotType === 'drive' ? 'flatExchange' : 'sideBySideDefence'
  }
  if (isAttack(shot.shotType) && team !== hitterTeam) return 'transitionDefence'
  if (isDefensive(shot.shotType)) return 'transitionDefence'
  return 'neutral'
}

function rolesFor(
  court: CourtState, context: RallyContext, receiver: ReceiverCandidate | null,
  formations: Record<TeamId, FormationState>, positions: Record<PlayerId, Point>,
): Record<PlayerId, TacticalRole> {
  const roles = {} as Record<PlayerId, TacticalRole>
  for (const id of PLAYER_IDS) {
    const state = formations[teamOf(id)]
    if (context.phase === 'serve' && id === court.hitterId) roles[id] = 'server'
    else if (context.phase === 'serve' && teamOf(id) === teamOf(court.hitterId)) roles[id] = 'servePartner'
    else if (context.phase === 'serve' && receiver?.playerId === id) roles[id] = 'receiver'
    else if (context.phase === 'serve' && receiver && id === partnerOf(receiver.playerId)) roles[id] = 'receiverPartner'
    else if (state === 'frontBackAttack') {
      const partner = positions[partnerOf(id)]
      roles[id] = Math.abs(positions[id].y - NET_Y) < Math.abs(partner.y - NET_Y) ? 'frontInterceptor' : 'rearAttacker'
    } else if (state === 'sideBySideDefence' || state === 'flatExchange') {
      roles[id] = positions[id].x < positions[partnerOf(id)].x ? 'leftDefender' : 'rightDefender'
    } else if (receiver?.playerId === id) roles[id] = 'receiver'
    else if (id === court.hitterId) roles[id] = 'rearCoverage'
    else roles[id] = 'transitioning'
  }
  return roles
}

function coverageFor(
  cards: Cards, movements: Record<PlayerId, PlayerMovementPlan>,
  parameters: SimulationParameters,
): Record<PlayerId, CoverageZone> {
  const zones = {} as Record<PlayerId, CoverageZone>
  for (const id of PLAYER_IDS) {
    zones[id] = {
      center: movements[id].actual,
      radiusMeters: reachMeters(cards, id, parameters)
        + cards[id].attributes.anticipation / 100 * parameters.coverage.anticipationBonusMeters
        - (movements[id].arrival === 'partial' ? parameters.coverage.partialArrivalPenaltyMeters : 0),
    }
  }
  return zones
}

function partnership(
  team: TeamId, movements: Record<PlayerId, PlayerMovementPlan>,
  coverage: Record<PlayerId, CoverageZone>, formations: Record<TeamId, FormationState>,
  parameters: SimulationParameters,
): PartnershipAnalysis {
  const ids = team === 1 ? ['A', 'B'] as const : ['C', 'D'] as const
  const a = movements[ids[0]]
  const b = movements[ids[1]]
  const apart = distance(a.actual, b.actual)
  const combined = coverage[ids[0]].radiusMeters + coverage[ids[1]].radiusMeters
  const frontY = parameters.partnership.frontY[team - 1]
  const rearY = parameters.partnership.rearY[team - 1]
  const noFront = Math.abs(a.actual.y - frontY) > parameters.partnership.frontVacancyMeters && Math.abs(b.actual.y - frontY) > parameters.partnership.frontVacancyMeters
  const noRear = Math.abs(a.actual.y - rearY) > parameters.partnership.rearVacancyMeters && Math.abs(b.actual.y - rearY) > parameters.partnership.rearVacancyMeters
  const reasons: string[] = []
  let status: PartnershipAnalysis['status'] = 'good'
  if (apart < combined * parameters.partnership.overlapFactor) {
    status = 'overlap'
    reasons.push('两人实际覆盖范围明显重叠，另一侧可能留下空当。')
  } else if (noFront || noRear) {
    status = 'openSpace'
    reasons.push(noFront ? '两人都没有及时靠近中前场，网前可能无人封锁。' : '两人都离后场较远，后场出现保护空当。')
  } else if (a.arrival === 'partial' || b.arrival === 'partial') {
    status = 'lateRotation'
    reasons.push('至少一人按当前能力和飞行时间尚未到达理想补位位置。')
  } else {
    reasons.push('两人到达了不同的主要覆盖区域，仍须观察对手实际回球。')
  }
  reasons.push('T2 阵型：' + FORMATION_LABELS[formations[team]] + '；判断来自实际位置。')
  return { team, status, reasons }
}

function makeOutcome(
  court: CourtState, cards: Cards, context: RallyContext, shot: ConfirmedShot,
  seconds: number, receiver: ReceiverCandidate | null, endReason: ShotOutcome['endReason'],
  constraints: MovementConstraints, parameters: SimulationParameters, terminalProgress = 1,
): ShotOutcome {
  const aborted = endReason === 'invalid'
  const movementSeconds = aborted ? 0 : receiver?.contactTimeSeconds ?? seconds * terminalProgress
  const ideals = idealTargets(court, shot, receiver, parameters)
  const movements = {} as Record<PlayerId, PlayerMovementPlan>
  const actualPositions = {} as Record<PlayerId, Point>
  for (const id of PLAYER_IDS) {
    const from = toPoint(court.players[id] as Point3)
    const constraint = constraints[id] ?? { kind: 'auto' }
    const ideal = aborted || constraint.kind === 'hold' ? from
      : constraint.kind === 'manualTarget' ? halfPoint(id, constraint.target) : ideals[id]
    const budget = aborted ? 0 : movementBudget(court, cards, id, ideal, movementSeconds, parameters)
    const length = distance(from, ideal)
    const ratio = length ? Math.min(1, budget / length) : 1
    const actual = constraint.kind === 'hold' ? from : halfPoint(id, {
      x: from.x + (ideal.x - from.x) * ratio,
      y: from.y + (ideal.y - from.y) * ratio,
    })
    actualPositions[id] = actual
    movements[id] = {
      from, ideal, actual, path: [from, actual], role: 'transitioning', responsibility: '',
      explanation: '', constraint: constraint.kind,
      arrival: constraint.kind === 'hold' && !aborted ? 'held' : ratio >= 0.999 ? 'arrived' : 'partial',
    }
  }
  const coverage = coverageFor(cards, movements, parameters)
  const formations: Record<TeamId, FormationState> = {
    1: formation(1, actualPositions, context, shot, teamOf(court.hitterId), parameters),
    2: formation(2, actualPositions, context, shot, teamOf(court.hitterId), parameters),
  }
  const roles = rolesFor(court, context, receiver, formations, actualPositions)
  for (const id of PLAYER_IDS) {
    const plan = movements[id]
    plan.role = roles[id]
    plan.responsibility = aborted ? '回合停止'
      : id === court.hitterId ? '击球后恢复并准备下一拍'
      : id === partnerOf(court.hitterId) ? '补住击球者留下的区域'
        : id === receiver?.playerId ? '处理本拍来球' : '保护接球搭档身后的空间'
    plan.explanation = aborted ? '本拍因规则或接触障碍无效，没有按成功回球计算跑位。'
      : constraintExplanation(id, court, shot, plan)
  }
  const partnerships: Record<TeamId, PartnershipAnalysis> = {
    1: partnership(1, movements, coverage, formations, parameters),
    2: partnership(2, movements, coverage, formations, parameters),
  }
  const players = copy(court.players)
  if (!aborted) {
    for (const id of PLAYER_IDS) {
      const plan = movements[id]
      const direction = Math.atan2(plan.actual.y - plan.from.y, plan.actual.x - plan.from.x)
      players[id] = {
        ...players[id], ...plan.actual,
        movementDirection: distance(plan.from, plan.actual) < 0.001 ? players[id].movementDirection : direction,
        movementSpeed: distance(plan.from, plan.actual) / Math.max(movementSeconds, 0.01),
        readyState: plan.arrival === 'partial' ? 'recovering' : 'ready',
        balance: plan.arrival === 'partial' ? 'stretched' : 'balanced',
      }
    }
  }
  const nextHitter = receiver?.playerId ?? court.hitterId
  const nextShuttle = aborted ? court.shuttle
    : receiver?.contactPoint ?? (endReason === 'net'
      ? shuttlePointAt(shot, terminalProgress, parameters) : { ...shot.target, z: 0 })
  const nextCourt: CourtState = {
    ...copy(court), players,
    shuttle: aborted ? copy(court.shuttle) : {
      ...court.shuttle, ...nextShuttle, speed: shot.speed, trajectory: shot.trajectory,
      incomingShotType: shot.shotType, shuttleSide: teamOf(nextHitter),
      expectedContactPoint: receiver?.contactPoint,
    },
    hitterId: nextHitter,
    contactTiming: 'normal', contactSide: 'forehand',
    balance: aborted ? court.balance : players[nextHitter].balance ?? 'balanced',
  }
  const nextContext: RallyContext = {
    ...context, shotIndex: context.shotIndex + 1,
    phase: context.phase === 'serve' ? 'return' : context.phase === 'return' ? 'third' : 'rally',
    initiative: isAttack(shot.shotType) ? 'defence' : isDefensive(shot.shotType) ? 'attack' : 'transition',
    exchange: shot.shotType === 'drive' ? 'flat' : isFront(shot.shotType) ? 'net' : 'general',
  }
  return { receiver, terminalProgress: receiver ? receiver.contactTimeSeconds / seconds : terminalProgress,
    movements, coverage, formations, roles, partnerships, endReason, nextCourt, nextContext }
}

function constraintExplanation(id: PlayerId, court: CourtState, shot: ConfirmedShot, plan: PlayerMovementPlan): string {
  if (plan.constraint === 'hold') return '你选择保持原位；实际位置和由此形成的空当会延续到下一拍。'
  const who = id === court.hitterId ? '击球者' : id === partnerOf(court.hitterId) ? '击球者搭档' : '接球方球员'
  const arrival = plan.arrival === 'partial'
    ? '按当前能力和飞行时间，只能部分到位。' : '按当前能力设置，可以到达目标区域。'
  return who + '针对“' + SHOT_LABELS[shot.shotType] + '”的球路承担' + plan.responsibility + '；' + arrival
}

export function evaluateConfirmedShot(input: {
  court: CourtState
  cards: Cards
  context: RallyContext
  shot: ConfirmedShot
  lawVersion: LawVersion | null
  parameters: SimulationParameters
  evidenceDatasetVersion: string
  movementConstraints?: Partial<MovementConstraints>
}): ShotEvaluation {
  const { court, cards, context, shot, lawVersion, parameters, evidenceDatasetVersion } = input
  const constraints = Object.fromEntries(PLAYER_IDS.map((id) => [id, input.movementConstraints?.[id] ?? { kind: 'auto' }])) as MovementConstraints
  const validity = validate(court, cards, context, shot, lawVersion, parameters)
  const executionDifficulty = difficulty(court, cards, shot, validity, parameters)
  const tacticalQuality = tactical(court, cards, shot, executionDifficulty, lawVersion, parameters)
  const seconds = flightSeconds(shot, parameters)
  const shuttleTrajectory = Array.from({ length: parameters.receiverSamples.divisions + 1 }, (_, index) =>
    shuttlePointAt(shot, index / parameters.receiverSamples.divisions, parameters))
  const origin = {
    playerPosition: toPoint(court.players[court.hitterId] as Point3),
    shuttlePosition: { x: court.shuttle.x, y: court.shuttle.y, z: court.shuttle.z },
    expectedContactPoint: shot.contactPoint,
    shotOrigin: shot.contactPoint,
  }
  const terminal = validity.terminalReason
  const candidates = terminal ? [] : receiverOptions(court, cards, seconds, shuttleTrajectory, constraints, parameters)
  const receiverCandidates = candidates.map((receiver) =>
    makeOutcome(court, cards, context, shot, seconds, receiver, null, constraints, parameters))
  const assumedReceiverOptions = !terminal && !candidates.length
    ? opponentIds(court.hitterId).map((id) => makeOutcome(
      court, cards, context, shot, seconds,
      { playerId: id, contactPoint: shuttlePointAt(shot, parameters.receiverSamples.assumedProgress, parameters),
        contactTimeSeconds: seconds * parameters.receiverSamples.assumedProgress,
        assumed: true, explanation: '用户设定的假设接球；引擎判断该球员未能及时到达。' },
      null, constraints, parameters,
    )) : []
  const netProgress = shot.target.y === shot.contactPoint.y ? 1
    : clamp((NET_Y - shot.contactPoint.y) / (shot.target.y - shot.contactPoint.y), 0, 1)
  const defaultOutcome = terminal
    ? makeOutcome(court, cards, context, shot, seconds, null, terminal, constraints, parameters,
      terminal === 'invalid' ? 0 : terminal === 'net' ? netProgress : 1)
    : receiverCandidates.length === 1 ? receiverCandidates[0]
      : makeOutcome(court, cards, context, shot, seconds, null, 'ground', constraints, parameters)
  return {
    origin, confirmedShot: copy(shot), physicalRuleValidity: validity, executionDifficulty,
    tacticalQuality, flightSeconds: seconds,
    shuttleTrajectory,
    lawVersion, engineVersion: ENGINE_VERSION,
    simulationParametersVersion: parameters.version, evidenceDatasetVersion,
    receiverCandidates, assumedReceiverOptions, defaultOutcome,
  }
}

export function confirmDraft(draft: ShotDraft, shotType: ShotType): ConfirmedShot {
  return { ...copy(draft), shotType }
}
