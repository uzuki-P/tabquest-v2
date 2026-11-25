import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { PageLoading } from "./components/telemetry/components"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 0,
    defaultPendingComponent: () => <PageLoading label="Loading page..." />,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
