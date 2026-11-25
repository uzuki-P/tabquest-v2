import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"
import type { ReactNode } from "react"

import { DevBadge } from "@/components/DevBadge"
import {
  AdminCollectDrawer,
  AppHeader,
} from "@/components/telemetry/components"
import { TELEMETRY_STYLES } from "@/components/telemetry/styles"
import { getPlayerUnpaidTotal } from "@/domain/types"
import { AppStoreProvider, useAppStore } from "@/lib/app-store"
import { DEFAULT_BRANDING } from "@/lib/branding"
import { triggerHaptic } from "@/lib/haptics"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: DEFAULT_BRANDING.appName },
      {
        name: "description",
        content: DEFAULT_BRANDING.tagline,
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "512x512",
        href: "/icon-512.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,600..800&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootLayout() {
  return (
    <AppStoreProvider>
      <AppShell />
    </AppStoreProvider>
  )
}

declare const __APP_VERSION__: string

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const {
    players,
    role,
    themePref,
    setThemePref,
    drawerOpen,
    setDrawerOpen,
    toast,
    liveAnnouncement,
    handleAdminConfirm,
    handleAdminRejectClaim,
    handleSignIn,
    handleSignOut,
  } = useAppStore()

  const openDebtors = players.filter((p) => p.unpaidBills.length > 0)
  const pendingCount = openDebtors.filter((p) => p.pendingClaim !== null).length
  const totalOutstanding = openDebtors.reduce(
    (s, p) => s + getPlayerUnpaidTotal(p),
    0
  )
  // Keep /admin layout mounted across admin sub-tabs so the tab bar never re-animates
  const mainTransitionKey = pathname.startsWith("/admin") ? "/admin" : pathname

  // Subtle mobile haptic pulse on interactive taps
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const interactive = target?.closest(
        'button, a, [role="button"], [role="tab"], [role="combobox"], [role="option"]'
      )
      if (!interactive) return
      if (
        interactive.hasAttribute("disabled") ||
        interactive.getAttribute("aria-disabled") === "true"
      ) {
        return
      }
      triggerHaptic(10)
    }
    document.addEventListener("click", onClick, { passive: true })
    return () => document.removeEventListener("click", onClick)
  }, [])

  return (
    <div className="rt2-root min-h-screen bg-[var(--rt-bg)] pb-16 font-ui-sans text-[15px] text-[var(--rt-ink)] sm:text-[16px]">
      <style>{TELEMETRY_STYLES}</style>
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      <AppHeader
        themePref={themePref}
        onThemePrefChange={setThemePref}
        role={role}
        onSignIn={() => void handleSignIn()}
        onSignOut={() => void handleSignOut()}
      />

      <main
        key={mainTransitionKey}
        className="rt2-page-enter mx-auto max-w-[1200px] space-y-7 px-4 pt-6"
      >
        <Outlet />
      </main>

      <footer className="mx-auto mt-12 max-w-[1200px] px-4 text-center">
        <p className="font-arcade-mono text-[12px] text-[var(--rt-muted)] opacity-75">
          Tabquest {__APP_VERSION__}
        </p>
      </footer>

      <DevBadge />

      {toast && (
        <div
          key={toast.key}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`rt2-toast-in rt2-chamfer-frame fixed right-4 bottom-4 z-[100] max-w-sm shadow-2xl ${
            toast.tone === "error"
              ? "bg-[var(--rt-accent)]"
              : "bg-[var(--rt-teal)]"
          }`}
        >
          <div
            className={`rt2-chamfer-inner px-4 py-3 text-[15px] font-bold ${
              toast.tone === "error"
                ? "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                : "bg-[var(--rt-tip-bg)] text-[var(--rt-tip-ink)]"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {role === "admin" && (
        <AdminCollectDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          debtors={openDebtors}
          totalOutstanding={totalOutstanding}
          pendingCount={pendingCount}
          onConfirm={handleAdminConfirm}
          onRejectClaim={handleAdminRejectClaim}
        />
      )}
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <p className="rt2-display text-6xl font-extrabold">404</p>
      <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
        This page does not exist.
      </p>
      <Link
        to="/"
        className="rt2-focus rt2-btn-primary mt-6 inline-flex min-h-[44px] items-center rounded px-5 text-[15px] font-bold"
      >
        Back to Home
      </Link>
    </div>
  )
}

const themeInitScript = `(function(){try{var p=localStorage.getItem("tq-theme-pref")||"system";var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
