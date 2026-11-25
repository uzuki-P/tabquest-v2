import {
  Clock,
  GearSix,
  Plus,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react"
import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router"
import { useLayoutEffect, useRef, useState } from "react"

import { PageLoading } from "@/components/telemetry/components"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/admin")({
  component: AdminLayoutRoute,
})

const ADMIN_TABS = [
  { to: "/admin" as const, label: "Bills", icon: Receipt, exact: true },
  {
    to: "/admin/bills/new" as const,
    label: "New bill",
    icon: Plus,
    exact: false,
  },
  {
    to: "/admin/players" as const,
    label: "Players",
    icon: Users,
    exact: false,
  },
  {
    to: "/admin/settings" as const,
    label: "Settings",
    icon: GearSix,
    exact: false,
  },
]

function getTabIndex(pathname: string): number {
  if (pathname.startsWith("/admin/bills/new")) return 1
  if (pathname.startsWith("/admin/players")) return 2
  if (pathname.startsWith("/admin/settings")) return 3
  return 0
}

function AdminLayoutRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const {
    role,
    me,
    authPending,
    signingIn,
    authLoading,
    handleSignIn,
    players,
    setDrawerOpen,
  } = useAppStore()

  const activeIdx = getTabIndex(pathname)
  const prevIdxRef = useRef(activeIdx)
  const tabDir = activeIdx >= prevIdxRef.current ? "right" : "left"
  useLayoutEffect(() => {
    prevIdxRef.current = activeIdx
  }, [activeIdx])

  const navRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [indicator, setIndicator] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIdx]
      if (!el) return
      setIndicator({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
    }
    measure()
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [activeIdx, role])

  const unpaidCount = players.filter((p) => p.unpaidBills.length > 0).length
  const pendingCount = players.filter(
    (p) => p.unpaidBills.length > 0 && p.pendingClaim !== null
  ).length

  if (authLoading) {
    return <PageLoading label="Checking admin session..." />
  }

  if (role !== "admin") {
    return (
      <section className="mx-auto max-w-xl rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded border-2 border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]">
          <ShieldCheck size={24} weight="bold" />
        </div>
        <h1 className="rt2-display mt-4 text-4xl font-extrabold">
          Admin access required
        </h1>
        <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
          Bill creation, receipt redaction, player linking, and transfer
          settings are restricted to the workspace admin.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!me.authenticated && (
            <button
              type="button"
              disabled={authPending || signingIn}
              onClick={() => void handleSignIn("/admin")}
              className="rt2-focus rt2-btn-primary min-h-[44px] rounded px-5 text-[15px] font-bold"
            >
              {signingIn ? "Signing in..." : "Sign in as Admin"}
            </button>
          )}
          <Link
            to="/"
            className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] items-center rounded px-5 text-[15px] font-bold"
          >
            Back to Home
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {/* Persistent Admin Sub-Navigation Bar (never remounts; active indicator glides) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--rt-border)] pb-3">
        <nav
          ref={navRef}
          aria-label="Admin sections"
          className="relative flex flex-wrap items-center gap-1"
        >
          {indicator && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate(${indicator.left}px, ${indicator.top}px)`,
                width: `${indicator.width}px`,
                height: `${indicator.height}px`,
              }}
              className="pointer-events-none absolute top-0 left-0 rounded-t border-b-2 border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] transition-[transform,width,height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          )}

          {ADMIN_TABS.map((tab, idx) => {
            const Icon = tab.icon
            const active = idx === activeIdx
            return (
              <Link
                key={tab.to}
                ref={(el) => {
                  tabRefs.current[idx] = el
                }}
                to={tab.to}
                activeOptions={{ exact: tab.exact }}
                className={`rt2-focus relative z-10 inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-t px-3.5 text-[15px] font-bold transition-colors ${
                  active
                    ? "text-[var(--rt-accent-ink)]"
                    : "text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
                }`}
              >
                <Icon size={16} weight="bold" />
                {tab.label}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rt2-focus rt2-btn-secondary inline-flex min-h-[42px] items-center gap-2 rounded px-3.5 text-[14px] font-bold"
        >
          <Wallet size={16} weight="bold" />
          Collect all
          <span
            title={`${unpaidCount} unpaid`}
            aria-label={`${unpaidCount} unpaid`}
            className="tnum inline-flex items-center gap-1 text-[14px] leading-none font-bold"
          >
            <WarningCircle size={16} weight="bold" />
            {unpaidCount}
          </span>
          <span
            title={`${pendingCount} pending`}
            aria-label={`${pendingCount} pending`}
            className="tnum inline-flex items-center gap-1 text-[14px] leading-none font-bold"
          >
            <Clock size={16} weight="bold" />
            {pendingCount}
          </span>
        </button>
      </div>

      <div
        key={pathname}
        className={
          tabDir === "right" ? "rt2-panel-in-right" : "rt2-panel-in-left"
        }
      >
        <Outlet />
      </div>
    </div>
  )
}
