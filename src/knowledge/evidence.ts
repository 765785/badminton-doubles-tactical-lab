export interface Evidence {
  id: string
  title: string
  type: '竞赛规则' | '教练教材'
  url: string
  detail: string
  summary: string
  applicability: string
}

const coachUrl = 'https://vbadminton.ru/sites/default/files/BWF_Coach_Manual_Level_1_English.pdf'

export const EVIDENCE: Record<string, Evidence> = {
  LAW_BWF_2025_01: {
    id: 'LAW_BWF_2025_01', title: 'BWF 竞赛规则 V5.0 (2)', type: '竞赛规则',
    url: 'https://extranet.bwf.sport/docs/document-system/81/1466/1470/Section%204.1%20-%20Laws%20of%20Badminton%20-%2026%20April%202025%20V5.0%20(2)%20.pdf',
    detail: '§1、§9、§11；2025-04-26 生效',
    summary: '双打球场、发球区与合法击球以当前生效版本为准。', applicability: '正式竞赛规则',
  },
  COACH_BWF_L1_2017_SERVE: {
    id: 'COACH_BWF_L1_2017_SERVE', title: 'BWF 一级教练手册：双打发接发', type: '教练教材',
    url: coachUrl, detail: '第二版，模块 8，PDF 页序约 188–193',
    summary: '低发球后发球者关注网前，搭档覆盖中后场；接发后的跟进需要考虑下一拍。', applicability: '发球、接发、第三拍',
  },
  COACH_BWF_L1_2017_ATTACK: {
    id: 'COACH_BWF_L1_2017_ATTACK', title: 'BWF 一级教练手册：双打进攻', type: '教练教材',
    url: coachUrl, detail: '第二版，模块 8，PDF 页序约 194–197',
    summary: '后场与前场各有覆盖职责；中路与直线是有条件的进攻选择，对角球可作为变化。', applicability: '后场进攻、前场封网',
  },
  COACH_BWF_L1_2017_DEFENCE: {
    id: 'COACH_BWF_L1_2017_DEFENCE', title: 'BWF 一级教练手册：双打防守', type: '教练教材',
    url: coachUrl, detail: '第二版，模块 8，PDF 页序约 197–199',
    summary: '左右防守分工与挡网、平抽转攻均须考虑球路和双方覆盖。', applicability: '防守、反击',
  },
  COACH_BWF_L1_2017_MIXED: {
    id: 'COACH_BWF_L1_2017_MIXED', title: 'BWF 一级教练手册：混双训练', type: '教练教材',
    url: coachUrl, detail: '第二版，模块 8，PDF 页序约 199–208',
    summary: '讨论混双发接发与前后轮转；教材中的传统性别职责仅为教学语境。', applicability: '混双训练，不赋予性别能力加成',
  },
}
