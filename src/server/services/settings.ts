import { eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { appSettings } from "@/db/schema"
import type { PaymentMethod, PublicAppSettings } from "@/domain/types"
import { DEFAULT_BRANDING } from "@/lib/branding"
import { nowUtcIso } from "@/lib/time"

export const APP_SETTINGS_ID = "default"

export const paymentMethodSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["bank", "ewallet", "qris"]),
  label: z.string().trim().min(1).max(80),
  accountNumber: z.string().trim().min(1).max(80),
  accountHolder: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).default(""),
  isPrimary: z.boolean().default(false),
})

export const updateAppSettingsSchema = z.object({
  appName: z.string().trim().max(80).nullable().optional(),
  tagline: z.string().trim().max(200).nullable().optional(),
  iconUrl: z.string().trim().max(200_000).nullable().optional(),
  paymentMethods: z.array(paymentMethodSchema).max(20).optional(),
})

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>

function parsePaymentMethods(raw: string | null | undefined): PaymentMethod[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const validated = z.array(paymentMethodSchema).safeParse(parsed)
    if (!validated.success) return []
    const methods = validated.data
    if (methods.length > 0 && !methods.some((m) => m.isPrimary)) {
      methods[0] = { ...methods[0], isPrimary: true }
    }
    return methods
  } catch {
    return []
  }
}

function toPublicSettings(
  row:
    | {
        appName: string | null
        tagline: string | null
        iconUrl: string | null
      }
    | undefined
): PublicAppSettings {
  return {
    appName: row?.appName?.trim() || DEFAULT_BRANDING.appName,
    tagline: row?.tagline?.trim() || DEFAULT_BRANDING.tagline,
    iconUrl: row?.iconUrl?.trim() || DEFAULT_BRANDING.iconUrl,
  }
}

/**
 * Public white-label branding settings ONLY.
 * Privacy boundary: NEVER returns `paymentMethods`.
 */
export async function getPublicSettings(
  db: Database
): Promise<PublicAppSettings> {
  const [row] = await db
    .select({
      appName: appSettings.appName,
      tagline: appSettings.tagline,
      iconUrl: appSettings.iconUrl,
    })
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1)

  return toPublicSettings(row)
}

/**
 * Returns configured payment methods. Callers MUST gate this behind `requireAuth`
 * or `requireAdmin` so unauthenticated guests never receive payment destinations.
 */
export async function getPaymentMethods(
  db: Database
): Promise<PaymentMethod[]> {
  const [row] = await db
    .select({
      paymentMethodsJson: appSettings.paymentMethodsJson,
    })
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1)

  return parsePaymentMethods(row?.paymentMethodsJson)
}

/**
 * Full admin settings payload (white-label branding + payment methods).
 */
export async function getAdminSettings(db: Database): Promise<{
  branding: PublicAppSettings
  paymentMethods: PaymentMethod[]
  updatedAt: string | null
  updatedBy: string | null
}> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1)

  return {
    branding: toPublicSettings(row),
    paymentMethods: parsePaymentMethods(row?.paymentMethodsJson),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  }
}

/**
 * Upserts the singleton `app_settings` row (`id = "default"`).
 */
export async function updateAppSettings(
  db: Database,
  rawInput: UpdateAppSettingsInput,
  actorEmail: string
): Promise<{
  branding: PublicAppSettings
  paymentMethods: PaymentMethod[]
  updatedAt: string
  updatedBy: string
}> {
  const input = updateAppSettingsSchema.parse(rawInput)
  const [existing] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1)

  const nextAppName =
    input.appName !== undefined
      ? input.appName?.trim() || null
      : (existing?.appName ?? null)
  const nextTagline =
    input.tagline !== undefined
      ? input.tagline?.trim() || null
      : (existing?.tagline ?? null)
  const nextIconUrl =
    input.iconUrl !== undefined
      ? input.iconUrl?.trim() || null
      : (existing?.iconUrl ?? null)

  let nextMethods = parsePaymentMethods(existing?.paymentMethodsJson)
  if (input.paymentMethods !== undefined) {
    nextMethods = input.paymentMethods.map((m) => ({
      ...m,
      note: m.note ?? "",
    }))
    if (nextMethods.length > 0 && !nextMethods.some((m) => m.isPrimary)) {
      nextMethods[0] = { ...nextMethods[0], isPrimary: true }
    } else if (nextMethods.filter((m) => m.isPrimary).length > 1) {
      let seenPrimary = false
      nextMethods = nextMethods.map((m) => {
        if (m.isPrimary && !seenPrimary) {
          seenPrimary = true
          return m
        }
        return { ...m, isPrimary: false }
      })
    }
  }

  const now = nowUtcIso()
  const paymentMethodsJson = JSON.stringify(nextMethods)

  if (existing) {
    await db
      .update(appSettings)
      .set({
        appName: nextAppName,
        tagline: nextTagline,
        iconUrl: nextIconUrl,
        paymentMethodsJson,
        updatedAt: now,
        updatedBy: actorEmail,
      })
      .where(eq(appSettings.id, APP_SETTINGS_ID))
  } else {
    await db.insert(appSettings).values({
      id: APP_SETTINGS_ID,
      appName: nextAppName,
      tagline: nextTagline,
      iconUrl: nextIconUrl,
      paymentMethodsJson,
      updatedAt: now,
      updatedBy: actorEmail,
    })
  }

  return {
    branding: toPublicSettings({
      appName: nextAppName,
      tagline: nextTagline,
      iconUrl: nextIconUrl,
    }),
    paymentMethods: nextMethods,
    updatedAt: now,
    updatedBy: actorEmail,
  }
}
