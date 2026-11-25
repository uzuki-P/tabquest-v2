import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function resolveAppVersion(): string {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    version?: string
  }
  const version = pkg.version ?? "0.0.0"
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? ""
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
    } catch {
      sha = "dev"
    }
  }
  return `v${version} (${sha})`
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Allow private Tailscale dev-route hostnames in dev.
    allowedHosts: true,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.test\\.tsx?$",
      },
    }),
    viteReact(),
  ],
})
