import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AdminShell } from "@/components/admin/AdminShell"
import { BillEditor } from "@/components/admin/BillEditor"
import type { BillEditorInitialData } from "@/components/admin/BillEditor"
import { PageLoading } from "@/components/telemetry/components"

export const Route = createFileRoute("/admin/bills/$billId/edit")({
  component: AdminEditBillPage,
})

function AdminEditBillPage() {
  const { billId } = Route.useParams()
  const [data, setData] = useState<BillEditorInitialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetch(`/api/admin/bills/${encodeURIComponent(billId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(
            res.status === 404
              ? "Bill not found."
              : errJson.error || `Failed to load bill (${res.status}).`
          )
        }
        return (await res.json()) as BillEditorInitialData
      })
      .then((detail) => {
        if (active) setData(detail)
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load bill.")
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [billId])

  if (loading) {
    return (
      <AdminShell title="Edit Bill" subtitle="Loading bill details...">
        <PageLoading label="Loading bill..." />
      </AdminShell>
    )
  }

  if (error || !data) {
    return (
      <AdminShell title="Edit Bill" subtitle="Unable to load this bill.">
        <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-8 text-center">
          <h2 className="rt2-display text-3xl font-extrabold">
            {error || "Bill not found"}
          </h2>
          <Link
            to="/admin"
            className="rt2-focus rt2-btn-primary mt-5 inline-flex min-h-[44px] items-center rounded px-5 text-[15px] font-bold"
          >
            Back to Admin Bills
          </Link>
        </section>
      </AdminShell>
    )
  }

  return <BillEditor key={data.bill.id} mode="edit" initialData={data} />
}
