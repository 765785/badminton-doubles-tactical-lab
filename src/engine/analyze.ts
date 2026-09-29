import {
  COURT_LENGTH, COURT_WIDTH, DOUBLE_LONG_SERVICE_DISTANCE, NET_Y, PLAYER_IDS,
  SHORT_SERVICE_DISTANCE, distance, opponentIds, partnerOf, teamOf,
  type AnalysisIssue, type AnalysisResult, type ChainStep, type CourtState,
  type Movement, type PlayerCard, type PlayerId, type Point3, type RallyContext,
  type ResponseOption, type ShotType, type TacticalRecommendation,
  type RecommendationLevel, competitionFormat,
} from '../domain/model'
import { activeLawVersion } from '../knowledge/laws'

type Cards = Record<PlayerId, PlayerCard>
type Candidate = Omit<TacticalRecommendation, 'level' | 'tacticalScore' | 'hitterMovement' | 'partnerMovement' | 'expectedOpponentResponses'> & { base: number }

const limit = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const ownFrontY = (id: PlayerId) => teamOf(id) === 1 ? 7.8 : 5.6
const ownRearY = (id: PlayerId) => teamOf(id) === 1 ? 10.7 : 2.7
const otherFrontY = (id: PlayerId) => teamOf(id) === 1 ? 5.7 : 7.7
const otherMidY = (id: PlayerId) => teamOf(id) === 1 ? 3.2 : 10.2
const otherRearY = (id: PlayerId) => teamOf(id) === 1 ? 1.2 : 12.2
const p3 = (x: number, y: number, z: number): Point3 => ({ x: limit(x, .2, 5.9), y, z })
const coachEvidence = (cards: Cards) => {
  return competitionFormat(cards) === 'mixed' ? 'COACH_BWF_L1_2017_MIXED' : 'COACH_BWF_L1_2017_ATTACK'
}

