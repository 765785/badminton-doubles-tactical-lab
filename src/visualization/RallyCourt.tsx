import { useRef, useState, type PointerEvent } from 'react'
import {
  clampPoint, COURT_LENGTH, COURT_WIDTH, NET_Y, PLAYER_IDS, teamOf,
  type CourtState, type PlayerId, type Point, type Point3, type TeamId,
} from '../domain/model'
import type { ConfirmedShot, ShotOutcome } from '../domain/rally'

const V = { top: 62, bottom: 583, center: 400 }
const widthAt = (y: number) => 470 + 270 * y / COURT_LENGTH
const project = (point: Point | Point3): Point => {
  const z = 'z' in point ? point.z : 0
  return {
    x: V.center + (point.x - COURT_WIDTH / 2) * widthAt(point.y) / COURT_WIDTH,
    y: V.top + point.y / COURT_LENGTH * (V.bottom - V.top) - z * 29,
  }
}
const world = (point: Point): Point => {
  const y = (point.y - V.top) / (V.bottom - V.top) * COURT_LENGTH
  return { x: COURT_WIDTH / 2 + (point.x - V.center) * COURT_WIDTH / widthAt(y), y }
}
const line = (a: Point, b: Point) => {
  const p = project(a)
  const q = project(b)
  return 'M ' + p.x + ' ' + p.y + ' L ' + q.x + ' ' + q.y
}

interface Props {
  court: CourtState
  mode: 'setup' | 'draw' | 'playback'
  shot?: ConfirmedShot | null
  shuttleTrajectory?: Point3[] | null
  outcome?: ShotOutcome | null
  progress?: number
  focusTeam?: TeamId
  showCoverage?: boolean
  showIdeal?: boolean
  onSelectHitter: (id: PlayerId) => void
  onMovePlayer: (id: PlayerId, point: Point) => void
  onMoveShuttle: (point: Point) => void
  onDraw: (path: Point[], target: Point) => void
}

