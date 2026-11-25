import { describe, expect, it } from "bun:test"
import {
  getBillBossAsset,
  getBillBossHealthPct,
  getBillBossStage,
} from "./boss"

describe("bill boss health stages", () => {
  it("clamps health percentage to 0..100 and handles zero total", () => {
    expect(getBillBossHealthPct(100_000, 100_000)).toBe(100)
    expect(getBillBossHealthPct(50_000, 100_000)).toBe(50)
    expect(getBillBossHealthPct(0, 100_000)).toBe(0)
    expect(getBillBossHealthPct(-5_000, 100_000)).toBe(0)
    expect(getBillBossHealthPct(120_000, 100_000)).toBe(100)
    expect(getBillBossHealthPct(10_000, 0)).toBe(0)
  })

  it("maps remaining health into 4 variants of 25% each", () => {
    expect(getBillBossStage(100, 100)).toBe("hp-100")
    expect(getBillBossStage(76, 100)).toBe("hp-100")
    expect(getBillBossStage(75, 100)).toBe("hp-75")
    expect(getBillBossStage(51, 100)).toBe("hp-75")
    expect(getBillBossStage(50, 100)).toBe("hp-50")
    expect(getBillBossStage(26, 100)).toBe("hp-50")
    expect(getBillBossStage(25, 100)).toBe("hp-25")
    expect(getBillBossStage(1, 100)).toBe("hp-25")
    expect(getBillBossStage(0, 100)).toBe("hp-25")
  })

  it("returns the matching asset path and condition label", () => {
    expect(getBillBossAsset(100, 100)).toEqual({
      src: "/bosses/cafe-drink/hp-100.webp",
      stage: "hp-100",
      label: "Full power",
      healthPct: 100,
    })
    expect(getBillBossAsset(60, 100)).toEqual({
      src: "/bosses/cafe-drink/hp-75.webp",
      stage: "hp-75",
      label: "Scuffed",
      healthPct: 60,
    })
    expect(getBillBossAsset(40, 100)).toEqual({
      src: "/bosses/cafe-drink/hp-50.webp",
      stage: "hp-50",
      label: "Critical",
      healthPct: 40,
    })
    expect(getBillBossAsset(10, 100)).toEqual({
      src: "/bosses/cafe-drink/hp-25.webp",
      stage: "hp-25",
      label: "Almost down",
      healthPct: 10,
    })
    expect(getBillBossAsset(0, 100)).toEqual({
      src: "/bosses/cafe-drink/hp-25.webp",
      stage: "hp-25",
      label: "Defeated",
      healthPct: 0,
    })
  })
})
