export function downloadEvidenceCSV(params: {
  externalId: string
  shippedAt: string
  deadlineAt: string
  deliveredAt: string | null
  hoursOverdue: number
  contractClause: string
  orderValue: number
  penaltyAmount: number
}) {
  const rows = [
    ["Field", "Value"],
    ["Order Reference", params.externalId],
    ["Shipped At", params.shippedAt],
    ["Scheduled Delivery", params.deadlineAt],
    ["Actual Delivery", params.deliveredAt ?? "Not delivered"],
    ["Hours Overdue", String(params.hoursOverdue)],
    ["Contract Clause", params.contractClause],
    ["Order Value", `₹${params.orderValue.toLocaleString("en-IN")}`],
    ["Penalty Amount", `₹${params.penaltyAmount.toLocaleString("en-IN")}`],
  ]
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\r\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `evidence_${params.externalId.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
