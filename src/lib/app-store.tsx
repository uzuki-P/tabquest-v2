import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"

import { formatRupiah } from "@/domain/money"
import type {
  AdminUserSummary,
  AppUserRole,
  BillSummary,
  HomeFeedResponse,
  MeResponse,
  PaymentMethod,
  PaymentMethodType,
  PlayerSummary,
} from "@/domain/types"
import { getPlayerUnpaidTotal } from "@/domain/types"
import { signInWithShoo, signOut, useSession } from "@/lib/auth-client"
import { DEFAULT_BRANDING } from "@/lib/branding"
import type { AppBranding } from "@/lib/branding"
import { todayJakarta } from "@/lib/time"
import type { UpsertBillInput } from "@/server/services/bills"
import type { AdminPlayerRow } from "@/server/services/players"

export type { PaymentMethod, PaymentMethodType }

export type ThemePreference = "system" | "light" | "dark"

export type HitEvent = {
  key: number
  playerId: string
  kind: "claim" | "collect"
  perBill: Array<{ billId: string; amount: number }>
  tip: number
}

const THEME_STORAGE_KEY = "tq-theme-pref"
const CALLSIGN_STORAGE_KEY = "tq-selected-player"

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text }
    }
  }
  if (!response.ok) {
    const message =
      (parsed as { error?: string } | null)?.error ||
      `Request failed (${response.status})`
    throw new Error(message)
  }
  return parsed as T
}

interface AppStoreValue {
  // Public workspace state
  loading: boolean
  players: PlayerSummary[]
  bills: BillSummary[]
  unpaidBills: BillSummary[]
  selectedMonth: string
  availableMonths: string[]
  setSelectedMonth: (month: string) => void
  branding: AppBranding

  // Auth & user state
  authPending: boolean
  signingIn: boolean
  authLoading: boolean
  me: MeResponse
  role: AppUserRole
  activePlayerId: string
  setActivePlayerId: (id: string) => void
  you: PlayerSummary | null
  paymentMethods: PaymentMethod[]
  handleSignIn: (callbackURL?: string) => Promise<void>
  handleSignOut: () => Promise<void>

  // Admin state
  adminPlayers: AdminPlayerRow[]
  adminUsers: AdminUserSummary[]
  draftBills: BillSummary[]
  archivedBills: BillSummary[]
  activeAdminBills: BillSummary[]
  roundingPlayerId: string | null

  // UI state
  themePref: ThemePreference
  setThemePref: (pref: ThemePreference) => void
  resolvedTheme: "light" | "dark"
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  preview: boolean
  setPreview: (active: boolean) => void
  hit: HitEvent | null
  toast: { key: number; message: string; tone: "default" | "error" } | null
  liveAnnouncement: string
  pushToast: (message: string, tone?: "default" | "error") => void

  // Refreshers
  refreshWorkspace: (monthOverride?: string) => Promise<void>
  refreshMe: () => Promise<void>
  refreshAdmin: () => Promise<void>

  // Player & Admin actions (wired to real D1 + R2 endpoints)
  handleNotify: (player: PlayerSummary, amount: number) => Promise<boolean>
  handleAdminConfirm: (
    debtor: PlayerSummary,
    receivedAmount: number
  ) => Promise<boolean>
  handleAdminRejectClaim: (debtor: PlayerSummary) => Promise<boolean>
  toggleBillPlayerPayment: (
    billPlayerId: string,
    status: "paid" | "unpaid",
    paidAmount?: number | null
  ) => Promise<boolean>

  // Admin settings actions
  saveSettings: (patch: {
    appName?: string | null
    tagline?: string | null
    iconUrl?: string | null
    paymentMethods?: PaymentMethod[]
  }) => Promise<boolean>
  addPaymentMethod: (
    method: Omit<PaymentMethod, "id" | "isPrimary">
  ) => Promise<boolean>
  updatePaymentMethod: (
    id: string,
    patch: Partial<Omit<PaymentMethod, "id">>
  ) => Promise<boolean>
  removePaymentMethod: (id: string) => Promise<boolean>
  setPrimaryPaymentMethod: (id: string) => Promise<boolean>
  updateBranding: (
    patch: Partial<Pick<AppBranding, "appName" | "iconUrl" | "tagline">>
  ) => Promise<boolean>
  resetBranding: () => Promise<boolean>