export function validateCourt(court: CourtState, cards: Cards, context: RallyContext, asOf = new Date()): AnalysisIssue[] {
  const issues: AnalysisIssue[] = []
  if (!activeLawVersion(asOf)) issues.push({ code: 'law-version', message: '当前没有完成核验的生效竞赛规则版本。', action: '请等待规则资料更新后再分析。' })
  for (const id of PLAYER_IDS) {
    const player = court.players[id]
    if (!cards[id] || !player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
      issues.push({ code: `player-${id}`, message: `球员 ${id} 的资料或位置不完整。`, action: '请补全四名球员和位置。' })
      continue
    }
    const correctHalf = teamOf(id) === 1 ? player.y > NET_Y : player.y < NET_Y
    if (player.x < 0 || player.x > COURT_WIDTH || player.y < 0 || player.y > COURT_LENGTH || !correctHalf) {
      issues.push({ code: `half-${id}`, message: `球员 ${id} 不在本方半场内。`, action: '将球员拖回对应半场。' })
    }
  }
  const { shuttle, hitterId } = court
  if (!Number.isFinite(shuttle.x) || !Number.isFinite(shuttle.y) || !Number.isFinite(shuttle.z) || shuttle.x < 0 || shuttle.x > COURT_WIDTH || shuttle.y < 0 || shuttle.y > COURT_LENGTH || shuttle.z <= 0 || shuttle.z > 6) {
    issues.push({ code: 'shuttle', message: '羽毛球位置或高度无效。', action: '将球移动到场内，并设置合理高度。' })
  }
  if (shuttle.y !== NET_Y && (teamOf(hitterId) === 1 ? shuttle.y < NET_Y : shuttle.y > NET_Y)) {
    issues.push({ code: 'wrong-side', message: '羽毛球与当前击球者分处球网两侧。', action: '调整球的位置或重新指定击球者。' })
  }
  const hitter = court.players[hitterId]
  if (hitter && Number.isFinite(shuttle.x) && Number.isFinite(shuttle.y) && distance(hitter, shuttle) > 2.4) {
    issues.push({ code: 'unreachable', message: '当前击球者离预计击球点过远。', action: '把击球者或球移近后再分析。' })
  }
  if (context.shotIndex >= 4) issues.push({ code: 'chain-end', message: '教学链已达到四拍。', action: '重置教学链或另建局面。' })
  if (context.phase === 'serve') {
    if (context.serverId !== hitterId || context.servingTeam !== teamOf(hitterId) || context.servingScore === undefined || !Number.isInteger(context.servingScore) || context.servingScore < 0) {
      issues.push({ code: 'serve-context', message: '发球者或发球比分信息不完整。', action: '指定发球者、发球方与非负整数比分。' })
    } else if (hitter) {
      const rightCourt = context.servingScore % 2 === 0
      const serverRightOnScreen = teamOf(hitterId) === 1 ? hitter.x > COURT_WIDTH / 2 : hitter.x < COURT_WIDTH / 2
      const behindShortLine = teamOf(hitterId) === 1 ? hitter.y > NET_Y + SHORT_SERVICE_DISTANCE : hitter.y < NET_Y - SHORT_SERVICE_DISTANCE
      const withinServiceDepth = teamOf(hitterId) === 1 ? hitter.y < COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE : hitter.y > DOUBLE_LONG_SERVICE_DISTANCE
      if (rightCourt !== serverRightOnScreen || !behindShortLine || !withinServiceDepth || hitter.x <= 0 || hitter.x >= COURT_WIDTH || hitter.x === COURT_WIDTH / 2) issues.push({ code: 'serve-court', message: '发球者站位与当前比分对应的发球区不符。', action: '偶数分从右发球区、奇数分从左发球区发球，并站在有效发球区内、不触及界线。' })
      if (context.receiverId && court.players[context.receiverId]) {
        const receiver = court.players[context.receiverId]
        const receiverDepth = teamOf(context.receiverId) === 1 ? receiver.y > NET_Y + SHORT_SERVICE_DISTANCE && receiver.y < COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE : receiver.y < NET_Y - SHORT_SERVICE_DISTANCE && receiver.y > DOUBLE_LONG_SERVICE_DISTANCE
        const diagonal = teamOf(context.receiverId) !== teamOf(hitterId) && receiverDepth && receiver.x > 0 && receiver.x < COURT_WIDTH && receiver.x !== COURT_WIDTH / 2 && (rightCourt ? (teamOf(hitterId) === 1 ? receiver.x < COURT_WIDTH / 2 : receiver.x > COURT_WIDTH / 2) : (teamOf(hitterId) === 1 ? receiver.x > COURT_WIDTH / 2 : receiver.x < COURT_WIDTH / 2))
        if (!diagonal) issues.push({ code: 'receiver-court', message: '接发球员不在斜对角发球区。', action: '调整接发球员站位。' })
      }
    }
    if (shuttle.z >= 1.15) issues.push({ code: 'serve-height', message: '发球接触高度达到或超过规则限制。', action: '将球的击球高度调低至 1.15 米以下。' })
  }
  return issues
}

export function classifySituation(court: CourtState, context: RallyContext): RallyContext['initiative'] {
  if (context.phase === 'serve') return 'neutral'
  if (context.phase === 'return') return 'transition'
  if (court.shuttle.incomingShotType === 'middleSmash' || court.shuttle.incomingShotType === 'straightSmash') return 'defence'
  if (context.exchange === 'net') return 'transition'
  if (court.shuttle.trajectory === 'downward' && court.shuttle.speed === 'fast') return 'defence'
  if (court.shuttle.z >= 2 && court.balance !== 'offBalance') return 'attack'
  return context.initiative === 'attack' ? 'neutral' : context.initiative
}

function validServiceTarget(target: Point3, hitterId: PlayerId, servingScore: number): boolean {
  const intoTop = teamOf(hitterId) === 1
  const yValid = intoTop ? target.y >= DOUBLE_LONG_SERVICE_DISTANCE && target.y <= NET_Y - SHORT_SERVICE_DISTANCE : target.y >= NET_Y + SHORT_SERVICE_DISTANCE && target.y <= COURT_LENGTH - DOUBLE_LONG_SERVICE_DISTANCE
  const rightCourt = servingScore % 2 === 0
  const targetLeftOnScreen = intoTop ? rightCourt : !rightCourt
  return yValid && (targetLeftOnScreen ? target.x < COURT_WIDTH / 2 : target.x > COURT_WIDTH / 2)
}

