/**
 * Supplements Wrangler's generated `worker-configuration.d.ts` with runtime
 * secret/variable bindings that are configured via `.dev.vars` locally and
 * `wrangler secret put` in production.
 */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET?: string
    BETTER_AUTH_URL?: string
    SHOO_BASE_URL?: string
    SHOO_CLIENT_ID?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    ADMIN_EMAIL?: string
    VISION_API_URL?: string
    VISION_API_TOKEN?: string
    VISION_API_PROVIDER?: string
    VISION_API_MODEL?: string
    VISION_API_REASONING_EFFORT?: string
    CF_ACCESS_CLIENT_ID?: string
    CF_ACCESS_CLIENT_SECRET?: string
  }
}