export default function RallyCourt({
  court, mode, shot, shuttleTrajectory, outcome, progress = 0, focusTeam = 1,
  showCoverage = false, showIdeal = false, onSelectHitter,
  onMovePlayer, onMoveShuttle, onDraw,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<{ kind: 'player' | 'shuttle' | 'shot'; id?: PlayerId; path: Point[]; moved: boolean } | null>(null)
  const [livePath, setLivePath] = useState<Point[]>([])
  const fromEvent = (event: PointerEvent<SVGSVGElement>): Point | null => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return world({ x: point.x, y: point.y })
  }
  const start = (event: PointerEvent<SVGGElement>, kind: 'player' | 'shuttle', id?: PlayerId) => {
    event.stopPropagation()
    if (mode === 'playback') return
    if (mode === 'draw' && id) onSelectHitter(id)
    gesture.current = mode === 'draw'
      ? { kind: 'shot', id, path: [{ x: court.shuttle.x, y: court.shuttle.y }], moved: false }
      : { kind, id, path: [], moved: false }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current) return
    const point = fromEvent(event)
    if (!point) return
    current.moved = true
    if (current.kind === 'shot') {
      if (!current.path.length || Math.hypot(point.x - current.path[current.path.length - 1].x, point.y - current.path[current.path.length - 1].y) > 0.08) {
        current.path.push(point)
        setLivePath([...current.path])
      }
    } else if (current.kind === 'shuttle') onMoveShuttle(clampPoint(point))
    else if (current.id) {
      onMovePlayer(current.id, {
        x: clampPoint(point).x,
        y: teamOf(current.id) === 1
          ? Math.max(NET_Y + 0.18, clampPoint(point).y)
          : Math.min(NET_Y - 0.18, clampPoint(point).y),
      })
    }
  }
  const end = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current) return
    if (current.kind === 'shot' && current.moved && current.path.length > 1) {
      onDraw(current.path, current.path[current.path.length - 1])
    } else if (current.kind === 'player' && !current.moved && current.id) onSelectHitter(current.id)
    gesture.current = null
    setLivePath([])
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId)
  }
  const playerPoint = (id: PlayerId): Point => {
    const movement = outcome?.movements[id]
    return movement
      ? {
          x: movement.from.x + (movement.actual.x - movement.from.x) * progress,
          y: movement.from.y + (movement.actual.y - movement.from.y) * progress,
        }
      : court.players[id]
  }
  const trajectoryProgress = Math.max(0, Math.min(shuttleTrajectory?.length ? shuttleTrajectory.length - 1 : 0,
    progress * (outcome?.terminalProgress ?? 1) * ((shuttleTrajectory?.length ?? 1) - 1)))
  const before = shuttleTrajectory?.[Math.floor(trajectoryProgress)]
  const after = shuttleTrajectory?.[Math.ceil(trajectoryProgress)]
  const fraction = trajectoryProgress - Math.floor(trajectoryProgress)
  const shuttleAt = before && after && outcome ? {
    x: before.x + (after.x - before.x) * fraction,
    y: before.y + (after.y - before.y) * fraction,
    z: before.z + (after.z - before.z) * fraction,
  } : court.shuttle
  const source = shot?.contactPoint ?? court.shuttle
  const target = outcome?.receiver?.contactPoint ?? shot?.target
  const activePath = livePath.length ? livePath : shot?.drawnTrajectory ?? []
  const pathText = activePath.length > 1
    ? activePath.map((p, index) => {
        const projected = project(p)
        return (index ? ' L ' : 'M ') + projected.x + ' ' + projected.y
      }).join('') : ''
  const boundary = [
    project({ x: 0, y: 0 }), project({ x: COURT_WIDTH, y: 0 }),
    project({ x: COURT_WIDTH, y: COURT_LENGTH }), project({ x: 0, y: COURT_LENGTH }),
  ].map((p) => p.x + ',' + p.y).join(' ')
  const shuttleScreen = project(shuttleAt)
  return <div className="court-shell">
    <svg ref={svgRef} viewBox="0 0 800 640" role="img" aria-label="可拖动并手绘球路的斜视双打球场" data-hitter={court.hitterId} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <defs>
        <linearGradient id="rally-court-gradient" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#128d70"/><stop offset="1" stopColor="#0baa80"/></linearGradient>
        <marker id="rally-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#b8fff2"/></marker>
      </defs>
      <rect width="800" height="640" fill="#122e47"/>
      <polygon points={boundary} fill="url(#rally-court-gradient)" stroke="#d5fff5" strokeWidth="3"/>
      <g fill="none" stroke="#e7fff8" strokeWidth="2.5">
        <path d={line({ x: 0.42, y: 0 }, { x: 0.42, y: COURT_LENGTH })}/>
        <path d={line({ x: 5.68, y: 0 }, { x: 5.68, y: COURT_LENGTH })}/>
        <path d={line({ x: 0, y: 4.72 }, { x: COURT_WIDTH, y: 4.72 })}/>
        <path d={line({ x: 0, y: 8.68 }, { x: COURT_WIDTH, y: 8.68 })}/>
        <path d={line({ x: 0, y: 0.76 }, { x: COURT_WIDTH, y: 0.76 })}/>
        <path d={line({ x: 0, y: 12.64 }, { x: COURT_WIDTH, y: 12.64 })}/>
        <path d={line({ x: COURT_WIDTH / 2, y: 0 }, { x: COURT_WIDTH / 2, y: 4.72 })}/>
        <path d={line({ x: COURT_WIDTH / 2, y: 8.68 }, { x: COURT_WIDTH / 2, y: COURT_LENGTH })}/>
      </g>
      <path d={line({ x: 0, y: NET_Y }, { x: COURT_WIDTH, y: NET_Y })} stroke="#ecfffa" strokeWidth="6"/>
      {showCoverage && outcome && PLAYER_IDS.map((id) => {
        const zone = outcome.coverage[id]
        const center = project(zone.center)
        return <circle key={'coverage-' + id} cx={center.x} cy={center.y} r={zone.radiusMeters * widthAt(zone.center.y) / COURT_WIDTH} fill={teamOf(id) === 1 ? '#5cf6e3' : '#ffc09a'} opacity="0.15" stroke={teamOf(id) === 1 ? '#b8fff3' : '#ffd5b9'} strokeWidth="1.5"/>
      })}
      {outcome && PLAYER_IDS.map((id) => {
        const movement = outcome.movements[id]
        const a = project(movement.from)
        const b = project(movement.actual)
        const ideal = project(movement.ideal)
        return <g key={'movement-' + id}>
          <path d={'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y} stroke={teamOf(id) === focusTeam ? '#b8fff2' : '#ffc19a'} strokeWidth={teamOf(id) === focusTeam ? 4 : 2.5} strokeDasharray="8 6" markerEnd="url(#rally-arrow)" opacity="0.85"/>
          {showIdeal && <circle cx={ideal.x} cy={ideal.y} r="11" fill="none" stroke="#ffffff" strokeDasharray="3 3" strokeWidth="2"/>}
        </g>
      })}
      {target && <path d={line(source, target)} stroke="#ffe0a7" strokeWidth="4" strokeDasharray="10 7" fill="none"/>}
      {pathText && <path d={pathText} stroke="#ffe8b9" strokeWidth="5" strokeLinecap="round" fill="none"/>}
      {PLAYER_IDS.map((id) => {
        const at = project(playerPoint(id))
        const active = court.hitterId === id
        return <g key={id} transform={'translate(' + at.x + ' ' + at.y + ')'} onPointerDown={(event) => start(event, 'player', id)} className="player-token" role="button" tabIndex={0} aria-label={'球员 ' + id + '，选择击球者或拖动位置'} onKeyDown={(event) => { if (event.key === 'Enter') onSelectHitter(id) }}>
          <ellipse cy="5" rx="21" ry="9" fill="#063b46" opacity="0.5"/>
          {active && <circle cy="-22" r="32" fill="none" stroke="#fff7b4" strokeWidth="3" strokeDasharray="6 5"/>}
          <circle cy="-40" r="10" fill={teamOf(id) === 1 ? '#19d0c2' : '#ff7853'} stroke="#fff" strokeWidth="2"/>
          <path d="M -14 -30 Q 0 -38 14 -30 L 17 -4 Q 0 4 -17 -4 Z" fill={teamOf(id) === 1 ? '#19d0c2' : '#ff7853'} stroke="#fff" strokeWidth="2"/>
          <text y="-10" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="800">{id}</text>
        </g>
      })}
      <g transform={'translate(' + shuttleScreen.x + ' ' + shuttleScreen.y + ')'} onPointerDown={(event) => start(event, 'shuttle')} className="shuttle-token" role="button" aria-label="羽毛球，拖动位置或从接触点画球路">
        <circle r="22" fill="transparent"/>
        <path d="M-5 3 6 3 10 -9 0 -16 -10 -9z" fill="#fff" stroke="#183147" strokeWidth="2"/>
      </g>
      {livePath.length > 1 && <text x="400" y="622" textAnchor="middle" fill="#fff" fontSize="15">
        {'方向与落点预览 · 距离约 ' + Math.hypot(livePath.at(-1)!.x - livePath[0].x, livePath.at(-1)!.y - livePath[0].y).toFixed(1) + ' 米'}
      </text>}
      {!livePath.length && <text x="400" y="622" textAnchor="middle" fill="#d9e9ed" fontSize="15">
        {mode === 'draw' ? '从当前击球者或羽毛球按住，向目标区域画球路' : mode === 'setup' ? '拖动球员和羽毛球，点击球员选择击球者' : '四名球员按实际可达位置移动'}
      </text>}
    </svg>
  </div>
}