function candidate(id: string, shotType: ShotType, title: string, target: Point3, targetZone: string, base: number, simple: string, advanced: string, risks: string[], conditions: string[], evidenceIds: string[]): Candidate {
  return { id, shotType, title, target, targetZone, base, explanation: { simple, advanced }, risks, conditions, evidenceIds }
}

function generateCandidates(court: CourtState, cards: Cards, context: RallyContext, situation: RallyContext['initiative']): Candidate[] {
  const id = court.hitterId
  const x = court.shuttle.x
  const opp = opponentIds(id)
  const opponents = opp.map((playerId) => court.players[playerId])
  const middleX = (opponents[0].x + opponents[1].x) / 2
  const nearOpponent = opponents[0].x < opponents[1].x ? opp[0] : opp[1]
  const straightX = limit(x, .55, 5.55)
  const crossX = limit(COURT_WIDTH - x, .55, 5.55)
  const mixedEvidence = coachEvidence(cards)
  if (context.phase === 'serve') {
    const targetSideX = teamOf(id) === 1 ? (context.servingScore ?? 0) % 2 === 0 ? 2.85 : 3.25 : (context.servingScore ?? 0) % 2 === 0 ? 3.25 : 2.85
    const receiver = context.receiverId ? court.players[context.receiverId] : court.players[nearOpponent]
    const serveY = teamOf(id) === 1 ? 4.55 : 8.85
    const rearY = teamOf(id) === 1 ? 1.2 : 12.2
    return [
      candidate('serve-t', 'lowServe', '低发球到中线', p3(targetSideX, serveY, .1), '斜对角发球区中线附近', 68, '球落在中线附近，可以减少接发球的大角度选择；发球后准备封网。', '低发球压缩接发角度，搭档应准备中后场的推球或挑球。', ['发球质量不足时，接发者可能抢到高点。'], ['发球点与落点均在有效发球区。'], ['LAW_BWF_2025_01', 'COACH_BWF_L1_2017_SERVE']),
      candidate('serve-body', 'lowServe', '低发球到身体', p3(limit(receiver.x, .5, 5.6), serveY - (teamOf(id) === 1 ? .15 : -.15), .1), '接发者身体附近', 59, '把球送到接发者身体附近，可能打乱其习惯的接发动作。', '身体线低发球是教学中的位置变化；需要发球者与搭档准备后续覆盖。', ['落点过高会给对方直接攻击机会。'], ['必须落在斜对角发球区。'], ['LAW_BWF_2025_01', 'COACH_BWF_L1_2017_SERVE']),
      candidate('serve-flick', 'flickServe', '偷后场发球', p3(receiver.x, rearY, .1), '接发者身后', 53, '偶尔把球发到后场，可让准备前扑的接发者后退。', '偷后场是变化选择；若对方平衡良好，可能直接下压。', ['对方抢到高点时，我方容易转入防守。'], ['作为变化球使用，不代替稳定低发球。'], ['LAW_BWF_2025_01', 'COACH_BWF_L1_2017_SERVE']),
      candidate('serve-wide', 'lowServe', '低发球到外侧', p3(targetSideX < 3.05 ? .65 : 5.45, serveY, .1), '斜对角外侧', 44, '外侧落点可以改变接发方向，但必须提前准备直线回球。', '宽发球增加自身暴露空间，需评估搭档覆盖。', ['直线回球可能直接打到空当。'], ['发球者和搭档能够覆盖直线回球。'], ['LAW_BWF_2025_01', 'COACH_BWF_L1_2017_SERVE']),
    ].filter((item) => validServiceTarget(item.target, id, context.servingScore ?? 0))
  }
  if (context.phase === 'return') {
    return [
      candidate('return-net', 'net', '接发放网', p3(straightX, otherFrontY(id), .12), '对方网前', 67, '接发后向前跟进，争取下一拍先碰到网前球。', '网前回球需要接发者立即跟进，搭档覆盖中后场。', ['球若过高，发球者可能扑球。'], ['接发点足够靠前且身体平衡。'], ['COACH_BWF_L1_2017_SERVE', mixedEvidence]),
      candidate('return-push', 'push', '接发推向中后场', p3(straightX, otherMidY(id), .5), '对方中后场', 63, '把球推过发球者，让对方后场球员移动，同时准备拦截直线回球。', '直线推球后，接发者应预判同一通道的下一拍。', ['推球太慢会被中场截击。'], ['接触点前、球路能越过发球者。'], ['COACH_BWF_L1_2017_SERVE']),
      candidate('return-drive', 'drive', '接发平抽身体', p3(court.players[nearOpponent].x, otherMidY(id) + (teamOf(id) === 1 ? .7 : -.7), .9), '发球方搭档身体附近', 56, '快速平抽身体附近，争取让对方只能被动挡回。', '攻击发球搭档身体后，自己要准备覆盖两侧的平抽回球。', ['速度不足时会变成对手的进攻机会。'], ['球的高度允许平抽且双方有覆盖。'], ['COACH_BWF_L1_2017_SERVE']),
    ]
  }
  if (situation === 'attack') {
    const attack = [
      candidate('attack-middle', 'middleSmash', '杀中路', p3(middleX, otherMidY(id), .12), '两名对手之间', 71, '对方分开防守时，中路让两人需要判断由谁接球；搭档可准备封网。', '中路进攻通常缩小部分回球角度，但取决于击球质量和前场覆盖。', ['杀球质量不足可能进入平抽挡。'], ['高点击球、身体平衡、前场搭档可跟进。'], [mixedEvidence]),
      candidate('attack-straight', 'straightSmash', '直线杀球', p3(straightX, otherMidY(id), .12), '同侧防守区域', 66, '直线球路较短，前场搭档容易预判同侧挡网。', '直线进攻要确保前场覆盖同一通道，后场者保持下一拍恢复。', ['对手直线挡网时，搭档若离得太远会失去主动。'], ['高点击球且有同侧覆盖。'], [mixedEvidence]),
      candidate('attack-drop', 'straightDrop', '直线吊球', p3(straightX, otherFrontY(id), .1), '同侧网前', 58, '用吊球让对手从防守位置向前移动，搭档准备网前接续。', '吊球与杀球形成节奏变化，前场球员需前压防止对手回放。', ['吊球太高会被对方网前反扑。'], ['需要可控制的接触点。'], [mixedEvidence]),
      candidate('attack-cross', 'crossDrop', '对角吊球', p3(crossX, otherFrontY(id), .1), '对角网前', 50, '对角球可以改变防守方向，但搭档要先确认能覆盖可能的直线反击。', '对角线路增加自身恢复距离，通常只作为有条件的变化。', ['对角球路较长，可能暴露直线空当。'], ['身体平衡、搭档能覆盖直线回球。'], [mixedEvidence]),
    ]
    if (court.balance === 'offBalance' || court.contactTiming === 'late') return attack.filter((item) => item.shotType === 'straightDrop')
    if (court.shuttle.z < 1.8) return attack.filter((item) => item.shotType === 'straightDrop')
    return attack
  }
  if (situation === 'defence') {
    const defence = [
      candidate('defence-block', 'block', '接杀挡网', p3(straightX, otherFrontY(id), .1), '对方网前', 63, '如果能控制球，挡网可让对手从后场向前移动，我方争取反击。', '挡网之后击球者可跟进网前，搭档补住中后场。', ['挡网太高会被对方前场球员扑杀。'], ['能在身体前方控制来球。'], ['COACH_BWF_L1_2017_DEFENCE']),
      candidate('defence-drive', 'drive', '平抽挡反击', p3(straightX, otherMidY(id), .9), '对方中场', 58, '快速平抽可以争夺主动，但要让搭档准备下一拍。', '平抽进入快节奏交换，双方仍需覆盖直线及中路。', ['平抽质量不足可能被对方再下压。'], ['来球高度与身体平衡允许主动发力。'], ['COACH_BWF_L1_2017_DEFENCE']),
      candidate('defence-lift', 'lift', '起高球争取恢复', p3(crossX, otherRearY(id), 1.1), '对方后场', 48, '暂时无法反击时，把球送到后场，为两人重新站稳争取时间。', '高远球通常让出主动，应配合左右防守并准备下一次下压。', ['对手可能继续进攻。'], ['将球送得足够深。'], ['COACH_BWF_L1_2017_DEFENCE']),
    ]
    return court.balance === 'offBalance' ? defence.filter((item) => item.shotType === 'lift') : defence
  }
  if (context.exchange === 'net') {
    return [candidate('net-safe', 'net', '稳妥回放网前', p3(straightX, otherFrontY(id), .1), '对方网前', 55, '先把球控制过网，同时准备对方回放。', '网前争夺强调控制与下一拍准备；低点击球不应强行下压。', ['回球太高会被扑杀。'], ['仍能控制球。'], ['COACH_BWF_L1_2017_ATTACK'])]
  }
  return [
    candidate('neutral-drive', 'drive', '平抽保持主动', p3(straightX, otherMidY(id), .9), '同侧中场', 55, '把球送向同侧中场，准备与搭档继续覆盖。', '中场平抽须考虑回球速度与搭档位置。', ['对方可能快速反抽。'], ['来球高度适合平抽。'], ['COACH_BWF_L1_2017_DEFENCE']),
    candidate('neutral-push', 'push', '推向后场空当', p3(crossX, otherRearY(id), .6), '对方后场', 51, '将球推向后场，让对方移动后再观察下一拍。', '推球质量与自身恢复位置决定是否能继续争主动。', ['球太慢时会被拦截。'], ['有足够的接触时间。'], ['COACH_BWF_L1_2017_SERVE']),
    candidate('neutral-lift', 'lift', '起高球重新站位', p3(crossX, otherRearY(id), 1.2), '对方后场', 43, '被动时先争取重新站稳。', '挑球让出主动，需要两人转入左右覆盖。', ['对方可继续下压。'], ['球能打到后场。'], ['COACH_BWF_L1_2017_DEFENCE']),
  ]
}

