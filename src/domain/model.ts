export type PlayerId = 'A' | 'B' | 'C' | 'D'
export type TeamId = 1 | 2
export type Gender = 'male' | 'female'
export type Hand = 'left' | 'right'
export type SkillMode = 'simple' | 'detailed'
export type GeneralLevel = 'veryHigh' | 'high' | 'medium' | 'low' | 'veryLow'
export type Point = { x: number; y: number }
export type Point3 = Point & { z: number }

export const COURT_WIDTH = 6.1
export const COURT_LENGTH = 13.4
export const NET_Y = COURT_LENGTH / 2
export const SHORT_SERVICE_DISTANCE = 1.98
export const DOUBLE_LONG_SERVICE_DISTANCE = 0.76
export const PLAYER_IDS: PlayerId[] = ['A', 'B', 'C', 'D']

export const ATTRIBUTE_LABELS = {
  smashPower: '杀球威胁',
  rearCourtAttack: '后场进攻',
  attackContinuity: '连续进攻',
  frontCourtInterception: '前场封网',
  netPlay: '网前能力',
  drive: '平抽挡',
  defence: '防守',
  counterAttack: '防守反击',
  movementSpeed: '移动速度',
  firstStep: '启动爆发',
  backhand: '反手能力',
  serve: '发球',
  serveReturn: '接发球',
  anticipation: '预判',
  deception: '假动作',
  consistency: '稳定性',
  endurance: '体能',
  coverage: '覆盖范围',
} as const

export type AttributeKey = keyof typeof ATTRIBUTE_LABELS
export type PlayerAttributes = Record<AttributeKey, number>

export interface PlayerCard {
  id: PlayerId
  name: string
  gender: Gender
  dominantHand: Hand
  skillMode: SkillMode
  generalLevel: GeneralLevel
  attributes: PlayerAttributes
  heightCm?: number
  reachCm?: number
}

export interface PlayerState {
  x: number
  y: number
  facingDirection?: number
  movementDirection?: number
  movementSpeed?: number
  balance?: 'balanced' | 'stretched' | 'offBalance'
  centreOfGravityDirection?: number
  racketSide?: 'forehand' | 'backhand'
  pressureState?: 'low' | 'medium' | 'high'
  readyState?: 'ready' | 'recovering'
  estimatedReachZone?: number
}

export interface ShuttleState extends Point3 {
  speed: 'slow' | 'medium' | 'fast'
  horizontalDirection?: number
  verticalDirection?: number
  trajectory?: 'flat' | 'arc' | 'downward'
  incomingShotType?: ShotType
  expectedContactPoint?: Point3
  shuttleSide?: TeamId
}

export interface CourtState {
  players: Record<PlayerId, PlayerState>
  shuttle: ShuttleState
  hitterId: PlayerId
  contactTiming: 'early' | 'normal' | 'late'
  contactSide: 'forehand' | 'backhand'
  balance: 'balanced' | 'stretched' | 'offBalance'
}

export type RallyPhase = 'serve' | 'return' | 'third' | 'rally'
export type Initiative = 'attack' | 'defence' | 'neutral' | 'transition'
export type ExchangeType = 'general' | 'rear' | 'net' | 'flat'

export interface RallyContext {
  phase: RallyPhase
  initiative: Initiative
  exchange: ExchangeType
  // 已记录的教学链击球次数，从当前预设开始计，不等于整场回合的绝对拍数。
  shotIndex: number
  servingTeam?: TeamId
  serverId?: PlayerId
  receiverId?: PlayerId
  servingScore?: number
}

export type ShotType =
  | 'lowServe' | 'flickServe' | 'net' | 'push' | 'drive' | 'lift'
  | 'middleSmash' | 'straightSmash' | 'crossSmash' | 'halfSmash'
  | 'straightDrop' | 'crossDrop' | 'fastDrop' | 'clear' | 'block' | 'netKill'

export type RecommendationLevel = 'strong' | 'recommended' | 'optional' | 'variation' | 'highRisk' | 'notRecommended'

export interface Movement {
  to: Point
  description: string
}

export interface ResponseOption {
  id: string
  title: string
  shotType: ShotType
  target: Point3
  explanation: string
  receiverId?: PlayerId
  assumedReceiver?: boolean
}

