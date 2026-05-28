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
  Mail,
  Search,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDataStore } from "@/lib/store"
import { BreachAPI } from "@/lib/api"
import { CurrencyValue } from "@/components/shared/DynamicValues"
import { FormattedDate } from "@/components/shared/DateDisplay"
import { EmptyState } from "@/components/layout"
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

const claimStatusStyles: Record<string, "secondary" | "warning" | "success" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "warning",
  recovered: "success",
  disputed: "destructive",
}

export default function BreachesPage() {
  const { breaches, operationalEvents, vendors, slaRules, claims } = useDataStore()

  const [activeTab, setActiveTab] = useState("breaches")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [claimSearch, setClaimSearch] = useState("")

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))
  const ruleMap = new Map(slaRules.map((r) => [r.id, r]))

  const claimRows = useMemo(() => {
    const sorted = [...claims].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return sorted
      .map((claim) => {
        const breach = breaches.find((b) => b.id === claim.breachId)
        const event = breach
          ? operationalEvents.find((e) => e.id === breach.eventId)
          : undefined
        const vendor = event
          ? vendors.find((v) => v.id === event.vendorId)
          : undefined

        return { claim, breach, event, vendor }
      })
      .filter(({ claim, vendor, event: evt }) => {
        if (!claimSearch) return true
        const q = claimSearch.toLowerCase()
        return (
          vendor?.name.toLowerCase().includes(q) ||
          claim.recipientEmail.toLowerCase().includes(q) ||
          claim.draftSubject.toLowerCase().includes(q) ||
          evt?.externalId.toLowerCase().includes(q) ||
          claim.id.toLowerCase().includes(q)
        )
      })
  }, [claims, breaches, operationalEvents, vendors, claimSearch])

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
    if (action === "generate_claim") {
      await BreachAPI.updateStatus(b.id, "claim_drafted")
      toast.success("Claim generated — redirecting to breach details")
      window.location.href = `/breaches/${b.id}`
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
        title="Breaches & Claims"
        description="Track SLA breaches, penalties, and claims"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="breaches">Breaches</TabsTrigger>
          <TabsTrigger value="claims">Claims</TabsTrigger>
        </TabsList>

        <TabsContent value="breaches" className="space-y-6 mt-6">
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
                        {b.status === "open" ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => handleAction(b, "generate_claim")}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Generate claim
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-32">
                                <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                                  <Eye className="mr-2 h-3.5 w-3.5" /> View
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : b.status === "claim_sent" ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => handleAction(b, "mark_recovered")}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Recovered
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700"
                              onClick={() => handleAction(b, "dispute")}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Dispute
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-32">
                                <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                                  <Eye className="mr-2 h-3.5 w-3.5" /> View
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> View
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
        </TabsContent>

        <TabsContent value="claims" className="space-y-6 mt-6">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              className="pl-8 h-9"
              value={claimSearch}
              onChange={(e) => setClaimSearch(e.target.value)}
            />
          </div>

          {claimRows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No claims yet"
              description="Claims will appear here once they are drafted or sent."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim ID</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Breach</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Drafted</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claimRows.map(({ claim, vendor }) => (
                    <TableRow key={claim.id}>
                      <TableCell>
                        <Link
                          href={`/claims/${claim.id}`}
                          className="font-mono text-xs text-emerald-600 hover:underline"
                        >
                          {claim.id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {vendor?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {breaches.find((b) => b.id === claim.breachId) ? (
                          <Link
                            href={`/breaches/${claim.breachId}`}
                            className="text-xs text-emerald-600 hover:underline font-mono"
                          >
                            {claim.breachId}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">
                            {claim.breachId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {claim.recipientEmail}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                        <FormattedDate date={claim.createdAt} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                        {claim.sentAt
                          ? <FormattedDate date={claim.sentAt} />
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={claimStatusStyles[claim.status] ?? "secondary"}
                          className="text-xs"
                        >
                          {claim.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