function movementFor(court: CourtState, shot: ShotType, target: Point3): { hitterMovement: Movement; partnerMovement: Movement } {
  const id = court.hitterId
  const own = court.players[id]
  const partner = court.players[partnerOf(id)]
  if (shot === 'lowServe' || shot === 'flickServe') return {
    hitterMovement: { to: { x: own.x, y: ownFrontY(id) }, description: '发球后留意网前回球，并向中前场准备。' },
    partnerMovement: { to: { x: partner.x, y: ownRearY(id) - (teamOf(id) === 1 ? .4 : -.4) }, description: '搭档覆盖中后场的推球与挑球。' },
  }
  if (shot === 'middleSmash' || shot === 'straightSmash' || shot === 'straightDrop' || shot === 'crossDrop') return {
    hitterMovement: { to: { x: limit(own.x * .7 + 3.05 * .3, .4, 5.7), y: ownRearY(id) }, description: '击球后恢复到可继续覆盖中后场的位置。' },
    partnerMovement: { to: { x: limit(target.x * .55 + 3.05 * .45, .7, 5.4), y: ownFrontY(id) }, description: '搭档向球路一侧的中前场移动，准备拦截挡网。' },
  }
  if (shot === 'block' || shot === 'net') return {
    hitterMovement: { to: { x: limit(own.x, .6, 5.5), y: ownFrontY(id) }, description: '击球后适当前压，准备对方回放网前。' },
    partnerMovement: { to: { x: limit(partner.x, .6, 5.5), y: ownRearY(id) - (teamOf(id) === 1 ? .6 : -.6) }, description: '搭档补住中后场，准备对方推球或起高球。' },
  }
  if (shot === 'lift') return {
    hitterMovement: { to: { x: own.x < 3.05 ? 1.55 : 4.55, y: teamOf(id) === 1 ? 9.6 : 3.8 }, description: '后撤到本侧，转入左右防守。' },
    partnerMovement: { to: { x: own.x < 3.05 ? 4.55 : 1.55, y: teamOf(id) === 1 ? 9.6 : 3.8 }, description: '搭档移动到另一侧，覆盖直线和中路。' },
  }
  return {
    hitterMovement: { to: { x: limit(own.x, .6, 5.5), y: ownFrontY(id) + (teamOf(id) === 1 ? .5 : -.5) }, description: '跟进球路，准备截击直线回球。' },
    partnerMovement: { to: { x: limit(partner.x, .6, 5.5), y: ownRearY(id) }, description: '搭档保持中后场覆盖。' },
  }
}

