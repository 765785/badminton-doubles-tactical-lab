import { useState } from 'react'
import { ATTRIBUTE_LABELS, GENERAL_LEVEL_LABELS, attributesForLevel, type AttributeKey, type GeneralLevel, type PlayerCard } from '../domain/model'
import type { SavedPlayer } from '../storage/localRepository'

interface Props {
  card: PlayerCard
  savedPlayers: SavedPlayer[]
  onChange: (card: PlayerCard) => void
  onClose: () => void
  onSaveLibrary: (card: PlayerCard) => void
  onLoadLibrary: (entry: SavedPlayer) => void
}

export default function PlayerEditor({ card, savedPlayers, onChange, onClose, onSaveLibrary, onLoadLibrary }: Props) {
  const [tab, setTab] = useState<'simple' | 'detailed'>(card.skillMode)
  const setCard = (changes: Partial<PlayerCard>) => onChange({ ...card, ...changes })
  const changeLevel = (level: GeneralLevel) => setCard({ generalLevel: level, attributes: attributesForLevel(level), skillMode: 'simple' })
  const changeAttribute = (key: AttributeKey, value: number) => setCard({ skillMode: 'detailed', attributes: { ...card.attributes, [key]: value } })
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="player-modal" role="dialog" aria-modal="true" aria-label={`编辑球员 ${card.id}`}>
      <header className="modal-header"><div><p className="section-eyebrow">球员名片</p><h2>编辑球员 {card.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭球员编辑">×</button></header>
      <div className="modal-body">
        <div className="form-row"><label>姓名<input value={card.name} maxLength={24} onChange={(event) => setCard({ name: event.target.value })}/></label><label>性别<select value={card.gender} onChange={(event) => setCard({ gender: event.target.value as PlayerCard['gender'] })}><option value="male">男</option><option value="female">女</option></select></label><label>惯用手<select value={card.dominantHand} onChange={(event) => setCard({ dominantHand: event.target.value as PlayerCard['dominantHand'] })}><option value="right">右手</option><option value="left">左手</option></select></label></div>
        <p className="inline-note">性别仅用于阵容和教学语境，不改变能力数值。</p>
        <div className="segmented"><button className={tab === 'simple' ? 'active' : ''} onClick={() => setTab('simple')}>简易设置</button><button className={tab === 'detailed' ? 'active' : ''} onClick={() => setTab('detailed')}>详细能力</button></div>
        {tab === 'simple' ? <div className="form-block"><label>能力模板<select value={card.generalLevel} onChange={(event) => changeLevel(event.target.value as GeneralLevel)}>{Object.entries(GENERAL_LEVEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><p className="muted">选择模板会统一设置十八项能力；切换到详细能力可逐项修改。</p></div> : <div className="attribute-grid">{Object.entries(ATTRIBUTE_LABELS).map(([key, label]) => <label className="attribute-row" key={key}><span>{label}</span><input type="range" min="0" max="100" value={card.attributes[key as AttributeKey]} onChange={(event) => changeAttribute(key as AttributeKey, Number(event.target.value))}/><output>{card.attributes[key as AttributeKey]}</output></label>)}</div>}
        <div className="form-row optional-fields"><label>身高（厘米，可选）<input type="number" min="100" max="250" value={card.heightCm ?? ''} onChange={(event) => setCard({ heightCm: event.target.value ? Number(event.target.value) : undefined })}/></label><label>Reach（厘米，可选）<input type="number" min="80" max="300" value={card.reachCm ?? ''} onChange={(event) => setCard({ reachCm: event.target.value ? Number(event.target.value) : undefined })}/></label></div>
        {savedPlayers.length > 0 && <div className="form-block"><label>使用已保存的球员<select value="" onChange={(event) => { const entry = savedPlayers.find((item) => item.id === event.target.value); if (entry) onLoadLibrary(entry) }}><option value="">选择球员名片…</option>{savedPlayers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>}
      </div>
      <footer className="modal-actions"><button className="secondary-button" onClick={() => onSaveLibrary(card)}>保存到球员库</button><button className="primary-button" onClick={onClose}>完成</button></footer>
    </section>
  </div>
}
