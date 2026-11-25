/**
 * Central white-label branding configuration.
 *
 * Defaults can be overridden via environment variables (VITE_APP_NAME,
 * VITE_APP_ICON) at build/deploy time, or updated at runtime in
 * Admin -> Settings -> White-label branding.
 */
export interface AppBranding {
  appName: string
  tagline: string
  iconUrl: string
  faviconUrl: string
  faviconPngUrl: string
  appleTouchIconUrl: string
}

const env =
  typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {}

export const DEFAULT_BRANDING: AppBranding = {
  appName: env.VITE_APP_NAME?.trim() || "Tabquest",
  tagline:
    env.VITE_APP_TAGLINE?.trim() ||
    "Office group-order bill splitting that turns paying up into a game.",
  iconUrl: env.VITE_APP_ICON?.trim() || "/icon-512.png",
  faviconUrl: "/favicon.ico",
  faviconPngUrl: "/favicon-32x32.png",
  appleTouchIconUrl: "/apple-touch-icon.png",
}