function responseOptions(court: CourtState, shot: ShotType, movement: { hitterMovement: Movement; partnerMovement: Movement }): ResponseOption[] {
  const id = court.hitterId
  const ownFront = ownFrontY(id)
  const ownRear = ownRearY(id)
  const x = movement.partnerMovement.to.x
  if (shot === 'lowServe' || shot === 'flickServe') return [
    { id: 'net', title: '接发放网', shotType: 'net', target: p3(x, ownFront, .35), explanation: '假设对方抢网，观察发球者与搭档如何分工。' },
    { id: 'push', title: '接发推后场', shotType: 'push', target: p3(court.players[partnerOf(id)].x, ownRear, 1.7), explanation: '假设对方推球到后场，搭档需准备接第三拍。' },
    { id: 'drive', title: '接发平抽', shotType: 'drive', target: p3(x, ownFront + (teamOf(id) === 1 ? .8 : -.8), 1), explanation: '假设对方平抽，双方争夺中场。' },
  ]
  return [
    { id: 'block', title: '对方挡网', shotType: 'block', target: p3(x, ownFront, .75), explanation: '对方卸力挡网，我方前场球员要准备跟进。' },
    { id: 'drive', title: '对方平抽', shotType: 'drive', target: p3(x, ownFront + (teamOf(id) === 1 ? .7 : -.7), 1.25), explanation: '对方快速平抽，我方需覆盖直线和中路。' },
    { id: 'lift', title: '对方起高球', shotType: 'lift', target: p3(movement.hitterMovement.to.x, ownRear, 2.5), explanation: '对方起高球，后场球员可准备下一次进攻。' },
  ]
}