export interface TacticalRecommendation {
  id: string
  shotType: ShotType
  title: string
  target: Point3
  targetZone: string
  level: RecommendationLevel
  tacticalScore: number
  hitterMovement: Movement
  partnerMovement: Movement
  expectedOpponentResponses: ResponseOption[]
  explanation: { simple: string; advanced: string }
  risks: string[]
  conditions: string[]
  evidenceIds: string[]
}

export interface LawVersion {
  rulesVersion: string
  publishedAt: string | null
  effectiveFrom: string
  effectiveUntil: string | null
  verifiedAt: string
  officialUrl: string
  evidenceId: string
  serviceHeightLimitMeters: number
  netHeightAtCentreMeters: number
}

export interface AnalysisIssue {
  code: string
  message: string
  action: string
}

export interface AnalysisResult {
  recommendations: TacticalRecommendation[]
  issues: AnalysisIssue[]
  lawVersion: LawVersion | null
  situation: Initiative
}

export interface ChainStep {
  id: string
  index: number
  hitterId: PlayerId
  shotType: ShotType
  title: string
  from: Point3
  to: Point3
  hitterMovement?: Movement
  partnerMovement?: Movement
  evidenceIds: string[]
  startCourt?: CourtState
  endCourt?: CourtState
  playerMovements?: Record<PlayerId, { from: Point; actual: Point; ideal: Point }>
}

export interface SavedScenario {
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  cards: Record<PlayerId, PlayerCard>
  court: CourtState
  context: RallyContext
  chain: ChainStep[]
}

export const GENERAL_LEVEL_LABELS: Record<GeneralLevel, string> = {
  veryHigh: '极高', high: '高', medium: '中', low: '低', veryLow: '极低',
}

export function attributesForLevel(level: GeneralLevel): PlayerAttributes {
  const value = { veryHigh: 90, high: 76, medium: 62, low: 45, veryLow: 28 }[level]
  return Object.fromEntries(Object.keys(ATTRIBUTE_LABELS).map((key) => [key, value])) as PlayerAttributes
}

export function makePlayerCard(id: PlayerId, gender: Gender = 'male'): PlayerCard {
  return { id, name: `球员 ${id}`, gender, dominantHand: 'right', skillMode: 'simple', generalLevel: 'medium', attributes: attributesForLevel('medium') }
}

export function defaultCards(): Record<PlayerId, PlayerCard> {
  return { A: makePlayerCard('A'), B: makePlayerCard('B'), C: makePlayerCard('C'), D: makePlayerCard('D') }
}

export function teamOf(id: PlayerId): TeamId { return id === 'A' || id === 'B' ? 1 : 2 }
export function partnerOf(id: PlayerId): PlayerId { return ({ A: 'B', B: 'A', C: 'D', D: 'C' } as const)[id] }
export function opponentIds(id: PlayerId): [PlayerId, PlayerId] { return teamOf(id) === 1 ? ['C', 'D'] : ['A', 'B'] }
export function clampPoint(p: Point): Point { return { x: Math.max(0, Math.min(COURT_WIDTH, p.x)), y: Math.max(0, Math.min(COURT_LENGTH, p.y)) } }
export function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y) }

export type CompetitionFormat = 'mens' | 'womens' | 'mixed' | 'training'
export function competitionFormat(cards: Record<PlayerId, PlayerCard>): CompetitionFormat {
  const first = [cards.A.gender, cards.B.gender].sort().join('/')
  const second = [cards.C.gender, cards.D.gender].sort().join('/')
  if (first !== second) return 'training'
  if (first === 'male/male') return 'mens'
  if (first === 'female/female') return 'womens'
  return 'mixed'
}

export const FORMAT_LABELS: Record<CompetitionFormat, string> = {
  mens: '男双', womens: '女双', mixed: '混双', training: '自定义训练组合',
}

export const SHOT_LABELS: Record<ShotType, string> = {
  lowServe: '低发球', flickServe: '偷后场发球', net: '放网', push: '推球', drive: '平抽挡',
  lift: '挑球', middleSmash: '杀中路', straightSmash: '直线杀球', straightDrop: '直线吊球',
  crossSmash: '对角杀球', halfSmash: '点杀', crossDrop: '对角吊球', fastDrop: '快吊',
  clear: '高远球', block: '挡网', netKill: '扑球',
}

export const LEVEL_LABELS: Record<RecommendationLevel, string> = {
  strong: '强烈推荐', recommended: '推荐', optional: '可选', variation: '变化球', highRisk: '高风险变化', notRecommended: '不推荐',
}
