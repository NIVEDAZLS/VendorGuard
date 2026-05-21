"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  MoreHorizontal,
  FileText,
  CheckCircle,
  Ban,
  Eye,
} from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDataStore } from "@/lib/store"
import { BreachAPI } from "@/lib/api"
import { CurrencyValue } from "@/components/shared/DynamicValues"
import { toast } from "sonner"
import type { Breach } from "@/lib/types"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "warning" | "success" | "destructive" }> = {
  open: { label: "Open", variant: "secondary" },
  claim_drafted: { label: "Claim drafted", variant: "warning" },
  claim_sent: { label: "Claim sent", variant: "default" },
  recovered: { label: "Recovered", variant: "success" },
  disputed: { label: "Disputed", variant: "destructive" },
}

const PAGE_SIZE = 25

export default function BreachesPage() {
  const { breaches, operationalEvents, vendors, slaRules } = useDataStore()

  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))
  const ruleMap = new Map(slaRules.map((r) => [r.id, r]))

  const totalOpenPenalty = breaches
    .filter((b) => b.status === "open" || b.status === "claim_drafted")
    .reduce((sum, b) => sum + b.penaltyAmount, 0)

  const filtered = useMemo(() => {
    let list = [...breaches].sort(
      (a, b) => b.penaltyAmount - a.penaltyAmount
    )
    if (vendorFilter !== "all") {
      const vendorEventIds = operationalEvents
        .filter((e) => e.vendorId === vendorFilter)
        .map((e) => e.id)
      list = list.filter((b) => vendorEventIds.includes(b.eventId))
    }
    if (statusFilter !== "all") {
      list = list.filter((b) => b.status === statusFilter)
    }
    return list
  }, [breaches, vendorFilter, statusFilter, operationalEvents])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleAction = async (b: Breach, action: string) => {
    const statusMap: Record<string, Breach["status"]> = {
      generate_claim: "claim_drafted",
      mark_recovered: "recovered",
      dispute: "disputed",
    }
    if (action === "view_claim") {
      toast("Claim view coming in next build")
      return
    }
    const newStatus = statusMap[action]
    if (newStatus) {
      await BreachAPI.updateStatus(b.id, newStatus)
      toast.success(`Breach ${b.id} marked as ${newStatus.replace("_", " ")}`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Breaches"
        description="Track SLA breaches and penalties"
      />

      {/* Total penalty stat */}
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Total open penalty
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              <CurrencyValue value={totalOpenPenalty} />
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="w-56">
          <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="claim_drafted">Claim drafted</SelectItem>
              <SelectItem value="claim_sent">Claim sent</SelectItem>
              <SelectItem value="recovered">Recovered</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 pl-4">Vendor</th>
              <th className="text-left font-medium p-3">Order</th>
              <th className="text-left font-medium p-3">Metric</th>
              <th className="text-left font-medium p-3">Breach date</th>
              <th className="text-left font-medium p-3">Overdue</th>
              <th className="text-right font-medium p-3">Penalty</th>
              <th className="text-left font-medium p-3">Status</th>
              <th className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {paged.map((b) => {
              const ev = eventMap.get(b.eventId)
              const v = ev ? vendorMap.get(ev.vendorId) : undefined
              const rule = ruleMap.get(b.ruleId)
              const initials = v?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "??"
              const s = statusConfig[b.status] ?? { label: b.status, variant: "secondary" }
              const hoursOverdue = b.evidence.hoursOverdue

              return (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3 pl-4">
                    <Link href={`/breaches/${b.id}`} className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]" suppressHydrationWarning>{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{v?.name ?? "—"}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {ev?.externalId ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {rule?.metricType.replace("_", " ") ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {new Date(b.breachedAt).toLocaleDateString("en-IN")}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                        hoursOverdue > 48
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {hoursOverdue}h
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <CurrencyValue value={b.penaltyAmount} />
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </Link>
                  </td>
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View
                        </DropdownMenuItem>
                        {b.status === "open" && (
                          <DropdownMenuItem onClick={() => handleAction(b, "generate_claim")}>
                            <FileText className="mr-2 h-3.5 w-3.5" /> Generate claim
                          </DropdownMenuItem>
                        )}
                        {b.status === "claim_sent" && (
                          <>
                            <DropdownMenuItem onClick={() => handleAction(b, "mark_recovered")}>
                              <CheckCircle className="mr-2 h-3.5 w-3.5" /> Mark recovered
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAction(b, "dispute")}>
                              <Ban className="mr-2 h-3.5 w-3.5" /> Dispute
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-muted-foreground">
                  No breaches detected yet. That&apos;s a good sign.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
