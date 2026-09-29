import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FORMAT_LABELS, GENERAL_LEVEL_LABELS, PLAYER_IDS, competitionFormat, type AnalysisResult, type ChainStep, type CourtState, type PlayerCard, type PlayerId, type Point, type RallyContext, type ResponseOption, type TacticalRecommendation } from '../domain/model'
import { PRESETS } from '../knowledge/scenarios'
import CourtBoard from '../visualization/CourtBoard'
import AnalysisPanel from './AnalysisPanel'

interface Props {
  cards: Record<PlayerId, PlayerCard>
  court: CourtState
  context: RallyContext
  analysis: AnalysisResult
  analysisVisible: boolean
  selected: TacticalRecommendation | null
  chain: ChainStep[]
  playbackStep: ChainStep | null
  playbackIndex: number
  playbackProgress: number
  playing: boolean
  speed: number
  onSelectPreset: (id: string) => void
  onEditPlayer: (id: PlayerId) => void
  onMovePlayer: (id: PlayerId, point: Point) => void
  onMoveShuttle: (point: Point) => void
  onCourtChange: (court: CourtState) => void
  onContextChange: (context: RallyContext) => void
  onAnalyze: () => void
  onSelectRecommendation: (recommendation: TacticalRecommendation) => void
  onResponse: (recommendation: TacticalRecommendation, response: ResponseOption) => void
  onSave: () => void
  onPlay: () => void
  onPrevious: () => void
  onNext: () => void
  onRestart: () => void
  onSpeed: (speed: number) => void
}

