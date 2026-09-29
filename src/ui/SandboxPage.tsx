import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  COURT_LENGTH, COURT_WIDTH, FORMAT_LABELS, PLAYER_IDS, SHOT_LABELS,
  competitionFormat, distance, teamOf,
  type CourtState, type PlayerCard, type PlayerId, type Point, type Point3, type ShotType,
} from '../domain/model'
import {
  DIFFICULTY_LABELS, END_LABELS, FORMATION_LABELS, ROLE_LABELS, TACTICAL_LABELS,
  type Cards, type MovementConstraints, type RallySession,
  type ShotDraft, type ShotEvaluation,
} from '../domain/rally'
import { analyze } from '../engine/analyze'
import { confirmDraft, defaultShotMotion, evaluateConfirmedShot, inferShotTypes } from '../engine/coreRally'
import {
  activePath, appendRallyShot, childrenOf, createRallySession, hasEnded,
  redoRally, selectHistoryNode, sessionPosition, undoRally,
} from '../engine/rallySession'
import { EVIDENCE_DATASET_VERSION, SIMULATION_PARAMETERS } from '../engine/simulationParameters'
import { activeLawVersion } from '../knowledge/laws'
import { findPreset } from '../knowledge/scenarios'
import { localRepository, type SavedPlayer } from '../storage/localRepository'
import RallyCourt from '../visualization/RallyCourt'
import PlayerEditor from './PlayerEditor'

const first = findPreset('attack-formation')!
const makeInitial = () => createRallySession(
  crypto.randomUUID(), '我的连续回合', first.cards, first.court, first.context, new Date().toISOString(),
)
const allAutomatic = (): MovementConstraints => ({
  A: { kind: 'auto' }, B: { kind: 'auto' }, C: { kind: 'auto' }, D: { kind: 'auto' },
})
const point3 = (point: Point, z: number): Point3 => ({ ...point, z })
const formatPosition = (point: Point) => point.x.toFixed(1) + ' / ' + point.y.toFixed(1) + ' 米'

