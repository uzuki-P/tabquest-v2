import { useCallback, useEffect, useRef, useState } from "react"
import type { ComponentPropsWithoutRef, CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface ScrollFadeProps extends ComponentPropsWithoutRef<"div"> {
  /** Edge fade height in pixels when scrollable in that direction. */
  fadeSize?: number
}

/**
 * Vertically scrollable container with hidden scrollbar and dynamic top/bottom
 * edge fades that only appear when content can actually scroll in that
 * direction. Never apply directly to a bordered `<DialogContent>` surface.
 */
export function ScrollFade({
  fadeSize = 20,
  className,
  style,
  onScroll,
  children,
  ...props
}: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ up: false, down: false })

  const updateEdges = useCallback(() => {
    const el = ref.current
    if (!el) return
    const up = el.scrollTop > 1
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setEdges((prev) =>
      prev.up === up && prev.down === down ? prev : { up, down }
    )
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    updateEdges()

    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)

    const mo = new MutationObserver(updateEdges)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [updateEdges])

  let maskImage: string | undefined
  if (edges.up && edges.down) {
    maskImage = `linear-gradient(to bottom, transparent 0, #000 ${fadeSize}px, #000 calc(100% - ${fadeSize}px), transparent 100%)`
  } else if (edges.up) {
    maskImage = `linear-gradient(to bottom, transparent 0, #000 ${fadeSize}px, #000 100%)`
  } else if (edges.down) {
    maskImage = `linear-gradient(to bottom, #000 0, #000 calc(100% - ${fadeSize}px), transparent 100%)`
  }

  const mergedStyle: CSSProperties = {
    ...style,
    ...(maskImage ? { WebkitMaskImage: maskImage, maskImage } : {}),
  }

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        updateEdges()
        onScroll?.(e)
      }}
      style={mergedStyle}
      className={cn(
        "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
