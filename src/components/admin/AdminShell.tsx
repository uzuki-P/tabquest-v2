import type { ReactNode } from "react"

export function AdminShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="rt2-display text-4xl font-extrabold sm:text-5xl">
            {title}
          </h1>
          <p className="mt-1 text-[15px] text-[var(--rt-muted)]">{subtitle}</p>
        </div>
        {action}
      </header>

      {children}
    </div>
  )
}