export default function SandboxPage({ savedPlayers, onSavePlayer }: {
  savedPlayers: SavedPlayer[]
  onSavePlayer: (card: PlayerCard) => Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = useState<RallySession>(makeInitial)
  const [mode, setMode] = useState<'setup' | 'draw'>('setup')
  const [draft, setDraft] = useState<ShotDraft | null>(null)
  const [shotType, setShotType] = useState<ShotType | null>(null)
  const [inferred, setInferred] = useState<ShotType[]>([])
  const [evaluation, setEvaluation] = useState<ShotEvaluation | null>(null)
  const [chosenReceiver, setChosenReceiver] = useState<string | null>(null)
  const [constraints, setConstraints] = useState<MovementConstraints>(allAutomatic)
  const [editingId, setEditingId] = useState<PlayerId | null>(null)
  const [showCoverage, setShowCoverage] = useState(false)
  const [showIdeal, setShowIdeal] = useState(false)
  const [focusTeam, setFocusTeam] = useState<1 | 2>(1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(1)
  const [stageMode, setStageMode] = useState(false)
  const [compareId, setCompareId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const progressRef = useRef(1)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const loadedSessionRef = useRef<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const rallyId = query.get('session')
    const legacyId = query.get('scenario')
    if (rallyId) {
      if (rallyId === loadedSessionRef.current) return
      void localRepository.listRallies().then((items) => {
        const found = items.find((item) => item.id === rallyId)
        if (found) {
          loadedSessionRef.current = rallyId
          setSession(found)
          setMode('draw')
          setProgress(1)
        } else setNotice('没有找到该回合存档。')
      }).catch(() => setNotice('读取回合存档失败。'))
    } else if (legacyId) {
      loadedSessionRef.current = null
      void localRepository.listScenarios().then((items) => {
        const found = items.find((item) => item.id === legacyId)
        if (found) {
          setSession(createRallySession(crypto.randomUUID(), found.name + '（新回合）', found.cards, found.court, found.context, new Date().toISOString()))
          setMode('setup')
          setProgress(1)
        } else setNotice('没有找到原教学局面。')
      }).catch(() => setNotice('读取原教学局面失败。'))
    }
  }, [location.search])

  useEffect(() => {
    if (!playing || !session.currentNodeId) return
    const node = session.nodes[session.currentNodeId]
    if (!node) return
    const start = performance.now()
    const initial = progressRef.current
    const duration = Math.max(300, node.evaluation.flightSeconds * node.outcome.terminalProgress * 1200)
    let frame = 0
    const tick = (now: number) => {
      const next = Math.min(1, initial + (now - start) * speed / duration)
      progressRef.current = next
      setProgress(next)
      if (next >= 1) { setPlaying(false); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, session, speed])

  const position = useMemo(() => sessionPosition(session), [session])
  const currentCourt = position.court
  const currentContext = position.context
  const path = useMemo(() => activePath(session), [session])
  const currentNode = session.currentNodeId ? session.nodes[session.currentNodeId] : null
  const ended = hasEnded(session)
  const suggestions = useMemo(() => ended ? [] : analyze(
    currentCourt, session.cards, { ...currentContext, shotIndex: 0 },
  ).recommendations, [ended, currentCourt, currentContext, session.cards])
  const selectedOutcome = evaluation
    ? evaluation.receiverCandidates.find((item) => item.receiver?.playerId === chosenReceiver)
      ?? evaluation.assumedReceiverOptions.find((item) => item.receiver?.playerId === chosenReceiver)
      ?? (evaluation.receiverCandidates.length <= 1 ? evaluation.defaultOutcome : null)
    : null
  const displayOutcome = evaluation ? selectedOutcome : currentNode?.outcome ?? null
  const displayShot = evaluation?.confirmedShot
    ?? (draft && shotType ? confirmDraft(draft, shotType) : null)
    ?? currentNode?.evaluation.confirmedShot ?? null
  const displayCourt = currentNode && progress < 1 && !draft && !evaluation
    ? currentNode.startCourt : currentCourt
  const displayProgress = evaluation || draft ? 0 : progress
  const viewedNode = currentNode
  const compareNode = compareId ? session.nodes[compareId] : null

  const resetDraft = () => {
    setDraft(null); setShotType(null); setInferred([]); setEvaluation(null); setChosenReceiver(null)
  }
  const persist = (next: RallySession): Promise<void> => {
    setSession(next)
    const task = saveQueue.current.catch(() => undefined).then(() => localRepository.saveRally(next))
    saveQueue.current = task
    void task.catch(() => setNotice('本地保存失败，请检查浏览器存储空间。'))
    return task
  }
  const updateInitialCourt = (next: CourtState) => {
    if (Object.keys(session.nodes).length) return
    setSession((previous) => ({ ...previous, initialCourt: next, initialContext: {
      ...previous.initialContext, shotIndex: 0,
      ...(previous.initialContext.phase === 'serve' ? {
        serverId: next.hitterId, servingTeam: teamOf(next.hitterId),
        receiverId: previous.initialContext.receiverId
          && teamOf(previous.initialContext.receiverId) !== teamOf(next.hitterId)
          ? previous.initialContext.receiverId : teamOf(next.hitterId) === 1 ? 'C' : 'A',
      } : {}),
    } }))
    resetDraft()
  }
  const selectHitter = (id: PlayerId) => {
    if (Object.keys(session.nodes).length) {
      if (currentCourt.hitterId !== id) setNotice('下一拍击球者由上一拍的接球人选择决定；请回到上一拍更换接球人。')
      return
    }
    updateInitialCourt({ ...currentCourt, hitterId: id })
  }
  const movePlayer = (id: PlayerId, point: Point) => updateInitialCourt({
    ...currentCourt, players: { ...currentCourt.players, [id]: { ...currentCourt.players[id], ...point } },
  })
  const moveShuttle = (point: Point) => updateInitialCourt({
    ...currentCourt, shuttle: { ...currentCourt.shuttle, ...point },
  })
  const drawShot = (drawnTrajectory: Point[], target: Point) => {
    if (ended) { setNotice('该回合已结束。请撤销或从历史节点创建新分支。'); return }
    const source = currentCourt.shuttle.expectedContactPoint ?? currentCourt.shuttle
    const next: ShotDraft = {
      drawnTrajectory, target: point3(target, 0.12),
      contactPoint: { x: source.x, y: source.y, z: source.z },
      speed: 'medium', trajectory: 'arc',
      contactSide: currentCourt.contactSide,
      initiative: currentContext.initiative === 'defence' ? 'passive' : 'active',
      extremeLine: false, assumeContact: false,
    }
    const options = inferShotTypes(currentCourt, currentContext, next.target)
    setDraft({ ...next, ...defaultShotMotion(options[0]) })
    setInferred(options); setShotType(options[0]); setEvaluation(null); setChosenReceiver(null)
    setPlaying(false)
  }
  const editDraft = (patch: Partial<ShotDraft>) => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setEvaluation(null); setChosenReceiver(null)
  }
  const evaluate = (assumeContact = draft?.assumeContact ?? false) => {
    if (!draft || !shotType) return
    const confirmed = confirmDraft({ ...draft, assumeContact }, shotType)
    const result = evaluateConfirmedShot({
      court: currentCourt, cards: session.cards, context: currentContext,
      shot: confirmed, lawVersion: activeLawVersion(), parameters: SIMULATION_PARAMETERS,
      evidenceDatasetVersion: EVIDENCE_DATASET_VERSION, movementConstraints: constraints,
    })
    setDraft(confirmed); setEvaluation(result)
    setChosenReceiver(result.receiverCandidates.length === 1 ? result.receiverCandidates[0].receiver!.playerId : null)
  }
  const commit = async () => {
    if (!evaluation || !selectedOutcome) return
    if (evaluation.receiverCandidates.length > 1 && !chosenReceiver) {
      setNotice('请先选择实际接球者。'); return
    }
    const next = appendRallyShot(session, evaluation, selectedOutcome, crypto.randomUUID(), new Date().toISOString())
    const saving = persist(next)
    resetDraft(); setMode('draw'); setProgress(0); progressRef.current = 0
    setPlaying(true); setCompareId(null)
    try { await saving } catch { return }
    loadedSessionRef.current = next.id
    navigate('/board?session=' + next.id, { replace: true })
  }
  const selectNode = (id: string | null) => {
    const next = selectHistoryNode(session, id)
    persist(next); resetDraft(); setPlaying(false); setProgress(1); progressRef.current = 1
  }
  const undo = () => {
    const next = undoRally(session)
    persist(next); resetDraft(); setPlaying(false); setProgress(1); progressRef.current = 1
  }
  const redo = () => {
    const next = redoRally(session)
    if (next === session && childrenOf(session, session.currentNodeId).length > 1) {
      setNotice('这里有多个分支，请在回合记录中选择。')
    }
    persist(next); resetDraft(); setPlaying(false); setProgress(1); progressRef.current = 1
  }
  const updateCard = (card: PlayerCard) => {
    if (Object.keys(session.nodes).length) {
      const nextCards: Cards = { ...session.cards, [card.id]: card }
      const fresh = createRallySession(crypto.randomUUID(), session.name + '（能力调整）', nextCards, currentCourt,
        { ...currentContext, shotIndex: 0 }, new Date().toISOString())
      setSession(fresh); setMode('setup'); resetDraft()
      loadedSessionRef.current = null
      navigate('/board', { replace: true })
      setNotice('球员能力已更新，并从当前局面创建新回合；原历史保持不变。')
    } else setSession((previous) => ({ ...previous, cards: { ...previous.cards, [card.id]: card } }))
  }
  const save = async () => {
    const name = window.prompt('回合名称', session.name)?.trim()
    if (!name) return
    const next = { ...session, name, updatedAt: new Date().toISOString() }
    try { await persist(next) } catch { return }
    loadedSessionRef.current = next.id
    navigate('/board?session=' + next.id, { replace: true })
    setNotice('完整回合已保存到本设备浏览器。')
  }
  const newSession = () => {
    setSession(createRallySession(crypto.randomUUID(), '我的连续回合', session.cards, currentCourt,
      { ...currentContext, shotIndex: 0 }, new Date().toISOString()))
    loadedSessionRef.current = null
    setMode('setup'); resetDraft(); setPlaying(false); setProgress(1)
    navigate('/board', { replace: true })
  }
  const endManually = () => {
    if (!session.currentNodeId) return
    persist({ ...session, manuallyEndedAt: session.currentNodeId, updatedAt: new Date().toISOString() })
    setNotice('已手动结束本回合。')
  }
  const play = () => {
    if (!currentNode) return
    if (playing) { setPlaying(false); return }
    if (progress >= 1) { setProgress(0); progressRef.current = 0 }
    else progressRef.current = progress
    setPlaying(true)
  }
  const setStage = (value: number) => {
    setPlaying(false); setStageMode(true); setProgress(value); progressRef.current = value
  }
  const changeSpeed = (next: number) => {
    progressRef.current = progress; setSpeed(next)
  }

  return <main className="board-page sandbox-page">
    <aside className={'left-rail sandbox-rail ' + (settingsOpen ? 'mobile-open' : '')}>
      <section className="rail-section">
        <div className="rail-title"><h2>回合设置</h2><span className="format-label">{FORMAT_LABELS[competitionFormat(session.cards)]}</span></div>
        <p className="inline-note">先摆放四人和球，选择击球者，再进入画线。球员与球的坐标单位为米。</p>
        <div className="sandbox-toolbar">
          <button className={mode === 'setup' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('setup')} disabled={Boolean(path.length)}>摆放局面</button>
          <button className={mode === 'draw' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('draw')} disabled={ended}>画球路</button>
        </div>
        <label className="sandbox-label">当前击球者
          <select value={currentCourt.hitterId} disabled={Boolean(path.length)} onChange={(event) => selectHitter(event.target.value as PlayerId)}>
            {PLAYER_IDS.map((id) => <option key={id} value={id}>{id} · {session.cards[id].name}</option>)}
          </select>
        </label>
        <label className="sandbox-label">击球阶段
          <select value={currentContext.phase} disabled={Boolean(path.length)} onChange={(event) => {
            const phase = event.target.value as typeof currentContext.phase
            setSession((previous) => ({ ...previous, initialContext: phase === 'serve'
              ? { ...previous.initialContext, phase, serverId: currentCourt.hitterId,
                  servingTeam: teamOf(currentCourt.hitterId), servingScore: previous.initialContext.servingScore ?? 0,
                  receiverId: previous.initialContext.receiverId ?? (teamOf(currentCourt.hitterId) === 1 ? 'C' : 'A') }
              : { ...previous.initialContext, phase } }))
          }}>
            <option value="serve">发球</option><option value="return">接发</option><option value="third">第三拍</option><option value="rally">相持</option>
          </select>
        </label>
        {currentContext.phase === 'serve' && <>
          <label className="sandbox-label">发球方比分
            <input type="number" min="0" step="1" disabled={Boolean(path.length)} value={currentContext.servingScore ?? 0}
              onChange={(event) => setSession((previous) => ({ ...previous, initialContext: {
                ...previous.initialContext, servingScore: Math.max(0, Math.floor(Number(event.target.value) || 0)),
              } }))}/>
          </label>
          <label className="sandbox-label">指定接发球员
            <select disabled={Boolean(path.length)} value={currentContext.receiverId ?? (teamOf(currentCourt.hitterId) === 1 ? 'C' : 'A')}
              onChange={(event) => setSession((previous) => ({ ...previous, initialContext: {
                ...previous.initialContext, receiverId: event.target.value as PlayerId,
              } }))}>
              {PLAYER_IDS.filter((id) => teamOf(id) !== teamOf(currentCourt.hitterId))
                .map((id) => <option key={id} value={id}>{id} · {session.cards[id].name}</option>)}
            </select>
          </label>
        </>}
        <label className="sandbox-label">球的接触高度（米）
          <input type="number" min="0.1" max="6" step="0.1" disabled={Boolean(path.length)} value={currentCourt.shuttle.z}
            onChange={(event) => updateInitialCourt({ ...currentCourt, shuttle: { ...currentCourt.shuttle, z: Number(event.target.value) } })}/>
        </label>
        <div className="sandbox-toolbar"><button className="secondary-button" onClick={save}>保存回合</button><button className="secondary-button" onClick={newSession}>新建回合</button></div>
      </section>
      <section className="rail-section player-section">
        <div className="rail-title"><h2>场上球员</h2></div>
        {PLAYER_IDS.map((id) => <button key={id} className="player-list-item" onClick={() => setEditingId(id)}>
          <span className={'player-avatar team-' + (teamOf(id) === 1 ? 'one' : 'two')}>{id}</span>
          <span><strong>{session.cards[id].name}</strong><small>{teamOf(id) === 1 ? 'A / B' : 'C / D'} · 编辑能力</small></span>
        </button>)}
      </section>
      <section className="rail-section">
        <div className="rail-title"><h2>运动约束</h2></div>
        <p className="inline-note">“保持原位”会真正保留 T2 位置，并影响下一拍。</p>
        {PLAYER_IDS.map((id) => <label className="constraint-row" key={id}>
          <input type="checkbox" checked={constraints[id].kind === 'hold'} onChange={(event) => {
            setConstraints((previous) => ({ ...previous, [id]: { kind: event.target.checked ? 'hold' : 'auto' } }))
            setEvaluation(null)
          }}/>
          {id} 保持原位
        </label>)}
      </section>
    </aside>

    <section className="board-center">
      <div className="board-top"><div><p className="section-eyebrow">连续双打回合 · 第 {currentContext.shotIndex + 1} 拍</p><h1>画出这一拍，看懂四人怎么移动</h1>
        <p>球路由你决定。系统分别评价规则、执行难度与战术价值，并保留真实跑位。</p></div>
        <div className="board-top-actions">
          <button className="secondary-button" onClick={() => setSettingsOpen((value) => !value)}>设置与球员</button>
          <button className="secondary-button" onClick={() => setMode('draw')} disabled={ended}>画球路</button>
          <button className="secondary-button" onClick={save}>保存</button>
        </div>
      </div>
      <RallyCourt court={displayCourt} mode={playing ? 'playback' : mode}
        shot={displayShot} outcome={displayOutcome} progress={displayProgress} focusTeam={focusTeam}
        shuttleTrajectory={evaluation?.shuttleTrajectory ?? currentNode?.evaluation.shuttleTrajectory}
        showCoverage={showCoverage} showIdeal={showIdeal}
        onSelectHitter={selectHitter} onMovePlayer={movePlayer} onMoveShuttle={moveShuttle} onDraw={drawShot}/>
      <div className="board-under sandbox-under">
        <label><input type="checkbox" checked={showCoverage} onChange={(event) => setShowCoverage(event.target.checked)}/> 显示覆盖范围</label>
        <label><input type="checkbox" checked={showIdeal} onChange={(event) => setShowIdeal(event.target.checked)}/> 理想位置</label>
        <label>关注组合 <select value={focusTeam} onChange={(event) => setFocusTeam(Number(event.target.value) as 1 | 2)}><option value="1">A / B</option><option value="2">C / D</option></select></label>
        <Link to="/sources">战术依据 →</Link>
      </div>
      {draft && <section className="shot-confirm" aria-label="确认球路">
        <div className="rail-title"><h2>确认本拍意图</h2><button className="small-button" onClick={resetDraft}>取消画线</button></div>
        <p>击球者位置：{formatPosition(currentCourt.players[currentCourt.hitterId])}；羽毛球位置：{formatPosition(currentCourt.shuttle)}；预计接触点／出球起点：{formatPosition(draft.contactPoint)}；落点：{formatPosition(draft.target)}；距离约 {distance(draft.contactPoint, draft.target).toFixed(1)} 米。</p>
        <p>{inferred.length > 1 ? '仅凭画线无法确定技术细节。可能是：' : '系统推测：'}{inferred.map((item) => SHOT_LABELS[item]).join('、')}。请选择并确认。</p>
        <div className="shot-form">
          <label>球种<select value={shotType ?? ''} onChange={(event) => {
            const selected = event.target.value as ShotType
            setShotType(selected); editDraft(defaultShotMotion(selected))
          }}>
            {Object.entries(SHOT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>速度<select value={draft.speed} onChange={(event) => editDraft({ speed: event.target.value as ShotDraft['speed'] })}>
            <option value="slow">慢</option><option value="medium">中</option><option value="fast">快</option>
          </select></label>
          <label>轨迹<select value={draft.trajectory} onChange={(event) => editDraft({ trajectory: event.target.value as ShotDraft['trajectory'] })}>
            <option value="flat">平</option><option value="arc">弧线</option><option value="downward">下压</option>
          </select></label>
        </div>
        <details><summary>高级设置</summary><div className="shot-form">
          <label>接触高度（米）<input type="number" step="0.1" value={draft.contactPoint.z} onChange={(event) => editDraft({ contactPoint: { ...draft.contactPoint, z: Number(event.target.value) } })}/></label>
          <label>接触点 X（米）<input type="number" step="0.1" value={draft.contactPoint.x} onChange={(event) => editDraft({ contactPoint: { ...draft.contactPoint, x: Number(event.target.value) } })}/></label>
          <label>接触点 Y（米）<input type="number" step="0.1" value={draft.contactPoint.y} onChange={(event) => editDraft({ contactPoint: { ...draft.contactPoint, y: Number(event.target.value) } })}/></label>
          <label>落点 X（米）<input type="number" step="0.1" value={draft.target.x} onChange={(event) => editDraft({ target: { ...draft.target, x: Number(event.target.value) } })}/></label>
          <label>落点 Y（米）<input type="number" step="0.1" value={draft.target.y} onChange={(event) => editDraft({ target: { ...draft.target, y: Number(event.target.value) } })}/></label>
          <label>落点高度（米）<input type="number" min="0" step="0.1" value={draft.target.z} onChange={(event) => editDraft({ target: { ...draft.target, z: Number(event.target.value) } })}/></label>
          <label>过网高度（米，可选）<input type="number" min="0" step="0.1" value={draft.netCrossingHeight ?? ''} onChange={(event) => editDraft({ netCrossingHeight: event.target.value ? Number(event.target.value) : undefined })}/></label>
          <label>正反手<select value={draft.contactSide} onChange={(event) => editDraft({ contactSide: event.target.value as ShotDraft['contactSide'] })}><option value="forehand">正手</option><option value="backhand">反手</option></select></label>
          <label>主动性<select value={draft.initiative} onChange={(event) => editDraft({ initiative: event.target.value as ShotDraft['initiative'] })}><option value="active">主动</option><option value="passive">被动</option></select></label>
          <label>明确结束结果<select value={draft.declaredEndReason ?? ''} onChange={(event) => editDraft({ declaredEndReason: event.target.value ? event.target.value as ShotDraft['declaredEndReason'] : null })}>
            <option value="">按球路判断</option><option value="net">触网</option><option value="out">出界</option><option value="ground">落地</option><option value="invalid">击球无效</option>
          </select></label>
        </div><label className="constraint-row"><input type="checkbox" checked={draft.extremeLine} onChange={(event) => editDraft({ extremeLine: event.target.checked })}/> 极限线路</label></details>
        <button className="primary-button" onClick={() => evaluate()}>确认球种并分析这一拍</button>
      </section>}
      {ended && <p className="rally-ended">{session.manuallyEndedAt === session.currentNodeId ? '本回合已手动结束。' : END_LABELS[currentNode?.outcome.endReason ?? 'manual']} 可以撤销，或从历史节点创建新分支。</p>}
    </section>

    <aside className="analysis-panel sandbox-analysis" aria-label="回合分析">
      <div className="panel-heading"><div><p className="section-eyebrow">双人配合优先</p><h2>逐拍分析</h2></div></div>
      {!evaluation && !viewedNode && <div className="analysis-empty"><h3>先画出你想打的球</h3><p>画线后确认球种，再分别看规则、执行难度、战术价值和四人补位。</p></div>}
      {!evaluation && suggestions.length > 0 && <section className="sandbox-suggestions">
        <h3>系统有依据的候选</h3><p>也可以完全按自己的想法画球路。</p>
        {suggestions.map((item) => <button key={item.id} onClick={() => {
          const from = currentCourt.shuttle.expectedContactPoint ?? currentCourt.shuttle
          setDraft({
            drawnTrajectory: [point3(from, 0), point3(item.target, 0)], contactPoint: { ...from },
            target: { ...item.target }, ...defaultShotMotion(item.shotType),
            contactSide: currentCourt.contactSide, initiative: 'active', extremeLine: false, assumeContact: false,
          })
          setShotType(item.shotType); setInferred([item.shotType]); setEvaluation(null); setMode('draw')
        }}>{item.title} · {item.targetZone}</button>)}
      </section>}
      {(evaluation ?? viewedNode?.evaluation) && (() => {
        const result = evaluation ?? viewedNode!.evaluation
        const outcome = selectedOutcome ?? viewedNode?.outcome ?? null
        return <div className="sandbox-result">
          <section><h3>① 规则与物理成立性</h3><strong>{result.physicalRuleValidity.status === 'valid' ? '当前可继续判断' : result.physicalRuleValidity.status === 'assumed' ? '训练假设' : '存在明确障碍'}</strong>
            {result.physicalRuleValidity.reasons.map((reason) => <p key={reason}>{reason}</p>)}
            {evaluation && result.physicalRuleValidity.status === 'invalid' && result.physicalRuleValidity.reasons.some((reason) => reason.includes('距离该球员过远') || reason.includes('接触点与')) &&
              <button className="secondary-button" onClick={() => evaluate(true)}>假设能够接到并重新分析</button>}
          </section>
          <section><h3>② 执行难度</h3><strong>{DIFFICULTY_LABELS[result.executionDifficulty.level]}</strong>
            {result.executionDifficulty.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          </section>
          <section><h3>③ 战术质量</h3><strong>{TACTICAL_LABELS[result.tacticalQuality.level]}</strong>
            {result.tacticalQuality.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          </section>
          {evaluation && result.receiverCandidates.length === 2 && <section><h3>谁实际接这一拍？</h3>
            {result.receiverCandidates.map((item) => <button className="receiver-button" key={item.receiver!.playerId} onClick={() => setChosenReceiver(item.receiver!.playerId)}>
              {chosenReceiver === item.receiver!.playerId ? '✓ ' : ''}{item.receiver!.playerId} 可接 · {item.receiver!.explanation}
            </button>)}
          </section>}
          {evaluation && !result.receiverCandidates.length && result.assumedReceiverOptions.length > 0 && <section><h3>预计无人可达</h3>
            <p>默认按“未接到球”结束。也可以明确设定训练假设：</p>
            <button className="receiver-button" onClick={() => setChosenReceiver(null)}>按估计落地</button>
            {result.assumedReceiverOptions.map((item) => <button className="receiver-button" key={item.receiver!.playerId} onClick={() => setChosenReceiver(item.receiver!.playerId)}>
              {chosenReceiver === item.receiver!.playerId ? '✓ ' : ''}假设 {item.receiver!.playerId} 成功接到
            </button>)}
          </section>}
          {outcome && <><section><h3>④ 四人移动与职责</h3>
            {PLAYER_IDS.map((id) => <details key={id} open={teamOf(id) === focusTeam}>
              <summary>{id} · {ROLE_LABELS[outcome.roles[id]]} · {outcome.movements[id].arrival === 'partial' ? '尚未完全到位' : outcome.movements[id].arrival === 'held' ? '保持原位' : '已到位'}</summary>
              <p>理想：{formatPosition(outcome.movements[id].ideal)}；实际：{formatPosition(outcome.movements[id].actual)}。</p>
              <p><strong>为什么？</strong>{outcome.movements[id].explanation}</p>
            </details>)}
          </section><section><h3>⑤ 双人配合与阵型</h3>
            <p>关注组合：{focusTeam === 1 ? 'A / B' : 'C / D'} · {FORMATION_LABELS[outcome.formations[focusTeam]]}</p>
            {outcome.partnerships[focusTeam].reasons.map((reason) => <p key={reason}>{reason}</p>)}
            <p>另一组合：{FORMATION_LABELS[outcome.formations[focusTeam === 1 ? 2 : 1]]}</p>
          </section></>}
          <section><h3>依据与模型</h3><p>Evidence ID：{result.tacticalQuality.evidenceIds.join(' · ') || '当前无直接依据'}</p>
            <p>{result.executionDifficulty.modelNotice}</p><p>引擎 {result.engineVersion} · 参数 {result.simulationParametersVersion}</p></section>
          {evaluation && <button className="primary-button commit-button" disabled={!selectedOutcome} onClick={commit}>
            {selectedOutcome?.endReason ? '记录结束这一拍' : '执行这一拍并继续'}
          </button>}
        </div>
      })()}
    </aside>

    <section className="timeline sandbox-timeline" aria-label="连续回合记录与播放">
      <div className="timeline-heading"><strong>回合记录</strong><span>{path.length} 拍 · 可分支</span></div>
      <div className="timeline-steps">
        <button className={!session.currentNodeId ? 'current' : ''} onClick={() => selectNode(null)}>初始</button>
        {path.map((node) => <button key={node.id} className={node.id === session.currentNodeId ? 'current' : ''} onClick={() => selectNode(node.id)}>
          {node.index}. {node.startCourt.hitterId} → {SHOT_LABELS[node.evaluation.confirmedShot.shotType]}
        </button>)}
        {childrenOf(session, session.currentNodeId).filter((node) => !path.some((step) => step.id === node.id)).map((node) =>
          <button key={node.id} onClick={() => selectNode(node.id)}>分支：{SHOT_LABELS[node.evaluation.confirmedShot.shotType]}</button>)}
      </div>
      <div className="playback-actions">
        <button className="icon-button" onClick={undo} aria-label="撤销上一拍">↶</button>
        <button className="icon-button" onClick={redo} aria-label="重做下一拍">↷</button>
        <button className="play-button" onClick={play} aria-label={playing ? '暂停' : '播放'}>{playing ? 'Ⅱ' : '▶'}</button>
        <div className="speed-select">{[0.5, 1, 2].map((value) => <button key={value} className={speed === value ? 'active' : ''} onClick={() => changeSpeed(value)}>{value}×</button>)}</div>
      </div>
      <div className="stage-controls"><label><input type="checkbox" checked={stageMode} onChange={(event) => setStageMode(event.target.checked)}/> 逐阶段讲解</label>
        {stageMode && [0, 0.35, 0.7, 1].map((value, index) => <button key={value} onClick={() => setStage(value)}>{['击球', '飞行', '准备接球', '形成阵型'][index]}</button>)}
      </div>
      {currentNode && <div className="branch-actions">
        <button onClick={() => selectNode(currentNode.parentId)}>从这一拍之前尝试另一种打法</button>
        <button onClick={endManually} disabled={ended}>手动结束回合</button>
        {childrenOf(session, currentNode.parentId).filter((item) => item.id !== currentNode.id).map((item) =>
          <button key={item.id} onClick={() => setCompareId(item.id)}>与{SHOT_LABELS[item.evaluation.confirmedShot.shotType]}分支比较</button>)}
      </div>}
      {viewedNode && compareNode && <div className="branch-comparison"><strong>分支跑位对比</strong>
        {PLAYER_IDS.filter((id) => teamOf(id) === focusTeam).map((id) => <p key={id}>{id}：当前 {formatPosition(viewedNode.outcome.movements[id].actual)}；另一分支 {formatPosition(compareNode.outcome.movements[id].actual)}</p>)}
        <p>阵型：{FORMATION_LABELS[viewedNode.outcome.formations[focusTeam]]} / {FORMATION_LABELS[compareNode.outcome.formations[focusTeam]]}</p>
      </div>}
    </section>
    {editingId && <PlayerEditor card={session.cards[editingId]} savedPlayers={savedPlayers} onChange={updateCard}
      onClose={() => setEditingId(null)} onSaveLibrary={onSavePlayer}
      onLoadLibrary={(entry) => updateCard({ ...structuredClone(entry.card), id: editingId })}/>}
    {notice && <div role="status" className="toast" onClick={() => setNotice('')}>{notice}<button aria-label="关闭提示">×</button></div>}
    <span className="sr-only">球场宽 {COURT_WIDTH} 米，长 {COURT_LENGTH} 米。</span>
  </main>
}
