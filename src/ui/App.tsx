import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { analyze } from '../engine/analyze'
import { finishGuidedTurn, prepareGuidedTurn, type GuidedTurn } from '../engine/guidedLesson'
import { EVIDENCE_DATASET_VERSION, SIMULATION_PARAMETERS } from '../engine/simulationParameters'
import type { ShotOutcome } from '../domain/rally'
import { EVIDENCE } from '../knowledge/evidence'
import { LAW_VERSIONS, activeLawVersion } from '../knowledge/laws'
import { PRESETS, findPreset } from '../knowledge/scenarios'
import { FORMAT_LABELS, competitionFormat, teamOf, type ChainStep, type CourtState, type PlayerCard, type PlayerId, type Point, type RallyContext, type ResponseOption, type SavedScenario, type TacticalRecommendation } from '../domain/model'
import { localRepository, type SavedPlayer } from '../storage/localRepository'
import BoardPage from './BoardPage'
import PlayerEditor from './PlayerEditor'
import SandboxPage from './SandboxPage'
import type { RallySession } from '../domain/rally'

const first = findPreset('return-follow')!

const INTRO = [
  { id: 'attack-formation', number: '01', title: '双打进攻为什么前后站？', text: '看清后场组织与前场封网的分工。' },
  { id: 'defence-formation', number: '02', title: '双打防守为什么左右站？', text: '理解直线、中路和搭档覆盖。' },
  { id: 'smash-front', number: '03', title: '后场杀球时搭档应该去哪？', text: '把击球和下一拍准备连起来。' },
  { id: 'return-follow', number: '04', title: '接发球以后两个人怎么跑？', text: '从接发开始争取主动。' },
  { id: 'middle-smash', number: '05', title: '什么情况下应该打中路？', text: '观察对方分工与中间空当。' },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [cards, setCards] = useState(first.cards)
  const [court, setCourt] = useState(first.court)
  const [context, setContext] = useState(first.context)
  const [chain, setChain] = useState<ChainStep[]>([])
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<PlayerId | null>(null)
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([])
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [savedRallies, setSavedRallies] = useState<RallySession[]>([])
  const [currentSaved, setCurrentSaved] = useState<SavedScenario | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [playback, setPlayback] = useState({ index: 0, progress: 0 })
  const [pendingTurn, setPendingTurn] = useState<GuidedTurn | null>(null)
  const startPlaybackRef = useRef({ index: 0, progress: 0 })

  const result = useMemo(() => analyze(court, cards, context), [court, cards, context])
  const selected = result.recommendations.find((item) => item.id === selectedId) ?? null
  const playbackSteps = useMemo<ChainStep[]>(() => {
    if (!selected) return chain
    return [...chain, { id: 'preview', index: context.shotIndex + 1, hitterId: court.hitterId, shotType: selected.shotType, title: selected.title, from: court.shuttle, to: selected.target, hitterMovement: selected.hitterMovement, partnerMovement: selected.partnerMovement, evidenceIds: selected.evidenceIds }]
  }, [chain, selected, context.shotIndex, court.hitterId, court.shuttle])

  useEffect(() => { void refreshSaved() }, [])
  useEffect(() => { if (location.pathname === '/saved') void refreshSaved() }, [location.pathname])
  async function refreshSaved() {
    try {
      const [players, scenarios, rallies] = await Promise.all([localRepository.listPlayers(), localRepository.listScenarios(), localRepository.listRallies()])
      setSavedPlayers(players); setSavedScenarios(scenarios); setSavedRallies(rallies)
    } catch { setNotice('本设备的浏览器存储暂不可用，保存功能可能受限。') }
  }

  useEffect(() => {
    if (!playing || !playbackSteps.length) return
    const origin = performance.now()
    const start = startPlaybackRef.current
    let frame = 0
    const tick = (now: number) => {
      const position = (start.index + start.progress) * 1100 + (now - origin) * speed
      const max = playbackSteps.length * 1100
      if (position >= max) { setPlayback({ index: playbackSteps.length - 1, progress: 1 }); setPlaying(false); return }
      setPlayback({ index: Math.floor(position / 1100), progress: (position % 1100) / 1100 })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, playbackSteps.length])

  const selectPreset = (id: string) => {
    const preset = findPreset(id)
    if (!preset) return
    setCards(preset.cards); setCourt(preset.court); setContext(preset.context); setChain([])
    setAnalysisVisible(false); setSelectedId(null); setCurrentSaved(null); setPlaying(false); setPlayback({ index: 0, progress: 0 })
    navigate('/lesson')
  }
  const editCourt = (next: CourtState) => {
    setCourt(next); setChain([]); setSelectedId(null); setPlaying(false); setPlayback({ index: 0, progress: 0 })
    setContext((previous) => ({ ...previous, shotIndex: 0, ...(previous.phase === 'serve' ? { serverId: next.hitterId, servingTeam: teamOf(next.hitterId), receiverId: teamOf(next.hitterId) === 1 ? 'C' : 'A' } : {}) }))
  }
  const editContext = (next: RallyContext) => {
    const updated = next.phase === 'serve' ? { ...next, serverId: court.hitterId, servingTeam: teamOf(court.hitterId), receiverId: teamOf(court.hitterId) === 1 ? 'C' as const : 'A' as const, servingScore: next.servingScore ?? 0 } : next
    setContext({ ...updated, shotIndex: 0 }); setChain([]); setSelectedId(null); setPlaying(false); setPlayback({ index: 0, progress: 0 })
  }
  const movePlayer = (id: PlayerId, point: Point) => editCourt({ ...court, players: { ...court.players, [id]: { ...court.players[id], ...point } } })
  const moveShuttle = (point: Point) => editCourt({ ...court, shuttle: { ...court.shuttle, ...point } })
  const changeCard = (card: PlayerCard) => {
    setCards((previous) => ({ ...previous, [card.id]: card })); setSelectedId(null); setPlaying(false)
  }
  const chooseRecommendation = (item: TacticalRecommendation) => {
    const start = { index: chain.length, progress: 0 }
    setSelectedId(item.id); setPlayback(start); startPlaybackRef.current = start; setPlaying(true)
  }
  const chooseResponse = (item: TacticalRecommendation, response: ResponseOption) => {
    if (chain.length >= 4) return
    try {
      const turn = prepareGuidedTurn({
        court, cards, context, recommendation: item, response,
        lawVersion: activeLawVersion(), parameters: SIMULATION_PARAMETERS,
        evidenceDatasetVersion: EVIDENCE_DATASET_VERSION,
      })
      if (turn.secondEvaluation.receiverCandidates.length > 1
          || turn.secondEvaluation.assumedReceiverOptions.length > 0) {
        setPendingTurn(turn)
        return
      }
      applyGuidedTurn(turn, turn.secondEvaluation.receiverCandidates[0] ?? turn.secondEvaluation.defaultOutcome)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本拍无法继续推演。')
    }
  }
  const applyGuidedTurn = (turn: GuidedTurn, outcome: ShotOutcome) => {
    const next = finishGuidedTurn(turn, outcome, [crypto.randomUUID(), crypto.randomUUID()])
    const newChain = [...chain, ...next.steps].slice(0, 4)
    setCourt(next.court); setContext(next.context); setChain(newChain); setSelectedId(null); setAnalysisVisible(true)
    setPendingTurn(null)
    const index = Math.max(0, newChain.length - 2)
    setPlayback({ index, progress: 0 }); startPlaybackRef.current = { index, progress: 0 }; setPlaying(true)
  }
  const beginPlay = () => {
    if (!playbackSteps.length) return
    if (playing) { setPlaying(false); return }
    const restart = playback.progress >= 1 && playback.index === playbackSteps.length - 1
    const initial = restart ? { index: 0, progress: 0 } : playback
    setPlayback(initial); startPlaybackRef.current = initial; setPlaying(true)
  }
  const jump = (index: number) => {
    const next = { index: Math.max(0, Math.min(playbackSteps.length - 1, index)), progress: 0 }
    setPlayback(next); startPlaybackRef.current = next; setPlaying(false)
  }
  const changeSpeed = (next: number) => { startPlaybackRef.current = playback; setSpeed(next) }
  const openSave = () => { setSaveName(currentSaved?.name ?? '我的双打局面'); setSaveOpen(true) }
  const saveScenario = async () => {
    if (!saveName.trim()) { setNotice('请先填写局面名称。'); return }
    try {
      const saved = await localRepository.saveScenario(saveName.trim(), cards, court, context, chain, currentSaved ?? undefined)
      setCurrentSaved(saved); setSaveOpen(false); setNotice('战术局面已保存到本设备浏览器。'); await refreshSaved()
    } catch { setNotice('保存失败。请检查浏览器是否允许本地存储。') }
  }
  const loadSaved = (saved: SavedScenario) => {
    if (saved.schemaVersion !== 1) { setNotice('该存档版本暂不受支持。'); return }
    setCards(structuredClone(saved.cards)); setCourt(structuredClone(saved.court)); setContext(structuredClone(saved.context)); setChain(structuredClone(saved.chain)); setCurrentSaved(saved)
    setSelectedId(null); setAnalysisVisible(false); setPlayback({ index: 0, progress: 0 }); setPlaying(false); navigate('/lesson')
  }
  const savePlayer = async (card: PlayerCard) => {
    try { await localRepository.savePlayer(card); setNotice('球员名片已保存到本设备。'); await refreshSaved() }
    catch { setNotice('保存球员名片失败，请检查浏览器存储。') }
  }
  const loadPlayer = (entry: SavedPlayer) => {
    if (!editingId) return
    if (entry.schemaVersion !== 1) { setNotice('该球员名片版本暂不受支持。'); return }
    changeCard({ ...structuredClone(entry.card), id: editingId })
  }
  const removeScenario = async (saved: SavedScenario) => {
    if (!window.confirm(`删除“${saved.name}”？此操作无法撤销。`)) return
    await localRepository.removeScenario(saved.id); if (currentSaved?.id === saved.id) setCurrentSaved(null); await refreshSaved()
  }
  const renameScenario = async (saved: SavedScenario) => {
    const name = window.prompt('新的局面名称', saved.name)?.trim()
    if (!name) return
    const renamed = await localRepository.renameScenario(saved, name); if (currentSaved?.id === saved.id) setCurrentSaved(renamed); await refreshSaved()
  }
  const duplicateScenario = async (saved: SavedScenario) => { await localRepository.duplicateScenario(saved); await refreshSaved() }

  return <div className="app-shell">
    <header className="site-header"><div className="header-inner"><Link to="/" className="brand"><span className="brand-mark">✦</span><span>羽毛球双打战术实验室</span></Link><nav aria-label="主导航"><NavLink to="/" end>基础教学</NavLink><NavLink to="/board">自由推演</NavLink><NavLink to="/saved">我的局面</NavLink><NavLink to="/sources">战术依据</NavLink></nav><span className="header-caption">用战术看懂比赛</span></div></header>
    <Routes>
      <Route path="/" element={<HomePage onSelect={selectPreset}/>}/>
      <Route path="/board" element={<SandboxPage savedPlayers={savedPlayers} onSavePlayer={savePlayer}/>}/>
      <Route path="/lesson" element={<BoardPage cards={cards} court={court} context={context} analysis={result} analysisVisible={analysisVisible} selected={selected} chain={playbackSteps} playbackStep={playbackSteps[playback.index] ?? null} playbackIndex={playback.index} playbackProgress={playback.progress} playing={playing} speed={speed} onSelectPreset={selectPreset} onEditPlayer={setEditingId} onMovePlayer={movePlayer} onMoveShuttle={moveShuttle} onCourtChange={editCourt} onContextChange={editContext} onAnalyze={() => setAnalysisVisible(true)} onSelectRecommendation={chooseRecommendation} onResponse={chooseResponse} onSave={openSave} onPlay={beginPlay} onPrevious={() => jump(playback.index - 1)} onNext={() => jump(playback.index + 1)} onRestart={() => jump(0)} onSpeed={changeSpeed}/>}/>
      <Route path="/saved" element={<SavedPage items={savedScenarios} rallies={savedRallies} onLoad={loadSaved} onRename={renameScenario} onDuplicate={duplicateScenario} onRemove={removeScenario} onOpenRally={(item) => navigate('/board?session=' + item.id)} onStartRally={(item) => navigate('/board?scenario=' + item.id)} onRemoveRally={async (item) => { if (!window.confirm('删除“' + item.name + '”？')) return; await localRepository.removeRally(item.id); await refreshSaved() }} onNew={() => navigate('/board')}/>}/>
      <Route path="/sources" element={<SourcesPage/>}/>
      <Route path="*" element={<HomePage onSelect={selectPreset}/>}/>
    </Routes>
    <footer className="site-footer">战术建议用于学习和讨论，不是比赛结果保证。数据保存在本设备浏览器中。</footer>
    {editingId && <PlayerEditor card={cards[editingId]} savedPlayers={savedPlayers} onChange={changeCard} onClose={() => setEditingId(null)} onSaveLibrary={savePlayer} onLoadLibrary={loadPlayer}/>}
    {saveOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaveOpen(false) }}><section className="save-modal" role="dialog" aria-modal="true" aria-label="保存战术局面"><h2>保存战术局面</h2><p>四名球员、站位、球、战术链和设置会一起保存在本设备。</p><label>局面名称<input value={saveName} maxLength={60} autoFocus onChange={(event) => setSaveName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveScenario() }}/></label><div className="modal-actions"><button className="secondary-button" onClick={() => setSaveOpen(false)}>取消</button><button className="primary-button" onClick={() => void saveScenario()}>保存</button></div></section></div>}
    {pendingTurn && <div className="modal-backdrop"><section className="save-modal" role="dialog" aria-modal="true" aria-label="选择下一拍接球者"><h2>谁实际接这一拍？</h2><p>引擎列出可达球员；由你决定谁接。若无人可达，可按估计落地或明确采用训练假设。</p>
      {pendingTurn.secondEvaluation.receiverCandidates.map((outcome) => <button className="receiver-button" key={outcome.receiver!.playerId} onClick={() => applyGuidedTurn(pendingTurn, outcome)}>{outcome.receiver!.playerId} 可接 · {outcome.receiver!.explanation}</button>)}
      {pendingTurn.secondEvaluation.assumedReceiverOptions.map((outcome) => <button className="receiver-button" key={outcome.receiver!.playerId} onClick={() => applyGuidedTurn(pendingTurn, outcome)}>假设 {outcome.receiver!.playerId} 成功接到</button>)}
      <div className="modal-actions"><button className="secondary-button" onClick={() => setPendingTurn(null)}>取消</button>{!pendingTurn.secondEvaluation.receiverCandidates.length && <button className="primary-button" onClick={() => applyGuidedTurn(pendingTurn, pendingTurn.secondEvaluation.defaultOutcome)}>按估计落地</button>}</div>
    </section></div>}
    {notice && <div role="status" className="toast" onClick={() => setNotice('')}>{notice}<button aria-label="关闭提示">×</button></div>}
  </div>
}

