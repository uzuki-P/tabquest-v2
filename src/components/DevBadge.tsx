import { useEffect, useRef, useState } from "react"

const STORAGE_KEY = "tabquest:dev-badge-pos"
const MARGIN = 8

type Pos = { x: number; y: number }

/** Draggable "LOCAL DEV" badge. Rendered only by `vite dev` (never in prod builds). */
export function DevBadge() {
  const [pos, setPos] = useState<Pos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        setPos(saved)
        return
      }
    } catch {
      // ignore corrupt value
    }
    setPos({ x: MARGIN, y: window.innerHeight - 48 })
  }, [])

  if (!import.meta.env.DEV || !pos) return null

  const clamp = (x: number, y: number): Pos => {
    const w = ref.current?.offsetWidth ?? 120
    const h = ref.current?.offsetHeight ?? 32
    return {
      x: Math.min(Math.max(MARGIN, x), window.innerWidth - w - MARGIN),
      y: Math.min(Math.max(MARGIN, y), window.innerHeight - h - MARGIN),
    }
  }

  return (
    <div
      ref={ref}
      role="note"
      title="Local dev server, local D1 database. Drag to move."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy))
      }}
      onPointerUp={() => {
        drag.current = null
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
        } catch {
          // storage unavailable
        }
      }}
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
      className="fixed z-[200] cursor-grab select-none rounded bg-fuchsia-600 px-2.5 py-1 font-mono text-[12px] font-extrabold tracking-wider text-white shadow-lg ring-2 ring-white/70 active:cursor-grabbing"
    >
      LOCAL DEV &middot; LOCAL DB
    </div>
  )
}
