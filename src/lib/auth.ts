import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { genericOAuth } from "better-auth/plugins/generic-oauth"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { createDb } from "@/db"
import { account, session, user, verification } from "@/db/schema"
import {
  SHOO_DEFAULT_BASE_URL,
  SHOO_PROVIDER_ID,
  deriveShooClientId,
  isAdminEmail,
  normalizeEmail,
  resolveUserRole,
  syncUserRoleAndAttachPlayer,
} from "@/lib/auth-policy"

export interface AuthEnv {
  DB: D1Database
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  SHOO_BASE_URL?: string
  SHOO_CLIENT_ID?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ADMIN_EMAIL?: string
}

/**
 * Creates a request-scoped Better Auth instance bound to Cloudflare D1.
 *
 * Login providers:
 * - Primary: Shoo (`https://shoo.dev`) via OIDC + PKCE (`genericOAuth`), zero
 *   OAuth app credentials required.
 * - Optional fallback: direct Google OAuth when `GOOGLE_CLIENT_ID` and
 *   `GOOGLE_CLIENT_SECRET` are configured.
 *
 * Enforces:
 * - Strict single-admin policy via `ADMIN_EMAIL` (case-insensitive).
 * - Automatic email pre-link attachment on verified sign-in.
 * - Zero password-hashing CPU (OIDC/OAuth only).
 */
export function createAuth(workerEnv: AuthEnv = env) {
  const db = createDb(workerEnv.DB)
  const baseURL = workerEnv.BETTER_AUTH_URL?.trim() || undefined
  const shooBaseUrl = (
    workerEnv.SHOO_BASE_URL?.trim() || SHOO_DEFAULT_BASE_URL
  ).replace(/\/+$/, "")
  const shooClientId = deriveShooClientId(baseURL, workerEnv.SHOO_CLIENT_ID)
  const googleClientId = workerEnv.GOOGLE_CLIENT_ID?.trim()
  const googleClientSecret = workerEnv.GOOGLE_CLIENT_SECRET?.trim()

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    baseURL,
    secret: workerEnv.BETTER_AUTH_SECRET?.trim() || undefined,
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : undefined,
    databaseHooks: {
      user: {
        create: {
          before: async (incomingUser) => {
            const normalizedEmail =
              normalizeEmail(incomingUser.email) ?? incomingUser.email
            const role = resolveUserRole(normalizedEmail, workerEnv.ADMIN_EMAIL)
            return {
              data: {
                ...incomingUser,
                email: normalizedEmail,
                role,
              },
            }
          },
        },
        update: {
          before: async (incomingUpdate) => {
            const nextData = { ...incomingUpdate }
            if (typeof nextData.email === "string") {
              nextData.email =
                normalizeEmail(nextData.email) ?? nextData.email
            }
            if (
              typeof nextData.email === "string" ||
              nextData.role !== undefined
            ) {
              const targetEmail =
                typeof nextData.email === "string" ? nextData.email : undefined
              if (targetEmail !== undefined) {
                nextData.role = resolveUserRole(
                  targetEmail,
                  workerEnv.ADMIN_EMAIL
                )
              } else if (nextData.role === "admin") {
                // Never allow arbitrary role elevation without an email check.
                delete nextData.role
              }
            }
            return { data: nextData }
          },
        },
      },
      session: {
        create: {
          after: async (createdSession) => {
            await syncUserRoleAndAttachPlayer(db, {
              userId: createdSession.userId,
              adminEmail: workerEnv.ADMIN_EMAIL,
            })
          },
        },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: SHOO_PROVIDER_ID,
            name: "Shoo",
            discoveryUrl: `${shooBaseUrl}/.well-known/openid-configuration`,
            clientId: shooClientId,
            pkce: true,
            scopes: ["openid", "profile", "email"],
            authorizationUrlParams: {
              pii: "true",
            },
            requireIdTokenVerification: true,
            // Shoo's OIDC discovery claims do not include `nonce`; PKCE S256
            // + state + JWKS ES256 ID token verification still protect the flow.
            disableIdTokenNonceBinding: true,
          },
        ],
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      tanstackStartCookies(),
    ],
  })
}

export type BetterAuthInstance = ReturnType<typeof createAuth>
type RawSessionResult = NonNullable<
  Awaited<ReturnType<BetterAuthInstance["api"]["getSession"]>>
>

export interface AuthSession {
  session: RawSessionResult["session"]
  user: RawSessionResult["user"]
  isAdmin: boolean
}

/**
 * HTTP error thrown by `requireAuth` and `requireAdmin` for clean 401/403
 * JSON responses in server routes.
 */
export class AuthHttpError extends Error {
  readonly status: 401 | 403

  constructor(status: 401 | 403, message: string) {
    super(message)
    this.name = "AuthHttpError"
    this.status = status
  }

  toResponse(): Response {
    return Response.json(
      { error: this.message },
      {
        status: this.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  }
}

function toHeaders(requestOrHeaders: Request | Headers): Headers {
  return requestOrHeaders instanceof Request
    ? requestOrHeaders.headers
    : requestOrHeaders
}

/**
 * Reads the current Better Auth session from a Request or Headers.
 * Returns `null` when unauthenticated.
 */
export async function getSession(
  requestOrHeaders: Request | Headers,
  workerEnv: AuthEnv = env
): Promise<AuthSession | null> {
  const auth = createAuth(workerEnv)
  const result = await auth.api.getSession({
    headers: toHeaders(requestOrHeaders),
  })
  if (!result) return null

  const strictAdmin =
    result.user.role === "admin" &&
    isAdminEmail(result.user.email, workerEnv.ADMIN_EMAIL)

  return {
    session: result.session,
    user: result.user,
    isAdmin: strictAdmin,
  }
}

/**
 * Requires a valid authenticated session; throws `AuthHttpError(401)` otherwise.
 */
export async function requireAuth(
  requestOrHeaders: Request | Headers,
  workerEnv: AuthEnv = env
): Promise<AuthSession> {
  const current = await getSession(requestOrHeaders, workerEnv)
  if (!current) {
    throw new AuthHttpError(401, "Authentication required.")
  }
  return current
}

/**
 * Requires the strict single admin (`ADMIN_EMAIL` + `role === "admin"`).
 * Throws `AuthHttpError(401)` when unauthenticated or `AuthHttpError(403)`
 * for non-admin users.
 */
export async function requireAdmin(
  requestOrHeaders: Request | Headers,
  workerEnv: AuthEnv = env
): Promise<AuthSession> {
  const current = await requireAuth(requestOrHeaders, workerEnv)
  if (!current.isAdmin) {
    throw new AuthHttpError(403, "Admin access required.")
  }
  return current
}

/**
 * Converts an `AuthHttpError` to its JSON HTTP response, or returns `null`
 * for unrelated errors.
 */
export function toAuthErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthHttpError) {
    return error.toResponse()
  }
  return null
}
