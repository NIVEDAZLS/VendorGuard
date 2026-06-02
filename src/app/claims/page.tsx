"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Mail, Search, Clock, CheckCircle, XCircle, Pencil } from "lucide-react"
import { useDataStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/layout"
import { EmptyState } from "@/components/layout"
import { formatINR } from "@/lib/utils/format"

const claimStatusStyles: Record<string, "secondary" | "warning" | "success" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "warning",
  recovered: "success",
  disputed: "destructive",
}

const claimStatusLabel: Record<string, string> = {
  draft: "Pending Review",
  sent: "Sent · Awaiting Response",
  recovered: "Recovered",
  disputed: "Disputed",
}

export default function ClaimsPage() {
  const { claims, breaches, operationalEvents, vendors, atRiskItems, slaRules } = useDataStore()
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState("dispute-emails")

  const rows = useMemo(() => {
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
        if (!search) return true
        const q = search.toLowerCase()
        return (
          vendor?.name.toLowerCase().includes(q) ||
          claim.recipientEmail.toLowerCase().includes(q) ||
          claim.draftSubject.toLowerCase().includes(q) ||
          evt?.externalId.toLowerCase().includes(q) ||
          claim.id.toLowerCase().includes(q)
        )
      })
  }, [claims, breaches, operationalEvents, vendors, search])

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))
  const ruleMap = new Map(slaRules.map((r) => [r.id, r]))

  const atRiskRows = atRiskItems
    .filter((a) => a.status === "pending")
    .map((a) => {
      const ev = eventMap.get(a.eventId)
      const v = ev ? vendorMap.get(ev.vendorId) : undefined
      const rule = ruleMap.get(a.ruleId)
      return { item: a, vendor: v, event: ev, rule }
    })

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Dispute Review"
        description="Review dispute emails and manage pre-breach warnings"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="dispute-emails">
            Dispute Emails
            {rows.filter(({ claim }) => claim.status === "draft").length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {rows.filter(({ claim }) => claim.status === "draft").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pre-breach-warnings">
            Pre-Breach Warnings
            {atRiskRows.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {atRiskRows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dispute-emails" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No claims yet"
              description="Claims will appear here once they are drafted or sent."
            />
          ) : (
            <div className="space-y-4">
              {rows.map(({ claim, breach, event: evt, vendor }) => {
                const isPendingReview = claim.status === "draft"
                const isSent = claim.status === "sent"
                const statusVariant = claimStatusStyles[claim.status] ?? "secondary"
                const statusLabel = claimStatusLabel[claim.status] ?? claim.status

                return (
                  <Card key={claim.id} className="overflow-hidden">
                    <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3 border-b">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{vendor?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {claim.id} · {evt?.externalId ?? "—"}
                          {breach && ` · Penalty: ${formatINR(breach.penaltyAmount)}`}
                          {claim.createdAt && ` · Generated ${new Date(claim.createdAt).toLocaleDateString("en-IN")}`}
                        </p>
                      </div>
                      <Badge variant={statusVariant} className="shrink-0 text-xs">
                        {statusLabel}
                      </Badge>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {/* Email preview */}
                      <div className="vg-dispute-email-preview mb-4">
                        <p className="font-semibold mb-1">{claim.draftSubject}</p>
                        <p className="whitespace-pre-wrap">{claim.draftBody}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isPendingReview && (
                          <>
                            <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve &amp; Send
                            </Button>
                            <Link href={`/claims/${claim.id}`}>
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                                <Pencil className="h-3.5 w-3.5" />
                                Edit Draft
                              </Button>
                            </Link>
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-200">
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        {isSent && (
                          <>
                            <Link href={`/claims/${claim.id}`}>
                              <Button size="sm" variant="outline" className="h-8 text-xs">View Full Email</Button>
                            </Link>
                            <Button size="sm" variant="outline" className="h-8 text-xs">Send Follow-up</Button>
                          </>
                        )}
                        {!isPendingReview && !isSent && (
                          <Link href={`/claims/${claim.id}`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs">View Details</Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pre-breach-warnings" className="mt-4">
          {atRiskRows.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No active pre-breach warnings"
              description="At-risk items will appear here when SLA thresholds are approaching."
            />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3 pl-4">Vendor</th>
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">Warning Type</th>
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">SLA Rule</th>
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">Time Remaining</th>
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">Vendor Response</th>
                    <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground p-3 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskRows.map(({ item, vendor, event: _evt, rule }) => {
                    const hoursLeft = item.hoursRemaining
                    const isExpired = hoursLeft <= 0
                    const timeClass = isExpired
                      ? "text-red-600"
                      : hoursLeft < 4
                        ? "text-red-600"
                        : hoursLeft < 12
                          ? "text-amber-600"
                          : "text-emerald-600"

                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-4 font-semibold">{vendor?.name ?? "—"}</td>
                        <td className="p-3">
                          <span className="vg-status-pill bg-amber-50 text-amber-700">
                            <span className="vg-pulse-dot bg-amber-500" />
                            Pre-Breach
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {rule?.metricType.replace(/_/g, " ") ?? "—"}
                        </td>
                        <td className={`p-3 font-mono text-xs font-medium ${timeClass}`}>
                          {isExpired
                            ? "Expired → Breach"
                            : hoursLeft < 1
                              ? "<1 hr remaining"
                              : `${Math.round(hoursLeft)} hrs remaining`}
                        </td>
                        <td className="p-3">
                          <span className="vg-status-pill bg-muted text-muted-foreground">
                            <span className="vg-pulse-dot bg-muted-foreground" />
                            Awaiting
                          </span>
                        </td>
                        <td className="p-3 pr-4">
                          {isExpired ? (
                            <Link href={`/breaches`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs">View Breach</Button>
                            </Link>
                          ) : (
                            <Link href={`/breaches/${item.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs">Monitor</Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
