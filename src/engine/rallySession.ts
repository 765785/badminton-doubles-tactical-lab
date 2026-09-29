import type { CourtState, RallyContext } from '../domain/model'
import type { Cards, RallySession, RallyShot, ShotEvaluation, ShotOutcome } from '../domain/rally'
import { ENGINE_VERSION, EVIDENCE_DATASET_VERSION, SIMULATION_PARAMETERS } from './simulationParameters'

const clone = <T,>(value: T): T => structuredClone(value)
const rootKey = '__root__'

export function createRallySession(
  id: string, name: string, cards: Cards, court: CourtState, context: RallyContext, createdAt: string,
): RallySession {
  return {
    schemaVersion: 2, id, name, createdAt, updatedAt: createdAt,
    engineVersion: ENGINE_VERSION, simulationParametersVersion: SIMULATION_PARAMETERS.version,
    evidenceDatasetVersion: EVIDENCE_DATASET_VERSION,
    cards: clone(cards), initialCourt: clone(court), initialContext: clone(context),
    nodes: {}, currentNodeId: null, lastVisitedChild: {}, manuallyEndedAt: null,
  }
}

export function sessionPosition(session: RallySession): { court: CourtState; context: RallyContext } {
  const node = session.currentNodeId ? session.nodes[session.currentNodeId] : null
  return node
    ? { court: clone(node.outcome.nextCourt), context: clone(node.outcome.nextContext) }
    : { court: clone(session.initialCourt), context: clone(session.initialContext) }
}

export function activePath(session: RallySession): RallyShot[] {
  const path: RallyShot[] = []
  let id = session.currentNodeId
  while (id) {
    const node = session.nodes[id]
    if (!node) break
    path.unshift(node)
    id = node.parentId
  }
  return path
}

export function childrenOf(session: RallySession, parentId: string | null): RallyShot[] {
  return Object.values(session.nodes).filter((node) => node.parentId === parentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function appendRallyShot(
  session: RallySession, evaluation: ShotEvaluation, outcome: ShotOutcome, id: string, createdAt: string,
): RallySession {
  if (session.nodes[id]) throw new Error('历史节点 ID 已存在。')
  const position = sessionPosition(session)
  const parentId = session.currentNodeId
  const node: RallyShot = {
    schemaVersion: 2, id, parentId, createdAt, index: activePath(session).length + 1,
    engineVersion: evaluation.engineVersion,
    simulationParametersVersion: evaluation.simulationParametersVersion,
    evidenceDatasetVersion: evaluation.evidenceDatasetVersion,
    cardsSnapshot: clone(session.cards),
    startCourt: position.court, startContext: position.context,
    evaluation: clone(evaluation), outcome: clone(outcome),
  }
  return {
    ...session, updatedAt: createdAt,
    nodes: { ...session.nodes, [id]: node },
    currentNodeId: id,
    lastVisitedChild: { ...session.lastVisitedChild, [parentId ?? rootKey]: id },
  }
}

export function selectHistoryNode(session: RallySession, id: string | null): RallySession {
  if (id !== null && !session.nodes[id]) throw new Error('找不到该回合历史节点。')
  return { ...session, currentNodeId: id }
}

export function undoRally(session: RallySession): RallySession {
  const node = session.currentNodeId ? session.nodes[session.currentNodeId] : null
  if (!node) return session
  return {
    ...session, currentNodeId: node.parentId,
    lastVisitedChild: { ...session.lastVisitedChild, [node.parentId ?? rootKey]: node.id },
  }
}

export function redoRally(session: RallySession): RallySession {
  const key = session.currentNodeId ?? rootKey
  const children = childrenOf(session, session.currentNodeId)
  const targetId = session.lastVisitedChild[key] ?? (children.length === 1 ? children[0].id : null)
  return targetId && session.nodes[targetId] ? { ...session, currentNodeId: targetId } : session
}

export function hasEnded(session: RallySession): boolean {
  return Boolean(session.currentNodeId && (
    session.nodes[session.currentNodeId]?.outcome.endReason
    || session.manuallyEndedAt === session.currentNodeId
  ))
}