function scoreCandidate(item: Candidate, court: CourtState, cards: Cards): { score: number; attributeNote: string } {
  const id = court.hitterId
  const closestId = opponentIds(id).sort((a, b) => distance(court.players[a], item.target) - distance(court.players[b], item.target))[0]
  const closest = court.players[closestId]
  const oppCard = cards[closestId]
  const hitter = cards[id]
  let score = item.base + limit(distance(closest, item.target) * 2, 0, 8)
  if (item.shotType === 'middleSmash' || item.shotType === 'straightSmash') score += (hitter.attributes.smashPower - 60) * .14
  if (item.shotType === 'lowServe' || item.shotType === 'flickServe') score += (hitter.attributes.serve - 60) * .12
  if (item.id.startsWith('return')) score += (hitter.attributes.serveReturn - 60) * .1
  if (item.shotType === 'drive') score += (hitter.attributes.drive - 60) * .12
  if (item.shotType === 'net' || item.shotType === 'block') score += (hitter.attributes.netPlay - 60) * .1
  let attributeNote = ''
  if (distance(closest, item.target) < 1.65 && oppCard.attributes.defence < 50) {
    score += (50 - oppCard.attributes.defence) * .14
    attributeNote = `对方球员 ${closestId} 的防守能力设置较低，这会提高该落点的排序。`
  }
  const backhandSide = (teamOf(closestId) === 2) === (oppCard.dominantHand === 'right') ? item.target.x > closest.x : item.target.x < closest.x
  if (distance(closest, item.target) < 1.4 && Math.abs(item.target.x - closest.x) > .25 && backhandSide && oppCard.attributes.backhand < 50) {
    score += (50 - oppCard.attributes.backhand) * .16
    attributeNote = `对方球员 ${closestId} 的反手能力设置较低，这会提高该落点的排序。`
  }
  return { score: Math.round(limit(score, 0, 100)), attributeNote }
}

