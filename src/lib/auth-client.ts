import { adminClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import { SHOO_PROVIDER_ID } from "@/lib/auth-policy"

export const authClient = createAuthClient({
  plugins: [adminClient()],
})

export const { useSession, signIn, signOut } = authClient

/**
 * Primary login: starts the Shoo OIDC + PKCE flow via Better Auth.
 * In Better Auth v1.7+, `genericOAuth` registers providers as first-class
 * social providers using the standard `signIn.social` endpoint.
 */
export function signInWithShoo(callbackURL = "/") {
  return authClient.signIn.social({
    provider: SHOO_PROVIDER_ID,
    callbackURL,
  })
}

/**
 * Optional fallback: starts direct Google OAuth when configured on the Worker.
 */
export function signInWithGoogle(callbackURL = "/") {
  return authClient.signIn.social({
    provider: "google",
    callbackURL,
  })
}
