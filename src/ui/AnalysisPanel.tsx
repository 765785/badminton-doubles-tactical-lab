import { Link } from 'react-router-dom'
import { LEVEL_LABELS, type AnalysisResult, type TacticalRecommendation, type ResponseOption } from '../domain/model'

interface Props {
  result: AnalysisResult | null
  visible: boolean
  selectedId: string | null
  onSelect: (item: TacticalRecommendation) => void
  onResponse: (item: TacticalRecommendation, response: ResponseOption) => void
  onClose?: () => void
  mobileOpen?: boolean
}

export default function AnalysisPanel({ result, visible, selectedId, onSelect, onResponse, onClose, mobileOpen }: Props) {
  const selected = result?.recommendations.find((item) => item.id === selectedId)
  return <aside id="analysis-panel" className={`analysis-panel ${visible ? 'analysis-visible' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="战术分析">
    <div className="panel-heading"><div><p className="section-eyebrow">这一拍怎么打</p><h2>战术分析</h2></div>{onClose && <button className="mobile-close icon-button" onClick={onClose} aria-label="收起分析">×</button>}</div>
    {!visible ? <div className="analysis-empty"><div className="empty-symbol">↗</div><h3>摆好局面后，分析这一拍</h3><p>点击球场上的球员可编辑能力。系统会同时考虑球路、搭档跑位与对方可能的回应。</p></div> : result?.issues.length ? <div className="analysis-issues"><h3>暂时无法给出建议</h3>{result.issues.map((issue) => <div className="issue" key={issue.code}><strong>{issue.message}</strong><p>{issue.action}</p></div>)}</div> : <>
      <p className="analysis-summary">根据当前设定找到 {result?.recommendations.length ?? 0} 个有依据的选择。推荐等级不是胜率。</p>
      <div className="recommendation-list">{result?.recommendations.map((item, index) => <button key={item.id} className={`recommendation-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => onSelect(item)}><span className="rec-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.targetZone}</small></span><span className={`rec-level ${item.level}`}>{LEVEL_LABELS[item.level]}</span></button>)}</div>
      {selected && <div className="recommendation-detail"><h3>{selected.title}</h3><p className="rec-simple">{selected.explanation.simple}</p><details><summary>查看高级分析</summary><p>{selected.explanation.advanced}</p></details><div className="detail-block"><h4>跑位与覆盖</h4><p><strong>击球者：</strong>{selected.hitterMovement.description}</p><p><strong>搭档：</strong>{selected.partnerMovement.description}</p></div><div className="detail-block risk"><h4>潜在风险</h4>{selected.risks.map((risk) => <p key={risk}>{risk}</p>)}</div><div className="detail-block"><h4>适用条件</h4>{selected.conditions.map((condition) => <p key={condition}>{condition}</p>)}</div><div className="detail-block"><h4>Evidence ID</h4><p>{selected.evidenceIds.join(' · ')}</p></div><Link className="evidence-link" to="/sources">查看资料来源 →</Link><div className="response-list"><h4>假设对手下一拍……</h4>{selected.expectedOpponentResponses.map((response) => <button key={response.id} onClick={() => onResponse(selected, response)} title={response.explanation}>{response.title} <span>继续推演 →</span></button>)}</div></div>}
    </>}
  </aside>
}