  // Admin player actions
  setRoundingPlayerId: (playerId: string) => Promise<boolean>
  addPlayer: (input: {
    name: string
    email?: string | null
    phone?: string | null
    note?: string | null
  }) => Promise<boolean>
  updatePlayer: (
    playerId: string,
    patch: {
      name?: string
      email?: string | null
      phone?: string | null
      note?: string | null
      archived?: boolean
      userId?: string | null
      takesRounding?: boolean
      avatarBanned?: boolean
      nameLocked?: boolean
      removeAvatar?: boolean
    }
  ) => Promise<boolean>
  toggleArchivePlayer: (playerId: string, archived: boolean) => Promise<boolean>
  setPlayerAvatarBanned: (playerId: string, banned: boolean) => Promise<boolean>
  setPlayerNameLocked: (playerId: string, locked: boolean) => Promise<boolean>
  removePlayerAvatarAdmin: (playerId: string) => Promise<boolean>

  // Self-service profile & avatar
  uploadMyAvatar: (blob: Blob) => Promise<string | null>
  removeMyAvatar: () => Promise<boolean>
  updateMyUsername: (name: string) => Promise<boolean>

  // Admin bill actions
  createBill: (
    input: UpsertBillInput
  ) => Promise<{ id: string; publicId: string; status: "draft" | "published" } | null>
  publishDraftBill: (billId: string) => Promise<boolean>
  toggleArchiveBill: (billId: string, archived: boolean) => Promise<boolean>
  deleteDraftBill: (billId: string) => Promise<boolean>
}