function HomePage({ onSelect }: { onSelect: (id: string) => void }) {
  return <main className="home-page"><section className="home-hero"><div className="home-copy"><h1>看懂这一拍，也看懂搭档为什么要跑</h1><p>选择一个真实双打局面，观察击球、覆盖与下一拍如何连在一起。每个建议都有适用条件和资料依据。</p><button className="primary-button" onClick={() => onSelect('return-follow')}>第一次使用？从双打基础教学开始 →</button><div className="hero-footnotes"><span>四名独立球员</span><span>斜视战术板</span><span>逐拍推演</span></div></div><div className="hero-diagram" aria-hidden="true"><div className="mini-court"><span className="mini-net"/><span className="mini-player a">A</span><span className="mini-player b">B</span><span className="mini-player c">C</span><span className="mini-player d">D</span><span className="mini-shuttle">◇</span><span className="mini-arrow">↗</span></div><p>后场进攻 · 前场封网</p></div></section><section className="lesson-section"><div className="section-heading"><div><p className="section-eyebrow">从看得懂开始</p><h2>五个双打基础问题</h2></div><Link to="/board">直接进入自由推演 →</Link></div><div className="lesson-list">{INTRO.map((item) => <button key={item.id} onClick={() => onSelect(item.id)}><span>{item.number}</span><strong>{item.title}</strong><small>{item.text}</small><b>进入局面 →</b></button>)}</div></section><section className="home-more"><h2>继续探索已核验的局面</h2><div>{PRESETS.filter((item) => !item.beginner).map((item) => <button key={item.id} onClick={() => onSelect(item.id)}><span>{item.category}</span>{item.name} →</button>)}</div></section></main>
}

