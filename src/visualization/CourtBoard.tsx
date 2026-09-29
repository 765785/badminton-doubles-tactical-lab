import { useRef, useState, type PointerEvent } from 'react'
import { clampPoint, COURT_LENGTH, COURT_WIDTH, NET_Y, partnerOf, teamOf, type ChainStep, type CourtState, type PlayerId, type Point, type Point3, type TacticalRecommendation } from '../domain/model'

const V = { width: 800, height: 640, top: 62, bottom: 583, center: 400 }
const widthAt = (y: number) => 470 + 270 * (y / COURT_LENGTH)

function project(point: Point3 | Point): Point {
  const t = point.y / COURT_LENGTH
  const z = 'z' in point ? point.z : 0
  return { x: V.center + (point.x - COURT_WIDTH / 2) * widthAt(point.y) / COURT_WIDTH, y: V.top + t * (V.bottom - V.top) - z * (27 + t * 5) }
}

function screenToWorld(point: Point): Point {
  const y = Math.max(.1, Math.min(COURT_LENGTH - .1, (point.y - V.top) / (V.bottom - V.top) * COURT_LENGTH))
  return clampPoint({ x: COURT_WIDTH / 2 + (point.x - V.center) * COURT_WIDTH / widthAt(y), y })
}

const linePath = (a: Point, b: Point) => {
  const p = project(a); const q = project(b)
  return `M ${p.x} ${p.y} L ${q.x} ${q.y}`
}

interface Props {
  court: CourtState
  selected?: TacticalRecommendation | null
  playbackStep?: ChainStep | null
  progress?: number
  onPlayerMove: (id: PlayerId, point: Point) => void
  onShuttleMove: (point: Point) => void
  onSelectPlayer: (id: PlayerId) => void
}

