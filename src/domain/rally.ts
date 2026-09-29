import type {
  CourtState, LawVersion, PlayerCard, PlayerId, Point, Point3, RallyContext,
  ShotType, TeamId,
} from './model'

export type Cards = Record<PlayerId, PlayerCard>
export type FormationState =
  | 'frontBackAttack' | 'sideBySideDefence' | 'neutral' | 'flatExchange'
  | 'broken' | 'transitionAttack' | 'transitionDefence' | 'serve' | 'receive'
export type TacticalRole =
  | 'rearAttacker' | 'frontInterceptor' | 'leftDefender' | 'rightDefender'
  | 'netPressure' | 'rearCoverage' | 'server' | 'servePartner'
  | 'receiver' | 'receiverPartner' | 'transitioning'
export type EndReason = 'out' | 'net' | 'ground' | 'invalid' | 'manual'
export type DifficultyLevel = 'easy' | 'executable' | 'difficult' | 'extreme' | 'almostImpossible'
export type TacticalLevel = 'recommended' | 'viable' | 'highRisk' | 'insufficientEvidence'

export interface SimulationParameters {
  version: string
  movementModelVersion: string
  shuttleModelVersion: string
  balanceModelVersion: string
  flightSpeedMetersPerSecond: Record<'slow' | 'medium' | 'fast', number>
  arcFlightFactor: number
  minimumFlightSeconds: number
  maximumFlightSeconds: number
  minimumPlayerSpeed: number
  maximumPlayerSpeed: number
  minimumAcceleration: number
  maximumAcceleration: number
  baseStartDelaySeconds: number
  firstStepDelayReductionSeconds: number
  anticipationDelayReductionSeconds: number
  attackContinuityDelayDivisor: number
  directionChangeDelaySeconds: number
  firstStepAccelerationWeight: number
  stretchedSpeedFactor: number
  offBalanceSpeedFactor: number
  recoveryDelaySeconds: number
  baseReachMeters: number
  attributeReachMeters: number
  contactToleranceMeters: number
  reachReferenceCm: number
  reachAdjustmentRangeMeters: [number, number]
  trajectoryRiseMeters: Record<'flat' | 'arc' | 'downward', number>
  inference: {
    frontDistanceMeters: number; rearContactHeightMeters: number
    rearContactDistanceMeters: number; netHighHeightMeters: number; lowContactHeightMeters: number
  }
  receiverSamples: { first: number; last: number; divisions: number; minimumHeight: number; maximumHeight: number; assumedProgress: number }
  execution: {
    contactLoadWeight: number; offBalanceLoad: number; stretchedLoad: number
    lateLoad: number; extremeLineLoad: number; passiveAttackLoad: number
    lowAttackLoad: number; lowAttackHeight: number
    thresholds: [number, number, number, number]
  }
  positioning: {
    hitterRearY: [number, number]; hitterFrontY: [number, number]
    hitterDefenceY: [number, number]; receiverFrontY: [number, number]
    receiverRearY: [number, number]; defenceLeftX: number; defenceRightX: number
    receiverCoverLeftX: number; receiverCoverRightX: number
    hitterLateralWeights: [number, number, number]
    partnerTargetWeight: number
  }
  coverage: { anticipationBonusMeters: number; partialArrivalPenaltyMeters: number }
  formation: { overlapMeters: number; frontBackSeparationMeters: number; sideSeparationMeters: number }
  partnership: {
    frontY: [number, number]; rearY: [number, number]
    frontVacancyMeters: number; rearVacancyMeters: number; overlapFactor: number
  }
  tactical: {
    baseRank: number; skillBaseline: number; smashPowerWeight: number
    driveWeight: number; serveWeight: number; weakDefenceWeight: number
    weakBackhandWeight: number; weakAbilityThreshold: number
    weakDefenceRangeMeters: number; weakBackhandRangeMeters: number
    backhandLateralThresholdMeters: number; partnerFrontY: [number, number]
    partnerGapMeters: number; partnerGapPenalty: number; extremeLinePenalty: number
    difficultyPenalty: number; recommendedThreshold: number; viableThreshold: number
  }
}

export type MovementConstraint =
  | { kind: 'auto' }
  | { kind: 'hold' }
  | { kind: 'manualTarget'; target: Point }
export type MovementConstraints = Record<PlayerId, MovementConstraint>