function SavedPage({ items, rallies, onLoad, onRename, onDuplicate, onRemove, onOpenRally, onStartRally, onRemoveRally, onNew }: {
  items: SavedScenario[]
  rallies: RallySession[]
  onLoad: (item: SavedScenario) => void
  onRename: (item: SavedScenario) => void
  onDuplicate: (item: SavedScenario) => void
  onRemove: (item: SavedScenario) => void
  onOpenRally: (item: RallySession) => void
  onStartRally: (item: SavedScenario) => void
  onRemoveRally: (item: RallySession) => void
  onNew: () => void
}) {
  return <main className="content-page"><div className="page-heading"><div><p className="section-eyebrow">本设备浏览器</p><h1>我的战术局面与回合</h1><p>数据只保存在当前浏览器。清除浏览器数据可能导致内容丢失。</p></div><button className="primary-button" onClick={onNew}>新建连续回合</button></div>{!items.length && !rallies.length ? <div className="empty-library"><h2>还没有保存的内容</h2><p>创建回合或进入基础教学，保存后会出现在这里。</p><button className="primary-button" onClick={onNew}>开始推演</button></div> : <div className="saved-grid">
    {rallies.map((item) => <article key={item.id} className="saved-card"><div><h2>{item.name}</h2><p>{FORMAT_LABELS[competitionFormat(item.cards)]} · {Object.keys(item.nodes).length} 拍回合记录与分支</p><small>更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</small></div><div className="saved-actions"><button className="primary-button" onClick={() => onOpenRally(item)}>打开回合</button><button className="danger" onClick={() => onRemoveRally(item)}>删除</button></div></article>)}
    {items.map((item) => <article key={item.id} className="saved-card"><div><h2>{item.name}</h2><p>{FORMAT_LABELS[competitionFormat(item.cards)]} · {item.chain.length} 拍旧版教学链</p><small>更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</small></div><div className="saved-actions"><button className="primary-button" onClick={() => onLoad(item)}>打开教学</button><button onClick={() => onStartRally(item)}>从此局面新建回合</button><button onClick={() => onRename(item)}>重命名</button><button onClick={() => onDuplicate(item)}>复制</button><button className="danger" onClick={() => onRemove(item)}>删除</button></div></article>)}
  </div>}</main>
}