export default function CourtBoard({ court, selected, playbackStep, progress = 0, onPlayerMove, onShuttleMove, onSelectPlayer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<PlayerId | 'shuttle' | null>(null)
  const moved = useRef(false)
  const toSvg = (event: PointerEvent<SVGSVGElement>): Point | null => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }
  const startDrag = (event: PointerEvent<SVGGElement>, id: PlayerId | 'shuttle') => {
    event.stopPropagation()
    setDragging(id); moved.current = false
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    const at = toSvg(event)
    if (!at) return
    moved.current = true
    const world = screenToWorld(at)
    if (dragging === 'shuttle') onShuttleMove(world)
    else onPlayerMove(dragging, { x: world.x, y: teamOf(dragging) === 1 ? Math.max(NET_Y + .18, world.y) : Math.min(NET_Y - .18, world.y) })
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      if (!moved.current && dragging !== 'shuttle') onSelectPlayer(dragging)
      setDragging(null)
      if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId)
    }
  }
  const outer = [project({ x: 0, y: 0 }), project({ x: COURT_WIDTH, y: 0 }), project({ x: COURT_WIDTH, y: COURT_LENGTH }), project({ x: 0, y: COURT_LENGTH })]
  const polygon = outer.map((p) => `${p.x},${p.y}`).join(' ')
  const shadow = project(court.shuttle)
  const shuttlePosition = playbackStep ? project({
    x: playbackStep.from.x + (playbackStep.to.x - playbackStep.from.x) * progress,
    y: playbackStep.from.y + (playbackStep.to.y - playbackStep.from.y) * progress,
    z: playbackStep.from.z + (playbackStep.to.z - playbackStep.from.z) * progress + Math.sin(progress * Math.PI) * 1.3,
  }) : shadow
  const ground = playbackStep ? project({ x: playbackStep.from.x + (playbackStep.to.x - playbackStep.from.x) * progress, y: playbackStep.from.y + (playbackStep.to.y - playbackStep.from.y) * progress }) : project({ x: court.shuttle.x, y: court.shuttle.y })
  const source = playbackStep?.from ?? court.shuttle
  const target = playbackStep?.to ?? selected?.target
  const trajectoryStart = target ? project(source) : null
  const trajectoryEnd = target ? project(target) : null
  const mid = trajectoryStart && trajectoryEnd ? { x: (trajectoryStart.x + trajectoryEnd.x) / 2, y: (trajectoryStart.y + trajectoryEnd.y) / 2 - 95 } : null
  return (
    <div className="court-shell">
      <svg ref={svgRef} viewBox="0 0 800 640" role="img" aria-label="可拖动的斜视双打球场，青色为我方，橙色为对方" onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <defs>
          <linearGradient id="courtGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#128d70"/><stop offset="1" stopColor="#0baa80"/></linearGradient>
          <linearGradient id="boardGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#193d55"/><stop offset="1" stopColor="#102a43"/></linearGradient>
          <pattern id="netPattern" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 0 0 L 8 0 M 0 0 L 0 8" stroke="#dff6ef" strokeOpacity=".48" strokeWidth=".7"/></pattern>
          <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#59f3df"/></marker>
          <marker id="arrow-orange" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#ffad75"/></marker>
        </defs>
        <rect x="0" y="0" width="800" height="640" fill="url(#boardGradient)"/>
        <path d="M 136 54 L 664 54 L 795 606 L 5 606 Z" fill="#0b2032" opacity=".5"/>
        <polygon points={polygon} fill="url(#courtGradient)" stroke="#c5fff0" strokeWidth="3"/>
        <g stroke="#e4fff7" strokeWidth="2.8" fill="none" opacity=".95">
          <path d={linePath({ x: .42, y: 0 }, { x: .42, y: COURT_LENGTH })}/>
          <path d={linePath({ x: 5.68, y: 0 }, { x: 5.68, y: COURT_LENGTH })}/>
          <path d={linePath({ x: 0, y: 4.72 }, { x: COURT_WIDTH, y: 4.72 })}/>
          <path d={linePath({ x: 0, y: 8.68 }, { x: COURT_WIDTH, y: 8.68 })}/>
          <path d={linePath({ x: 0, y: .76 }, { x: COURT_WIDTH, y: .76 })}/>
          <path d={linePath({ x: 0, y: 12.64 }, { x: COURT_WIDTH, y: 12.64 })}/>
          <path d={linePath({ x: 3.05, y: 0 }, { x: 3.05, y: 4.72 })}/>
          <path d={linePath({ x: 3.05, y: 8.68 }, { x: 3.05, y: COURT_LENGTH })}/>
        </g>
        <g>
          <path d={linePath({ x: 0, y: NET_Y }, { x: COURT_WIDTH, y: NET_Y })} stroke="#092637" strokeWidth="12"/>
          <path d={linePath({ x: 0, y: NET_Y }, { x: COURT_WIDTH, y: NET_Y })} stroke="#eafff9" strokeWidth="3"/>
          <rect x={project({ x: 0, y: NET_Y }).x} y={project({ x: 0, y: NET_Y }).y - 36} width={widthAt(NET_Y)} height="36" fill="url(#netPattern)" opacity=".55"/>
        </g>
        {target && trajectoryStart && trajectoryEnd && mid && <>
          <ellipse cx={project({ x: target.x, y: target.y }).x} cy={project({ x: target.x, y: target.y }).y} rx="33" ry="17" fill="#ffba73" opacity=".34" stroke="#ffe0a7" strokeWidth="2"/>
          <path d={`M ${trajectoryStart.x} ${trajectoryStart.y} Q ${mid.x} ${mid.y} ${trajectoryEnd.x} ${trajectoryEnd.y}`} fill="none" stroke="#ffd5a0" strokeWidth="4" strokeDasharray="11 8" markerEnd="url(#arrow-orange)"/>
        </>}
        {playbackStep?.playerMovements && (['A', 'B', 'C', 'D'] as PlayerId[]).map((id) => {
          const movement = playbackStep.playerMovements![id]
          const from = project(movement.from); const to = project(movement.actual)
          return <path key={'step-' + id} d={'M ' + from.x + ' ' + from.y + ' L ' + to.x + ' ' + to.y} fill="none" stroke={teamOf(id) === teamOf(playbackStep.hitterId) ? '#64ffe8' : '#ffad75'} strokeWidth={teamOf(id) === teamOf(playbackStep.hitterId) ? 4 : 2.5} strokeDasharray="9 8" markerEnd={teamOf(id) === teamOf(playbackStep.hitterId) ? 'url(#arrow-teal)' : 'url(#arrow-orange)'}/>
        })}
        {selected && (!playbackStep || playbackStep.id === 'preview') && [
          [court.hitterId, selected.hitterMovement], [partnerOf(court.hitterId), selected.partnerMovement],
        ].map(([id, movement]) => {
          const playerId = id as PlayerId
          const moveTo = movement as TacticalRecommendation['hitterMovement']
          const from = project(court.players[playerId]); const to = project(moveTo.to)
          return <path key={playerId} d={`M ${from.x} ${from.y - 5} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 20} ${to.x} ${to.y - 5}`} fill="none" stroke="#64ffe8" strokeWidth="4" strokeDasharray="9 8" markerEnd="url(#arrow-teal)"/>
        })}
        {(['C', 'D', 'A', 'B'] as PlayerId[]).map((id) => {
          const stepMove = playbackStep?.playerMovements?.[id]
          const actual = stepMove ? {
            x: stepMove.from.x + (stepMove.actual.x - stepMove.from.x) * progress,
            y: stepMove.from.y + (stepMove.actual.y - stepMove.from.y) * progress,
          } : court.players[id]
          const point = project(actual); const current = (playbackStep?.hitterId ?? court.hitterId) === id
          const fill = teamOf(id) === 1 ? '#1ed0c1' : '#ff7653'
          return <g key={id} transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => startDrag(event, id)} className="player-token" tabIndex={0} role="button" aria-label={`球员 ${id}，点击编辑，拖动调整位置`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPlayer(id) } }}>
            <ellipse cy="5" rx="22" ry="10" fill="#073947" opacity=".48"/>
            {current && <circle cy="-23" r="34" fill="none" stroke="#fff6b8" strokeWidth="3" strokeDasharray="7 5"/>}
            <circle cy="-45" r="10" fill={fill} stroke="#effff9" strokeWidth="2"/>
            <path d="M -15 -32 Q 0 -40 15 -32 L 18 -4 Q 0 4 -18 -4 Z" fill={fill} stroke="#e9fff9" strokeWidth="2"/>
            <text y="-12" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="800">{id}</text>
          </g>
        })}
        <ellipse cx={ground.x} cy={ground.y + 3} rx="14" ry="6" fill="#063a3e" opacity=".55"/>
        <g transform={`translate(${shuttlePosition.x} ${shuttlePosition.y})`} onPointerDown={(event) => startDrag(event, 'shuttle')} className="shuttle-token" role="button" aria-label="羽毛球，拖动调整位置" tabIndex={0}>
          <circle r="19" fill="transparent"/>
          <path d="M-5 3 6 3 10 -9 0 -16 -10 -9z" fill="#f8fbff" stroke="#183147" strokeWidth="2"/>
          <path d="M-5 3 0 -16M0 3 0 -16M5 3 0 -16" stroke="#9eb3c1" strokeWidth="1.2"/>
        </g>
        <text x="400" y="626" textAnchor="middle" fill="#d2e8e8" opacity=".76" fontSize="15">拖动球员或羽毛球，改变这一拍的局面</text>
      </svg>
    </div>
  )
}
