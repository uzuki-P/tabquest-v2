export type BossStage = "hp-100" | "hp-75" | "hp-50" | "hp-25"

export type BossSlug = "cafe-drink"

export interface BillBossAsset {
  src: string
  stage: BossStage
  label: string
  healthPct: number
}

export function getBillBossHealthPct(remaining: number, total: number): number {
  if (total <= 0) return 0
  const raw = (remaining / total) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function getBillBossStage(remaining: number, total: number): BossStage {
  const pct = getBillBossHealthPct(remaining, total)
  if (pct > 75) return "hp-100"
  if (pct > 50) return "hp-75"
  if (pct > 25) return "hp-50"
  return "hp-25"
}

export function getBillBossAsset(
  remaining: number,
  total: number,
  bossSlug: BossSlug = "cafe-drink"
): BillBossAsset {
  const healthPct = getBillBossHealthPct(remaining, total)
  const stage = getBillBossStage(remaining, total)
  const label =
    remaining <= 0
      ? "Defeated"
      : stage === "hp-100"
        ? "Full power"
        : stage === "hp-75"
          ? "Scuffed"
          : stage === "hp-50"
            ? "Critical"
            : "Almost down"

  return {
    src: `/bosses/${bossSlug}/${stage}.webp`,
    stage,
    label,
    healthPct,
  }
}