export function analyze(court: CourtState, cards: Cards, context: RallyContext, asOf = new Date()): AnalysisResult {
  const lawVersion = activeLawVersion(asOf)
  const issues = validateCourt(court, cards, context, asOf)
  const situation = classifySituation(court, context)
  if (issues.length) return { recommendations: [], issues, lawVersion, situation }
  const candidates = generateCandidates(court, cards, context, situation)
  const filtered = candidates.filter((item) => {
    if (!item.evidenceIds.length) return false
    if (item.shotType === 'middleSmash' || item.shotType === 'straightSmash') {
      const partner = court.players[partnerOf(court.hitterId)]
      const coveringFront = distance(partner, { x: limit(item.target.x, .7, 5.4), y: ownFrontY(court.hitterId) }) <= 2.25
      return court.shuttle.z >= 1.8 && court.balance !== 'offBalance' && coveringFront
    }
    if (item.shotType === 'drive') return court.balance !== 'offBalance' && court.shuttle.z >= .7
    if (item.shotType === 'crossDrop') return court.balance === 'balanced' && court.contactTiming !== 'late'
    if (item.shotType === 'block') return court.balance !== 'offBalance'
    return true
  })
  const recommendations = filtered.map((item) => {
    const { score, attributeNote } = scoreCandidate(item, court, cards)
    const movement = movementFor(court, item.shotType, item.target)
    const level: RecommendationLevel = score >= 76 ? 'strong' : score >= 61 ? 'recommended' : score >= 52 ? 'optional' : 'variation'
    return {
      ...item, tacticalScore: score, level, hitterMovement: movement.hitterMovement,
      partnerMovement: movement.partnerMovement,
      expectedOpponentResponses: responseOptions(court, item.shotType, movement),
      explanation: { simple: `${item.explanation.simple}${attributeNote ? ` ${attributeNote}` : ''}`, advanced: `${item.explanation.advanced}${attributeNote ? ` ${attributeNote}` : ''}` },
    }
  }).sort((a, b) => b.tacticalScore - a.tacticalScore).slice(0, 3).map(({ base, ...item }) => { void base; return item })
  return {
    recommendations,
    issues: recommendations.length ? [] : [{ code: 'no-evidence', message: '当前条件下没有足够可靠的战术建议。', action: '调整球的高度、击球者平衡或选择已有依据的预设局面。' }],
    lawVersion,
    situation,
  }
}

export function advanceRally(court: CourtState, context: RallyContext, recommendation: TacticalRecommendation, response: ResponseOption): { court: CourtState; context: RallyContext; steps: ChainStep[] } {
  const hitterId = court.hitterId
  const partnerId = partnerOf(hitterId)
  const firstFrom = { x: court.shuttle.x, y: court.shuttle.y, z: court.shuttle.z }
  const responders = opponentIds(hitterId)
  const responseHitter = responders.sort((a, b) => distance(court.players[a], recommendation.target) - distance(court.players[b], recommendation.target))[0]
  const updatedPlayers = {
    ...court.players,
    [hitterId]: { ...court.players[hitterId], ...recommendation.hitterMovement.to },
    [partnerId]: { ...court.players[partnerId], ...recommendation.partnerMovement.to },
    [responseHitter]: { ...court.players[responseHitter], x: recommendation.target.x, y: recommendation.target.y },
  }
  const nextHitter = [hitterId, partnerId].sort((a, b) => distance(updatedPlayers[a], response.target) - distance(updatedPlayers[b], response.target))[0]
  const nextCourt: CourtState = {
    ...court, players: updatedPlayers,
    shuttle: { ...court.shuttle, ...response.target, incomingShotType: response.shotType, shuttleSide: teamOf(nextHitter) },
    hitterId: nextHitter, contactTiming: 'normal', contactSide: 'forehand', balance: 'balanced',
  }
  const nextContext: RallyContext = {
    ...context, phase: context.phase === 'serve' ? 'third' : 'rally',
    initiative: response.shotType === 'lift' ? 'attack' : response.shotType === 'drive' ? 'neutral' : 'transition',
    exchange: response.shotType === 'net' || response.shotType === 'block' ? 'net' : response.shotType === 'drive' ? 'flat' : 'general',
    shotIndex: Math.min(4, context.shotIndex + 2),
  }
  const steps: ChainStep[] = [
    { id: crypto.randomUUID(), index: context.shotIndex + 1, hitterId, shotType: recommendation.shotType, title: recommendation.title, from: firstFrom, to: recommendation.target, hitterMovement: recommendation.hitterMovement, partnerMovement: recommendation.partnerMovement, evidenceIds: recommendation.evidenceIds },
    { id: crypto.randomUUID(), index: context.shotIndex + 2, hitterId: responseHitter, shotType: response.shotType, title: response.title, from: recommendation.target, to: response.target, evidenceIds: recommendation.evidenceIds },
  ]
  return { court: nextCourt, context: nextContext, steps }
}