function SourcesPage() {
  const law = activeLawVersion()
  return <main className="content-page sources-page"><div className="page-heading"><div><p className="section-eyebrow">来源与边界</p><h1>战术依据 / 资料来源</h1><p>竞赛规则和战术教学原则分开记录。我们仅提供来源索引与自己的中文归纳。</p></div></div><section className="law-banner"><h2>当前竞赛规则依据版本</h2>{law ? <><strong>{law.rulesVersion}</strong><p>发布：{law.publishedAt ?? '未标明'}；生效：{law.effectiveFrom}；有效期至：{law.effectiveUntil ?? '待定'}；最近核验：{law.verifiedAt}。</p><p>Evidence ID：{law.evidenceId}</p><a href={law.officialUrl} target="_blank" rel="noreferrer">查看 BWF 官方规则文件 ↗</a></> : <p>当前没有完成核验的生效规则版本。规则敏感的战术分析已停止。</p>}<p className="inline-note">BWF 已发布 2027-01-04 生效的新版本；项目不会把现有版本当作永久规则。官方 Statutes 索引页在本次核验时无法访问，详见研究记录。</p></section><div className="source-list">{Object.values(EVIDENCE).map((item) => <article key={item.id}><div><span className="source-type">{item.type}</span><code>{item.id}</code></div><h2>{item.title}</h2><p>{item.summary}</p><p><strong>适用：</strong>{item.applicability} · {item.detail}</p><a href={item.url} target="_blank" rel="noreferrer">打开来源 ↗</a></article>)}</div><p className="source-note">教练教材包含训练情境和传统表述；页面不复制原文，也不把某种站位宣称为任何时候唯一正确的答案。资料如有更新，以最新生效的官方规则为准。已记录 {LAW_VERSIONS.length} 个经过官方文件核验的有效规则版本。</p></main>
}