export interface ShotDraft {
  drawnTrajectory: Point[]
  target: Point3
  contactPoint: Point3
  speed: 'slow' | 'medium' | 'fast'
  trajectory: 'flat' | 'arc' | 'downward'
  contactSide: 'forehand' | 'backhand'
  initiative: 'active' | 'passive'
  extremeLine: boolean
  assumeContact: boolean
  netCrossingHeight?: number
  declaredEndReason?: EndReason | null
}
export interface ConfirmedShot extends ShotDraft {
  shotType: ShotType
}
export interface ShotOrigin {
  playerPosition: Point
  shuttlePosition: Point3
  expectedContactPoint: Point3
  shotOrigin: Point3
}
export interface PhysicalRuleValidity {
  status: 'valid' | 'invalid' | 'assumed'
  reasons: string[]
  terminalReason: EndReason | null
}
export interface ExecutionDifficulty {
  level: DifficultyLevel
  reasons: string[]
  modelNotice: string
}
export interface TacticalQuality {
  level: TacticalLevel
  reasons: string[]
  evidenceIds: string[]
  // 仅用于候选排序，不是概率或胜率。
  internalRank: number
}
export interface PlayerMovementPlan {
  from: Point
  ideal: Point
  actual: Point
  path: Point[]
  role: TacticalRole
  responsibility: string
  explanation: string
  constraint: MovementConstraint['kind']
  arrival: 'arrived' | 'partial' | 'held'
}
export interface CoverageZone {
  center: Point
  radiusMeters: number
}
export interface PartnershipAnalysis {
  team: TeamId
  status: 'good' | 'reasonable' | 'overlap' | 'openSpace' | 'lateRotation'
  reasons: string[]
}
export interface ReceiverCandidate {
  playerId: PlayerId
  contactPoint: Point3
  contactTimeSeconds: number
  assumed: boolean
  explanation: string
}
export interface ShotOutcome {
  receiver: ReceiverCandidate | null
  terminalProgress: number
  movements: Record<PlayerId, PlayerMovementPlan>
  coverage: Record<PlayerId, CoverageZone>
  formations: Record<TeamId, FormationState>
  roles: Record<PlayerId, TacticalRole>
  partnerships: Record<TeamId, PartnershipAnalysis>
  endReason: EndReason | null
  nextCourt: CourtState
  nextContext: RallyContext
}
export interface ShotEvaluation {
  origin: ShotOrigin
  confirmedShot: ConfirmedShot
  physicalRuleValidity: PhysicalRuleValidity
  executionDifficulty: ExecutionDifficulty
  tacticalQuality: TacticalQuality
  flightSeconds: number
  shuttleTrajectory: Point3[]
  lawVersion: LawVersion | null
  engineVersion: string
  simulationParametersVersion: string
  evidenceDatasetVersion: string
  receiverCandidates: ShotOutcome[]
  assumedReceiverOptions: ShotOutcome[]
  defaultOutcome: ShotOutcome
}

export interface RallyShot {
  schemaVersion: 2
  id: string
  parentId: string | null
  index: number
  createdAt: string
  engineVersion: string
  simulationParametersVersion: string
  evidenceDatasetVersion: string
  cardsSnapshot: Cards
  startCourt: CourtState
  startContext: RallyContext
  evaluation: ShotEvaluation
  outcome: ShotOutcome
}
export interface RallySession {
  schemaVersion: 2
  id: string
  name: string
  createdAt: string
  updatedAt: string
  engineVersion: string
  simulationParametersVersion: string
  evidenceDatasetVersion: string
  cards: Cards
  initialCourt: CourtState
  initialContext: RallyContext
  nodes: Record<string, RallyShot>
  currentNodeId: string | null
  lastVisitedChild: Record<string, string>
  manuallyEndedAt?: string | null
}

export const FORMATION_LABELS: Record<FormationState, string> = {
  frontBackAttack: '前后进攻', sideBySideDefence: '左右防守', neutral: '中性站位',
  flatExchange: '平抽相持', broken: '阵型失衡', transitionAttack: '转入进攻',
  transitionDefence: '转入防守', serve: '发球站位', receive: '接发站位',
}
export const ROLE_LABELS: Record<TacticalRole, string> = {
  rearAttacker: '后场持续进攻', frontInterceptor: '前场封网',
  leftDefender: '防守左路', rightDefender: '防守右路',
  netPressure: '网前施压', rearCoverage: '保护后场',
  server: '发球', servePartner: '发球搭档补位',
  receiver: '接发', receiverPartner: '接发搭档补位', transitioning: '转换补位',
}
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: '容易执行', executable: '可以执行', difficult: '难度较高',
  extreme: '极高难度', almostImpossible: '基本不可行',
}
export const TACTICAL_LABELS: Record<TacticalLevel, string> = {
  recommended: '推荐', viable: '可行', highRisk: '风险较高',
  insufficientEvidence: '证据不足，暂不评价',
}
export const END_LABELS: Record<EndReason, string> = {
  out: '羽毛球出界', net: '羽毛球触网', ground: '未接到球，回合结束',
  invalid: '击球无效', manual: '手动结束回合',
}
