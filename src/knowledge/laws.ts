import type { LawVersion } from '../domain/model'

// BWF 官方 Extranet 文档首页标明生效日；截止日由下一版已公布的生效日界定。
// 2027 版未通过 BWF 官方目录完成复核前不自动启用。
export const LAW_VERSIONS: LawVersion[] = [{
  rulesVersion: 'BWF Laws of Badminton V5.0 (2)',
  publishedAt: null,
  effectiveFrom: '2025-04-26',
  effectiveUntil: '2027-01-04',
  verifiedAt: '2026-09-29',
  officialUrl: 'https://extranet.bwf.sport/docs/document-system/81/1466/1470/Section%204.1%20-%20Laws%20of%20Badminton%20-%2026%20April%202025%20V5.0%20(2)%20.pdf',
  evidenceId: 'LAW_BWF_2025_01',
}]

export function activeLawVersion(date = new Date()): LawVersion | null {
  const day = date.toISOString().slice(0, 10)
  return LAW_VERSIONS.find((version) => version.effectiveFrom <= day && (!version.effectiveUntil || day < version.effectiveUntil)) ?? null
}
