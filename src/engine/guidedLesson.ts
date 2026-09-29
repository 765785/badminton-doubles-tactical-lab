import type {
  ChainStep, CourtState, LawVersion, Point3, RallyContext,
  ResponseOption, ShotType, TacticalRecommendation,
} from '../domain/model'
import type { Cards, ConfirmedShot, ShotEvaluation, ShotOutcome, SimulationParameters } from '../domain/rally'
import { defaultShotMotion, evaluateConfirmedShot } from './coreRally'

export function guidedShot(court: CourtState, type: ShotType, target: Point3): ConfirmedShot {
  const origin = { x: court.shuttle.x, y: court.shuttle.y, z: court.shuttle.z }
  return {
    shotType: type, contactPoint: origin, target: { ...target },
    drawnTrajectory: [{ x: origin.x, y: origin.y }, { x: target.x, y: target.y }],
    ...defaultShotMotion(type),
    contactSide: court.contactSide, initiative: 'active', extremeLine: false, assumeContact: false,
  }
}

export function evaluateGuidedShot(
  court: CourtState, cards: Cards, context: RallyContext,
  type: ShotType, target: Point3, lawVersion: LawVersion | null,
  parameters: SimulationParameters, evidenceDatasetVersion: string,
): ShotEvaluation {
  return evaluateConfirmedShot({
    court, cards, context, shot: guidedShot(court, type, target),
    lawVersion, parameters, evidenceDatasetVersion,
  })
}

export interface GuidedTurn {
  firstEvaluation: ShotEvaluation
  firstOutcome: ShotOutcome
  secondEvaluation: ShotEvaluation
  startCourt: CourtState
  startContext: RallyContext
  recommendation: TacticalRecommendation
  response: ResponseOption
}

export function prepareGuidedTurn(input: {
  court: CourtState
  cards: Cards
  context: RallyContext
  recommendation: TacticalRecommendation
  response: ResponseOption
  lawVersion: LawVersion | null
  parameters: SimulationParameters
  evidenceDatasetVersion: string
}): GuidedTurn {
  const { court, cards, context, recommendation, response, lawVersion, parameters, evidenceDatasetVersion } = input
  const firstEvaluation = evaluateGuidedShot(
    court, cards, context, recommendation.shotType, recommendation.target,
    lawVersion, parameters, evidenceDatasetVersion,
  )
  const firstOutcome = firstEvaluation.receiverCandidates.find((item) => item.receiver?.playerId === response.receiverId)
    ?? (response.assumedReceiver
      ? firstEvaluation.assumedReceiverOptions.find((item) => item.receiver?.playerId === response.receiverId)
      : null)
    ?? (firstEvaluation.receiverCandidates.length === 1 ? firstEvaluation.receiverCandidates[0] : null)
  if (!firstOutcome?.receiver) throw new Error('请先明确选择接球人；本拍不会替用户决定。')
  const secondEvaluation = evaluateGuidedShot(
    firstOutcome.nextCourt, cards, firstOutcome.nextContext,
    response.shotType, response.target, lawVersion, parameters, evidenceDatasetVersion,
  )
  return { firstEvaluation, firstOutcome, secondEvaluation, startCourt: court, startContext: context, recommendation, response }
}

function chainStep(id: string, index: number, evaluation: ShotEvaluation, outcome: ShotOutcome, startCourt: CourtState, title: string): ChainStep {
  return {
    id, index, hitterId: startCourt.hitterId, shotType: evaluation.confirmedShot.shotType,
    title, from: evaluation.confirmedShot.contactPoint,
    to: outcome.receiver?.contactPoint ?? evaluation.confirmedShot.target,
    hitterMovement: {
      to: outcome.movements[startCourt.hitterId].actual,
      description: outcome.movements[startCourt.hitterId].explanation,
    },
    partnerMovement: {
      to: outcome.movements[startCourt.hitterId === 'A' ? 'B' : startCourt.hitterId === 'B' ? 'A' : startCourt.hitterId === 'C' ? 'D' : 'C'].actual,
      description: outcome.movements[startCourt.hitterId === 'A' ? 'B' : startCourt.hitterId === 'B' ? 'A' : startCourt.hitterId === 'C' ? 'D' : 'C'].explanation,
    },
    evidenceIds: evaluation.tacticalQuality.evidenceIds,
    startCourt: structuredClone(startCourt), endCourt: structuredClone(outcome.nextCourt),
    playerMovements: Object.fromEntries(
      (['A', 'B', 'C', 'D'] as const).map((playerId) => [playerId, {
        from: outcome.movements[playerId].from,
        actual: outcome.movements[playerId].actual,
        ideal: outcome.movements[playerId].ideal,
      }]),
    ) as ChainStep['playerMovements'],
  }
}

export function finishGuidedTurn(turn: GuidedTurn, secondOutcome: ShotOutcome, ids: [string, string]): {
  court: CourtState
  context: RallyContext
  steps: ChainStep[]
} {
  if (!turn.secondEvaluation.receiverCandidates.includes(secondOutcome)
    && !turn.secondEvaluation.assumedReceiverOptions.includes(secondOutcome)
    && turn.secondEvaluation.defaultOutcome !== secondOutcome) {
    throw new Error('所选接球结果不属于该拍计算结果。')
  }
  return {
    court: structuredClone(secondOutcome.nextCourt),
    context: structuredClone(secondOutcome.nextContext),
    steps: [
      chainStep(ids[0], turn.startContext.shotIndex + 1, turn.firstEvaluation, turn.firstOutcome, turn.startCourt, turn.recommendation.title),
      chainStep(ids[1], turn.startContext.shotIndex + 2, turn.secondEvaluation, secondOutcome, turn.firstOutcome.nextCourt, turn.response.title),
    ],
  }
}