const EMPTY_ME: MeResponse = {
  authenticated: false,
  user: null,
  isAdmin: false,
  linkedPlayerId: null,
  paymentMethods: [],
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { data: betterAuthSession, isPending: authPending } = useSession()

  const [loading, setLoading] = useState<boolean>(true)
  const [meLoaded, setMeLoaded] = useState<boolean>(false)
  const [players, setPlayers] = useState<PlayerSummary[]>([])
  const [bills, setBills] = useState<BillSummary[]>([])
  const [unpaidBills, setUnpaidBills] = useState<BillSummary[]>([])
  const [selectedMonth, setSelectedMonthState] = useState<string>("")
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [branding, setBranding] = useState<AppBranding>(() => ({
    ...DEFAULT_BRANDING,
  }))

  const [me, setMe] = useState<MeResponse>(EMPTY_ME)
  const [activePlayerId, setActivePlayerIdState] = useState<string>("")

  // Admin data
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayerRow[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([])
  const [activeAdminBills, setActiveAdminBills] = useState<BillSummary[]>([])
  const [draftBills, setDraftBills] = useState<BillSummary[]>([])
  const [archivedBills, setArchivedBills] = useState<BillSummary[]>([])

  // UI state
  const [themePref, setThemePrefState] = useState<ThemePreference>("system")
  const [systemDark, setSystemDark] = useState<boolean>(false)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const [preview, setPreview] = useState<boolean>(false)
  const [hit, setHit] = useState<HitEvent | null>(null)
  const [queuedCollectHit, setQueuedCollectHit] = useState<HitEvent | null>(
    null
  )
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("")
  const [toast, setToast] = useState<{
    key: number
    message: string
    tone: "default" | "error"
  } | null>(null)

  const pushToast = useCallback(
    (message: string, tone: "default" | "error" = "default") => {
      setLiveAnnouncement(message)
      const key = Date.now()
      setToast({ key, message, tone })
      window.setTimeout(() => {
        setToast((curr) => (curr?.key === key ? null : curr))
      }, tone === "error" ? 5000 : 3400)
    },
    []
  )

  const role: AppUserRole = me.authenticated
    ? me.isAdmin
      ? "admin"
      : "player"
    : "guest"

  const setActivePlayerId = useCallback((id: string) => {
    setActivePlayerIdState(id)
    try {
      window.localStorage.setItem(CALLSIGN_STORAGE_KEY, id)
    } catch {
      // ignore storage errors
    }
  }, [])

  // Theme initialization
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (saved === "system" || saved === "light" || saved === "dark") {
        setThemePrefState(saved)
      }
      const savedCallsign = window.localStorage.getItem(CALLSIGN_STORAGE_KEY)
      if (savedCallsign) {
        setActivePlayerIdState(savedCallsign)
      }
    } catch {
      // ignore
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    setSystemDark(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const setThemePref = useCallback((pref: ThemePreference) => {
    setThemePrefState(pref)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref)
    } catch {
      // ignore
    }
  }, [])

  const resolvedTheme: "light" | "dark" =
    themePref === "system" ? (systemDark ? "dark" : "light") : themePref

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    document.title = branding.appName
  }, [branding.appName])

  // Replay collect hit after drawer closes
  useEffect(() => {
    if (!drawerOpen && queuedCollectHit) {
      const t = window.setTimeout(() => {
        setHit({ ...queuedCollectHit, key: Date.now() })
        setQueuedCollectHit(null)
      }, 260)
      return () => window.clearTimeout(t)
    }
  }, [drawerOpen, queuedCollectHit])

  const refreshWorkspace = useCallback(
    async (monthOverride?: string) => {
      const target = monthOverride ?? selectedMonth
      const qs = target ? `?month=${encodeURIComponent(target)}` : ""
      try {
        const [homeData, publicSettings] = await Promise.all([
          apiFetch<HomeFeedResponse>(`/api/public/home${qs}`),
          apiFetch<{ appName: string; tagline: string; iconUrl: string }>(
            "/api/public/settings"
          ),
        ])
        setPlayers(homeData.players)
        setBills(homeData.bills)
        setUnpaidBills(homeData.unpaidBills)
        setAvailableMonths(homeData.availableMonths)
        if (!target || target !== homeData.month) {
          setSelectedMonthState(homeData.month)
        }
        setBranding((prev) => ({
          ...prev,
          appName: publicSettings.appName,
          tagline: publicSettings.tagline,
          iconUrl: publicSettings.iconUrl,
        }))
      } catch (err) {
        console.error("Failed to load workspace:", err)
      } finally {
        setLoading(false)
      }
    },
    [selectedMonth]
  )

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/me")
      setMe(data)
      if (data.linkedPlayerId) {
        setActivePlayerIdState((prev) => prev || data.linkedPlayerId || "")
      }
    } catch (err) {
      console.error("Failed to load /api/me:", err)
      setMe(EMPTY_ME)
    } finally {
      setMeLoaded(true)
    }
  }, [])

  const refreshAdmin = useCallback(async () => {
    try {
      const [billsRes, playersRes] = await Promise.all([
        apiFetch<{
          active: BillSummary[]
          drafts: BillSummary[]
          archived: BillSummary[]
        }>("/api/admin/bills"),
        apiFetch<{
          players: AdminPlayerRow[]
          users: AdminUserSummary[]
        }>("/api/admin/players"),
      ])
      setActiveAdminBills(billsRes.active)
      setDraftBills(billsRes.drafts)
      setArchivedBills(billsRes.archived)
      setAdminPlayers(playersRes.players)
      setAdminUsers(playersRes.users)
    } catch (err) {
      console.error("Failed to load admin data:", err)
    }
  }, [])

  // Initial load
  useEffect(() => {
    void refreshWorkspace("")
  }, [])

  // Refresh /api/me whenever Better Auth session identity changes
  useEffect(() => {
    if (authPending) return
    void refreshMe()
  }, [authPending, betterAuthSession?.user?.id, refreshMe])

  // Load admin data whenever user is confirmed admin
  useEffect(() => {
    if (me.isAdmin) {
      void refreshAdmin()
    } else {
      setAdminPlayers([])
      setAdminUsers([])
      setActiveAdminBills([])
      setDraftBills([])
      setArchivedBills([])
    }
  }, [me.isAdmin, refreshAdmin])

  const setSelectedMonth = useCallback(
    (month: string) => {
      setSelectedMonthState(month)
      void refreshWorkspace(month)
    },
    [refreshWorkspace]
  )

  const [signingIn, setSigningIn] = useState(false)
  const handleSignIn = useCallback(
    async (callbackURL?: string) => {
      const target =
        callbackURL ??
        (typeof window !== "undefined" ? window.location.pathname : "/")
      setSigningIn(true)
      try {
        await signInWithShoo(target)
      } catch (err) {
        setSigningIn(false)
        pushToast(err instanceof Error ? err.message : "Sign-in failed.")
      }
    },
    [pushToast]
  )

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      setMe(EMPTY_ME)
      pushToast("Signed out.")
      await refreshWorkspace()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Sign-out failed.")
    }
  }, [pushToast, refreshWorkspace])

  const handleNotify = useCallback(
    async (targetPlayer: PlayerSummary, amount: number): Promise<boolean> => {
      setPreview(false)
      try {
        await apiFetch("/api/me/transfer-claims", {
          method: "POST",
          body: JSON.stringify({ claimedAmount: amount }),
        })
        const owed = getPlayerUnpaidTotal(targetPlayer)
        setHit({
          key: Date.now(),
          playerId: targetPlayer.id,
          kind: "claim",
          perBill: targetPlayer.unpaidBills.map((b) => ({
            billId: b.billId,
            amount: b.amount,
          })),
          tip: Math.max(0, amount - owed),
        })
        pushToast(
          `${targetPlayer.name} reported ${formatRupiah(amount)} transfer. Awaiting admin.`
        )
        await refreshWorkspace()
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Could not submit transfer claim."
        )
        return false
      }
    },
    [pushToast, refreshWorkspace]
  )

  const handleAdminConfirm = useCallback(
    async (
      debtor: PlayerSummary,
      receivedAmount: number
    ): Promise<boolean> => {
      const debtorOwed = getPlayerUnpaidTotal(debtor)
      const tip = receivedAmount - debtorOwed
      try {
        await apiFetch("/api/admin/payments/collect-all", {
          method: "POST",
          body: JSON.stringify({
            playerId: debtor.id,
            receivedAmount,
          }),
        })
        const collectHit: HitEvent = {
          key: Date.now(),
          playerId: debtor.id,
          kind: "collect",
          perBill: debtor.unpaidBills.map((b) => ({
            billId: b.billId,
            amount: b.amount,
          })),
          tip: Math.max(0, tip),
        }
        setHit(collectHit)
        setQueuedCollectHit(collectHit)
        pushToast(
          tip > 0
            ? `Confirmed ${debtor.name}: ${formatRupiah(receivedAmount)} (+${formatRupiah(tip)} tip)`
            : `Confirmed ${debtor.name}: ${formatRupiah(receivedAmount)}`
        )
        await Promise.all([refreshWorkspace(), refreshAdmin()])
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to confirm payment.",
          "error"
        )
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const handleAdminRejectClaim = useCallback(
    async (debtor: PlayerSummary): Promise<boolean> => {
      try {
        await apiFetch("/api/admin/transfer-claims/dismiss", {
          method: "POST",
          body: JSON.stringify({
            playerId: debtor.id,
            claimId: debtor.pendingClaim?.id,
          }),
        })
        pushToast(`Rejected ${debtor.name}'s claim. Reverted to unpaid.`)
        await refreshWorkspace()
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to dismiss claim.",
          "error"
        )
        return false
      }
    },
    [pushToast, refreshWorkspace]
  )

  const toggleBillPlayerPayment = useCallback(
    async (
      billPlayerId: string,
      status: "paid" | "unpaid",
      paidAmount?: number | null
    ): Promise<boolean> => {
      try {
        await apiFetch("/api/admin/payments/toggle", {
          method: "POST",
          body: JSON.stringify({ billPlayerId, status, paidAmount }),
        })
        pushToast(status === "paid" ? "Marked paid." : "Marked unpaid.")
        await Promise.all([refreshWorkspace(), refreshAdmin()])
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to update payment."
        )
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const saveSettings = useCallback(
    async (patch: {
      appName?: string | null
      tagline?: string | null
      iconUrl?: string | null
      paymentMethods?: PaymentMethod[]
    }): Promise<boolean> => {
      try {
        const res = await apiFetch<{
          branding: { appName: string; tagline: string; iconUrl: string }
          paymentMethods: PaymentMethod[]
        }>("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify(patch),
        })
        setBranding((prev) => ({
          ...prev,
          appName: res.branding.appName,
          tagline: res.branding.tagline,
          iconUrl: res.branding.iconUrl,
        }))
        setMe((prev) => ({ ...prev, paymentMethods: res.paymentMethods }))
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to save settings."
        )
        return false
      }
    },
    [pushToast]
  )

  const addPaymentMethod = useCallback(
    async (method: Omit<PaymentMethod, "id" | "isPrimary">) => {
      const next: PaymentMethod[] = [
        ...me.paymentMethods,
        {
          ...method,
          id: `pm-${Date.now()}`,
          isPrimary: me.paymentMethods.length === 0,
        },
      ]
      const ok = await saveSettings({ paymentMethods: next })
      if (ok) pushToast(`Added payment method: ${method.label}.`)
      return ok
    },
    [me.paymentMethods, pushToast, saveSettings]
  )

  const updatePaymentMethod = useCallback(
    async (id: string, patch: Partial<Omit<PaymentMethod, "id">>) => {
      const next = me.paymentMethods.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      )
      const ok = await saveSettings({ paymentMethods: next })
      if (ok) pushToast("Payment method updated.")
      return ok
    },
    [me.paymentMethods, pushToast, saveSettings]
  )

  const removePaymentMethod = useCallback(
    async (id: string) => {
      const filtered = me.paymentMethods.filter((m) => m.id !== id)
      if (filtered.length > 0 && !filtered.some((m) => m.isPrimary)) {
        filtered[0] = { ...filtered[0], isPrimary: true }
      }
      const ok = await saveSettings({ paymentMethods: filtered })
      if (ok) pushToast("Payment method removed.")
      return ok
    },
    [me.paymentMethods, pushToast, saveSettings]
  )

  const setPrimaryPaymentMethod = useCallback(
    async (id: string) => {
      const next = me.paymentMethods.map((m) => ({
        ...m,
        isPrimary: m.id === id,
      }))
      const ok = await saveSettings({ paymentMethods: next })
      if (ok) pushToast("Primary payment method updated.")
      return ok
    },
    [me.paymentMethods, pushToast, saveSettings]
  )

  const updateBranding = useCallback(
    async (
      patch: Partial<Pick<AppBranding, "appName" | "iconUrl" | "tagline">>
    ) => {
      const ok = await saveSettings(patch)
      if (ok) pushToast("Workspace branding updated.")
      return ok
    },
    [pushToast, saveSettings]
  )

  const resetBranding = useCallback(async () => {
    const ok = await saveSettings({
      appName: null,
      tagline: null,
      iconUrl: null,
    })
    if (ok) pushToast("Branding reset to defaults.")
    return ok
  }, [pushToast, saveSettings])

  const addPlayer = useCallback(
    async (input: {
      name: string
      email?: string | null
      phone?: string | null
      note?: string | null
    }) => {
      try {
        await apiFetch("/api/admin/players", {
          method: "POST",
          body: JSON.stringify(input),
        })
        pushToast(`Added player ${input.name.trim()}.`)
        await Promise.all([refreshAdmin(), refreshWorkspace()])
        return true
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Failed to add player.")
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const updatePlayer = useCallback(
    async (
      playerId: string,
      patch: {
        name?: string
        email?: string | null
        phone?: string | null
        note?: string | null
        archived?: boolean
        userId?: string | null
        takesRounding?: boolean
        avatarBanned?: boolean
        nameLocked?: boolean
        removeAvatar?: boolean
      }
    ) => {
      try {
        await apiFetch(`/api/admin/players/${encodeURIComponent(playerId)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })
        await Promise.all([refreshAdmin(), refreshWorkspace()])
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to update player."
        )
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const setRoundingPlayerId = useCallback(
    async (playerId: string) => {
      const ok = await updatePlayer(playerId, { takesRounding: true })
      if (ok) {
        const target = adminPlayers.find((p) => p.id === playerId)
        pushToast(
          target
            ? `${target.name} now takes leftover rounding rupiah.`
            : "Rounding player updated."
        )
      }
      return ok
    },
    [adminPlayers, pushToast, updatePlayer]
  )

  const toggleArchivePlayer = useCallback(
    async (playerId: string, archived: boolean) => {
      const ok = await updatePlayer(playerId, { archived })
      if (ok) {
        const target = adminPlayers.find((p) => p.id === playerId)
        pushToast(
          target
            ? archived
              ? `Archived ${target.name}.`
              : `Restored ${target.name} to active roster.`
            : "Player status updated."
        )
      }
      return ok
    },
    [adminPlayers, pushToast, updatePlayer]
  )

  const setPlayerAvatarBanned = useCallback(
    async (playerId: string, banned: boolean) => {
      const ok = await updatePlayer(playerId, { avatarBanned: banned })
      if (ok) {
        const target =
          adminPlayers.find((p) => p.id === playerId) ??
          players.find((p) => p.id === playerId)
        pushToast(
          banned
            ? `Banned ${target?.name ?? "player"} from uploading avatars.`
            : `Re-enabled avatar uploads for ${target?.name ?? "player"}.`
        )
      }
      return ok
    },
    [adminPlayers, players, pushToast, updatePlayer]
  )

  const setPlayerNameLocked = useCallback(
    async (playerId: string, locked: boolean) => {
      const ok = await updatePlayer(playerId, { nameLocked: locked })
      if (ok) {
        const target =
          adminPlayers.find((p) => p.id === playerId) ??
          players.find((p) => p.id === playerId)
        pushToast(
          locked
            ? `Locked name for ${target?.name ?? "player"}.`
            : `Unlocked name for ${target?.name ?? "player"}.`
        )
      }
      return ok
    },
    [adminPlayers, players, pushToast, updatePlayer]
  )

  const removePlayerAvatarAdmin = useCallback(
    async (playerId: string) => {
      const ok = await updatePlayer(playerId, { removeAvatar: true })
      if (ok) pushToast("Removed player avatar.")
      return ok
    },
    [pushToast, updatePlayer]
  )

  const updateMyUsername = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim()
      if (!trimmed) {
        pushToast("Username cannot be empty.")
        return false
      }
      try {
        await apiFetch("/api/me/profile", {
          method: "PATCH",
          body: JSON.stringify({ name: trimmed }),
        })
        await Promise.all([refreshWorkspace(), refreshMe()])
        pushToast(`Username updated to ${trimmed}.`)
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to update name."
        )
        return false
      }
    },
    [pushToast, refreshMe, refreshWorkspace]
  )

  const uploadMyAvatar = useCallback(
    async (blob: Blob): Promise<string | null> => {
      try {
        const form = new FormData()
        form.append("file", blob, "avatar.webp")
        const res = await apiFetch<{ avatarUrl: string }>("/api/me/avatar", {
          method: "POST",
          body: form,
        })
        pushToast("Avatar updated.")
        await refreshWorkspace()
        return res.avatarUrl
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to upload avatar."
        )
        return null
      }
    },
    [pushToast, refreshWorkspace]
  )

  const removeMyAvatar = useCallback(async (): Promise<boolean> => {
    try {
      await apiFetch("/api/me/avatar", { method: "DELETE" })
      pushToast("Avatar removed.")
      await refreshWorkspace()
      return true
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to remove avatar.")
      return false
    }
  }, [pushToast, refreshWorkspace])

  const createBill = useCallback(
    async (input: UpsertBillInput) => {
      try {
        const res = await apiFetch<{
          id: string
          publicId: string
          status: "draft" | "published"
          finalTotal: number
        }>("/api/admin/bills", {
          method: "POST",
          body: JSON.stringify(input),
        })
        pushToast(
          res.status === "published"
            ? `Published ${input.merchant} (${formatRupiah(res.finalTotal)}).`
            : `Saved draft: ${input.merchant}.`
        )
        await Promise.all([refreshWorkspace(), refreshAdmin()])
        return res
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Failed to save bill.")
        return null
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const publishDraftBill = useCallback(
    async (billId: string) => {
      try {
        await apiFetch(`/api/admin/bills/${encodeURIComponent(billId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "publish" }),
        })
        pushToast("Published bill to the live board.")
        await Promise.all([refreshWorkspace(), refreshAdmin()])
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to publish draft."
        )
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const toggleArchiveBill = useCallback(
    async (billId: string, archived: boolean) => {
      try {
        await apiFetch(`/api/admin/bills/${encodeURIComponent(billId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: archived ? "archive" : "unarchive" }),
        })
        pushToast(archived ? "Bill archived." : "Bill restored to Active.")
        await Promise.all([refreshWorkspace(), refreshAdmin()])
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to update bill archive."
        )
        return false
      }
    },
    [pushToast, refreshAdmin, refreshWorkspace]
  )

  const deleteDraftBill = useCallback(
    async (billId: string) => {
      try {
        await apiFetch(`/api/admin/bills/${encodeURIComponent(billId)}`, {
          method: "DELETE",
        })
        pushToast("Draft deleted.")
        await refreshAdmin()
        return true
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Failed to delete draft."
        )
        return false
      }
    },
    [pushToast, refreshAdmin]
  )

  const roundingPlayerId = useMemo(
    () =>
      adminPlayers.find((p) => p.takesRounding)?.id ??
      players.find((p) => p.takesRounding)?.id ??
      null,
    [adminPlayers, players]
  )

  const you = useMemo(() => {
    if (activePlayerId) {
      const selected = players.find((p) => p.id === activePlayerId)
      if (selected) return selected
    }
    if (me.linkedPlayerId) {
      const linked = players.find((p) => p.id === me.linkedPlayerId)
      if (linked) return linked
    }
    return players.find((p) => p.unpaidBills.length > 0) ?? players[0] ?? null
  }, [me.linkedPlayerId, activePlayerId, players])

  const effectiveMonth = selectedMonth || todayJakarta().slice(0, 7)

  return (
    <AppStoreContext.Provider
      value={{
        loading,
        players,
        bills,
        unpaidBills,
        selectedMonth: effectiveMonth,
        availableMonths,
        setSelectedMonth,
        branding,
        authPending,
        signingIn,
        authLoading: authPending || !meLoaded,
        me,
        role,
        activePlayerId: you?.id ?? "",
        setActivePlayerId,
        you,
        paymentMethods: me.paymentMethods,
        handleSignIn,
        handleSignOut,
        adminPlayers,
        adminUsers,
        draftBills,
        archivedBills,
        activeAdminBills,
        roundingPlayerId,
        themePref,
        setThemePref,
        resolvedTheme,
        drawerOpen,
        setDrawerOpen,
        preview,
        setPreview,
        hit,
        toast,
        liveAnnouncement,
        pushToast,
        refreshWorkspace,
        refreshMe,
        refreshAdmin,
        handleNotify,
        handleAdminConfirm,
        handleAdminRejectClaim,
        toggleBillPlayerPayment,
        saveSettings,
        addPaymentMethod,
        updatePaymentMethod,
        removePaymentMethod,
        setPrimaryPaymentMethod,
        updateBranding,
        resetBranding,
        setRoundingPlayerId,
        addPlayer,
        updatePlayer,
        toggleArchivePlayer,
        setPlayerAvatarBanned,
        setPlayerNameLocked,
        removePlayerAvatarAdmin,
        uploadMyAvatar,
        removeMyAvatar,
        updateMyUsername,
        createBill,
        publishDraftBill,
        toggleArchiveBill,
        deleteDraftBill,
      }}
    >
      {children}
    </AppStoreContext.Provider>
  )
}

export function useOptionalAppStore(): AppStoreValue | null {
  return useContext(AppStoreContext)
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext)
  if (!ctx) {
    throw new Error("useAppStore must be used inside AppStoreProvider")
  }
  return ctx
}
