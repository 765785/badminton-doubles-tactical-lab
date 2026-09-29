import { defaultCards, type CourtState, type PlayerCard, type PlayerId, type RallyContext } from '../domain/model'
import { activeLawVersion } from './laws'

export interface PresetScenario {
  id: string
  name: string
  category: '发接发' | '进攻' | '防守' | '转换' | '混双'
  description: string
  beginner?: boolean
  evidenceIds: string[]
  cards: Record<PlayerId, PlayerCard>
  court: CourtState
  context: RallyContext
}

function court(players: CourtState['players'], hitterId: PlayerId, shuttle: CourtState['shuttle'], incoming?: CourtState['shuttle']['incomingShotType']): CourtState {
  return {
    players,
    hitterId,
    shuttle: { ...shuttle, incomingShotType: incoming, shuttleSide: hitterId === 'A' || hitterId === 'B' ? 1 : 2 },
    contactTiming: 'normal', contactSide: 'forehand', balance: 'balanced',
  }
}

const servePlayers = { A: { x: 3.35, y: 8.9 }, B: { x: 3.75, y: 10.3 }, C: { x: 2.65, y: 4.35 }, D: { x: 3.8, y: 2.9 } }
const attackPlayers = { A: { x: 2.05, y: 10.7 }, B: { x: 3.05, y: 7.8 }, C: { x: 1.65, y: 3.2 }, D: { x: 4.4, y: 3.2 } }
const defencePlayers = { A: { x: 1.65, y: 9.5 }, B: { x: 4.4, y: 9.5 }, C: { x: 2.1, y: 2.7 }, D: { x: 3.8, y: 5.2 } }
const flatPlayers = { A: { x: 1.9, y: 8.6 }, B: { x: 4.25, y: 8.7 }, C: { x: 2.1, y: 4.8 }, D: { x: 4.1, y: 4.7 } }

function standard(name: string, id: string, category: PresetScenario['category'], description: string, players: CourtState['players'], hitterId: PlayerId, shuttle: CourtState['shuttle'], context: RallyContext, evidenceIds: string[], beginner = false, incoming?: CourtState['shuttle']['incomingShotType']): PresetScenario {
  return { id, name, category, description, beginner, evidenceIds, cards: defaultCards(), court: court(players, hitterId, shuttle, incoming), context }
}

const attackContext: RallyContext = { phase: 'rally', initiative: 'attack', exchange: 'rear', shotIndex: 0 }
const defenceContext: RallyContext = { phase: 'rally', initiative: 'defence', exchange: 'general', shotIndex: 0 }

const mixedCards = defaultCards()
mixedCards.B.gender = 'female'
mixedCards.D.gender = 'female'

export const PRESETS: PresetScenario[] = [
  standard('低发球 → 接发 → 第三拍', 'serve-low', '发接发', '从低发球观察两人如何分担网前与后场。', servePlayers, 'A', { x: 3.35, y: 8.9, z: .92, speed: 'slow', trajectory: 'arc' }, { phase: 'serve', initiative: 'neutral', exchange: 'general', shotIndex: 0, servingTeam: 1, serverId: 'A', receiverId: 'C', servingScore: 0 }, ['COACH_BWF_L1_2017_SERVE'], false),
  standard('接发球以后两个人怎么跑？', 'return-follow', '发接发', '接发球员前压时，搭档继续覆盖中后场。', servePlayers, 'C', { x: 2.65, y: 4.35, z: 1.1, speed: 'medium', trajectory: 'flat' }, { phase: 'return', initiative: 'transition', exchange: 'net', shotIndex: 0, servingTeam: 1, serverId: 'A', receiverId: 'C', servingScore: 0 }, ['COACH_BWF_L1_2017_SERVE'], true),
  standard('双打进攻为什么前后站？', 'attack-formation', '进攻', '后场组织进攻，前场准备抢网与拦截。', attackPlayers, 'A', { x: 2.05, y: 10.7, z: 2.6, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_ATTACK'], true),
  standard('双打防守为什么左右站？', 'defence-formation', '防守', '面对下压球时观察两人左右分工。', defencePlayers, 'A', { x: 1.65, y: 9.5, z: 1.05, speed: 'fast', trajectory: 'downward' }, defenceContext, ['COACH_BWF_L1_2017_DEFENCE'], true, 'straightSmash'),
  standard('后场杀球时搭档应该去哪？', 'smash-front', '进攻', '后场杀球和前场跟进必须连在一起看。', attackPlayers, 'A', { x: 2.05, y: 10.7, z: 2.9, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_ATTACK'], true),
  standard('什么情况下应该打中路？', 'middle-smash', '进攻', '两名对手分开防守时考察中路和下一拍覆盖。', attackPlayers, 'A', { x: 2.05, y: 10.7, z: 2.8, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_ATTACK'], true),
  standard('直线进攻与同侧覆盖', 'straight-attack', '进攻', '直线进攻后，前场搭档准备同一通道的挡网。', { ...attackPlayers, B: { x: 2.25, y: 7.75 } }, 'A', { x: 1.9, y: 10.6, z: 2.5, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_ATTACK']),
  standard('对角变化与恢复距离', 'cross-variation', '进攻', '对角球是有条件的变化，必须考虑直线反击。', { ...attackPlayers, B: { x: 3.5, y: 7.8 } }, 'A', { x: 1.75, y: 10.6, z: 2.7, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_ATTACK']),
  standard('接杀挡网 → 防守转进攻', 'block-transition', '转换', '接杀球控制到网前后，击球者跟进，搭档补后场。', defencePlayers, 'A', { x: 1.65, y: 9.5, z: 1.05, speed: 'fast', trajectory: 'downward' }, defenceContext, ['COACH_BWF_L1_2017_DEFENCE'], false, 'straightSmash'),
  standard('平抽挡争夺主动', 'flat-exchange', '转换', '中场快节奏交换中仍要注意搭档覆盖。', flatPlayers, 'A', { x: 1.9, y: 8.6, z: 1.25, speed: 'fast', trajectory: 'flat' }, { phase: 'rally', initiative: 'neutral', exchange: 'flat', shotIndex: 0 }, ['COACH_BWF_L1_2017_DEFENCE'], false, 'drive'),
  { ...standard('混双基础发接发', 'mixed-serve', '混双', '用四人个人能力和站位讨论发接发，不预设性别能力。', { A: { x: 3.8, y: 10.3 }, B: { x: 3.35, y: 8.9 }, C: { x: 3.75, y: 2.9 }, D: { x: 2.65, y: 4.35 } }, 'B', { x: 3.35, y: 8.9, z: .92, speed: 'slow', trajectory: 'arc' }, { phase: 'serve', initiative: 'neutral', exchange: 'general', shotIndex: 0, servingTeam: 1, serverId: 'B', receiverId: 'D', servingScore: 0 }, ['COACH_BWF_L1_2017_MIXED']), cards: structuredClone(mixedCards) },
  { ...standard('混双前后轮转', 'mixed-rotation', '混双', '前后职责随球的位置与球员能力调整。', attackPlayers, 'A', { x: 2.05, y: 10.7, z: 2.6, speed: 'medium', trajectory: 'arc' }, attackContext, ['COACH_BWF_L1_2017_MIXED']), cards: structuredClone(mixedCards) },
]

export function findPreset(id: string): PresetScenario | undefined {
  const item = PRESETS.find((preset) => preset.id === id)
  if (!item) return undefined
  const law = item.context.phase === 'serve' ? activeLawVersion() : null
  return { ...structuredClone(item), evidenceIds: law ? [law.evidenceId, ...item.evidenceIds] : [...item.evidenceIds] }
}