export default function BoardPage(props: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const format = competitionFormat(props.cards)
  const situationLabel = { attack: '进攻', defence: '防守', neutral: '中性', transition: '转换' }[props.analysis.situation]
  const updateShuttle = (key: keyof CourtState['shuttle'], value: number | string) => props.onCourtChange({ ...props.court, shuttle: { ...props.court.shuttle, [key]: value } })
  return <main className="board-page">
    <aside className={`left-rail ${settingsOpen ? 'mobile-open' : ''}`}>
      <div className="rail-section"><div className="rail-title"><h2>预设局面</h2><button className="small-button" onClick={() => { props.onSelectPreset('attack-formation'); setSettingsOpen(false) }}>重置</button></div><div className="preset-list">{PRESETS.map((item, index) => <button key={item.id} onClick={() => { props.onSelectPreset(item.id); setSettingsOpen(false) }}><span className="preset-number">{String(index + 1).padStart(2, '0')}</span><span>{item.name}</span><span className="preset-chevron">›</span></button>)}</div></div>
      <div className="rail-section player-section"><div className="rail-title"><h2>场上球员</h2><span className="format-label">{FORMAT_LABELS[format]}</span></div>{PLAYER_IDS.map((id) => <button className="player-list-item" key={id} onClick={() => props.onEditPlayer(id)}><span className={`player-avatar team-${id === 'A' || id === 'B' ? 'one' : 'two'}`}>{id}</span><span><strong>{props.cards[id].name}</strong><small>{id === 'A' || id === 'B' ? '我方' : '对方'} · {props.cards[id].gender === 'male' ? '男' : '女'} · {GENERAL_LEVEL_LABELS[props.cards[id].generalLevel]}</small></span><span className="preset-chevron">›</span></button>)}</div>
      <details className="rail-section settings-section"><summary>局面设置</summary><div className="settings-grid"><label>当前击球者<select value={props.court.hitterId} onChange={(event) => props.onCourtChange({ ...props.court, hitterId: event.target.value as PlayerId })}>{PLAYER_IDS.map((id) => <option key={id} value={id}>{props.cards[id].name}（{id}）</option>)}</select></label><label>击球阶段<select value={props.context.phase} onChange={(event) => props.onContextChange({ ...props.context, phase: event.target.value as RallyContext['phase'] })}><option value="serve">发球</option><option value="return">接发球</option><option value="third">第三拍</option><option value="rally">相持</option></select></label><label>攻防主动权<select value={props.context.initiative} onChange={(event) => props.onContextChange({ ...props.context, initiative: event.target.value as RallyContext['initiative'] })}><option value="attack">进攻</option><option value="defence">防守</option><option value="neutral">中性</option><option value="transition">转换</option></select></label><label>球高度（米）<input type="number" min="0.1" max="6" step="0.1" value={props.court.shuttle.z} onChange={(event) => updateShuttle('z', Number(event.target.value))}/></label><label>球速<select value={props.court.shuttle.speed} onChange={(event) => updateShuttle('speed', event.target.value)}><option value="slow">慢</option><option value="medium">中</option><option value="fast">快</option></select></label><label>接触时机<select value={props.court.contactTiming} onChange={(event) => props.onCourtChange({ ...props.court, contactTiming: event.target.value as CourtState['contactTiming'] })}><option value="early">早</option><option value="normal">正常</option><option value="late">晚</option></select></label><label>正反手<select value={props.court.contactSide} onChange={(event) => props.onCourtChange({ ...props.court, contactSide: event.target.value as CourtState['contactSide'] })}><option value="forehand">正手</option><option value="backhand">反手</option></select></label><label>身体平衡<select value={props.court.balance} onChange={(event) => props.onCourtChange({ ...props.court, balance: event.target.value as CourtState['balance'] })}><option value="balanced">平衡</option><option value="stretched">拉伸</option><option value="offBalance">失衡</option></select></label>{props.context.phase === 'serve' && <><label>发球方比分<input type="number" min="0" value={props.context.servingScore ?? 0} onChange={(event) => props.onContextChange({ ...props.context, servingScore: Number(event.target.value) })}/></label><label>接发球员<select value={props.context.receiverId ?? 'C'} onChange={(event) => props.onContextChange({ ...props.context, receiverId: event.target.value as PlayerId })}>{PLAYER_IDS.filter((id) => (id === 'A' || id === 'B') !== (props.court.hitterId === 'A' || props.court.hitterId === 'B')).map((id) => <option key={id} value={id}>{id}</option>)}</select></label></>}</div></details>
    </aside>
    <section className="board-center"><div className="board-top"><div><p className="section-eyebrow">{format === 'training' ? '自定义训练组合' : `${FORMAT_LABELS[format]}教学`} · {situationLabel}</p><h1>这一拍，和搭档一起想</h1><p>调整球员与羽毛球，观察击球选择怎样改变双方的覆盖。</p></div><div className="board-top-actions"><button className="secondary-button mobile-settings" onClick={() => setSettingsOpen((value) => !value)}>{settingsOpen ? '收起设置' : '局面设置'}</button><button className="secondary-button" onClick={props.onSave}>保存局面</button></div></div><CourtBoard court={props.court} selected={props.selected} playbackStep={props.playbackStep} progress={props.playbackProgress} onPlayerMove={props.onMovePlayer} onShuttleMove={props.onMoveShuttle} onSelectPlayer={props.onEditPlayer}/><div className="board-under"><button className="primary-button analyze-button" onClick={() => { props.onAnalyze(); setAnalysisOpen(true) }}>分析这一拍</button><span>选择球场上的 A–D 可编辑球员名片。拖动球和球员后，分析会按新局面重新计算。</span><Link to="/sources">查看战术依据 →</Link></div></section>
    <AnalysisPanel result={props.analysis} visible={props.analysisVisible} mobileOpen={analysisOpen} selectedId={props.selected?.id ?? null} onSelect={(item) => { props.onSelectRecommendation(item); setAnalysisOpen(true) }} onResponse={props.onResponse} onClose={() => setAnalysisOpen(false)}/>
    <section className="timeline" aria-label="战术链播放"><div className="timeline-heading"><strong>逐拍推演</strong><span>{props.chain.length ? `${props.playbackIndex + 1} / ${props.chain.length}` : '选中方案后可以预览球路'}</span></div><div className="timeline-steps">{props.chain.length ? props.chain.map((step, index) => <span key={step.id} className={props.playbackIndex === index ? 'current' : ''}>{index + 1}. {step.title}</span>) : <span className="timeline-placeholder">发球 / 回球 / 第三拍 / 第四拍</span>}</div><div className="playback-actions"><button className="icon-button" onClick={props.onRestart} aria-label="重新播放">↺</button><button className="icon-button" onClick={props.onPrevious} aria-label="上一拍">◀|</button><button className="play-button" onClick={props.onPlay} aria-label={props.playing ? '暂停' : '播放'}>{props.playing ? 'Ⅱ' : '▶'}</button><button className="icon-button" onClick={props.onNext} aria-label="下一拍">|▶</button><div className="speed-select" aria-label="播放速度">{[.5, 1, 2].map((speed) => <button key={speed} className={props.speed === speed ? 'active' : ''} onClick={() => props.onSpeed(speed)}>{speed}×</button>)}</div></div></section>
  </main>
}
