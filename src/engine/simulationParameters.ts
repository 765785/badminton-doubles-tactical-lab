import type { SimulationParameters } from '../domain/rally'

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested)
    Object.freeze(value)
  }
  return value
}

// 教学用途的运动启发式参数，单位为米和秒。不是人体生物力学或羽毛球空气动力学测量值。
// 修改任何数值时递增 version，旧回合仍使用已保存的逐拍快照重播。
export const SIMULATION_PARAMETERS: SimulationParameters = deepFreeze({
  version: 'teaching-1.1.0',
  movementModelVersion: 'movement-3',
  shuttleModelVersion: 'shuttle-2',
  balanceModelVersion: 'balance-2',
  flightSpeedMetersPerSecond: { slow: 4.5, medium: 7.5, fast: 12 },
  arcFlightFactor: 1.22,
  minimumFlightSeconds: 0.42,
  maximumFlightSeconds: 2.8,
  minimumPlayerSpeed: 1.65,
  maximumPlayerSpeed: 4.4,
  minimumAcceleration: 5,
  maximumAcceleration: 11,
  baseStartDelaySeconds: 0.2,
  firstStepDelayReductionSeconds: 0.12,
  anticipationDelayReductionSeconds: 0.035,
  attackContinuityDelayDivisor: 150,
  directionChangeDelaySeconds: 0.16,
  firstStepAccelerationWeight: 0.55,
  stretchedSpeedFactor: 0.74,
  offBalanceSpeedFactor: 0.52,
  recoveryDelaySeconds: 0.15,
  baseReachMeters: 0.72,
  attributeReachMeters: 0.8,
  contactToleranceMeters: 0.38,
  reachReferenceCm: 75,
  reachAdjustmentRangeMeters: [-0.15, 0.25] as [number, number],
  trajectoryRiseMeters: { flat: 0.55, arc: 1.35, downward: 0.12 },
  inference: {
    frontDistanceMeters: 2.4, rearContactHeightMeters: 1.8,
    rearContactDistanceMeters: 2.2, netHighHeightMeters: 1.45, lowContactHeightMeters: 1.25,
  },
  receiverSamples: { first: 5, last: 19, divisions: 20, minimumHeight: 0.25, maximumHeight: 3.4, assumedProgress: 0.9 },
  execution: {
    contactLoadWeight: 28, offBalanceLoad: 25, stretchedLoad: 12,
    lateLoad: 12, extremeLineLoad: 14, passiveAttackLoad: 12,
    lowAttackLoad: 20, lowAttackHeight: 1.8,
    thresholds: [55, 36, 18, 0] as [number, number, number, number],
  },
  positioning: {
    hitterRearY: [10.1, 3.3] as [number, number], hitterFrontY: [7.8, 5.6] as [number, number],
    hitterDefenceY: [9.6, 3.8] as [number, number], receiverFrontY: [7.8, 5.6] as [number, number],
    receiverRearY: [10.3, 3.1] as [number, number], defenceLeftX: 1.55, defenceRightX: 4.55,
    receiverCoverLeftX: 1.7, receiverCoverRightX: 4.4,
    hitterLateralWeights: [0.55, 0.2, 0.25] as [number, number, number],
    partnerTargetWeight: 0.6,
  },
  coverage: { anticipationBonusMeters: 0.35, partialArrivalPenaltyMeters: 0.18 },
  formation: { overlapMeters: 1.2, frontBackSeparationMeters: 1.75, sideSeparationMeters: 1.65 },
  partnership: {
    frontY: [7.9, 5.5] as [number, number], rearY: [11.3, 2.1] as [number, number],
    frontVacancyMeters: 2.2, rearVacancyMeters: 2.4, overlapFactor: 0.7,
  },
  tactical: {
    baseRank: 55, skillBaseline: 60, smashPowerWeight: 0.2,
    driveWeight: 0.18, serveWeight: 0.18, weakDefenceWeight: 0.14,
    weakBackhandWeight: 0.16, weakAbilityThreshold: 50,
    weakDefenceRangeMeters: 1.65, weakBackhandRangeMeters: 1.4,
    backhandLateralThresholdMeters: 0.25, partnerFrontY: [7.8, 5.6] as [number, number],
    partnerGapMeters: 2.5, partnerGapPenalty: 18, extremeLinePenalty: 12,
    difficultyPenalty: 13, recommendedThreshold: 64, viableThreshold: 48,
  },
})

export const ENGINE_VERSION = 'core-rally-1.1.0'
export const EVIDENCE_DATASET_VERSION = 'research-2026-09-29'
