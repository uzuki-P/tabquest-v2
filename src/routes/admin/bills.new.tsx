import { createFileRoute } from "@tanstack/react-router"

import { BillEditor } from "@/components/admin/BillEditor"

export const Route = createFileRoute("/admin/bills/new")({
  component: AdminNewBillPage,
})

function AdminNewBillPage() {
  return <BillEditor mode="create" />
}
